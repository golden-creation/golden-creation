#!/bin/bash
# Golden Creation code deployment.
# Copy to /opt/goldencreation/deploy.sh only after review.
# This script never imports, restores, or replaces a database.
set -euo pipefail
set +x

DRY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    *) echo "STOP: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if ! [[ "${DEPLOY_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "STOP: set DEPLOY_SHA to the approved 40-character commit"
  exit 1
fi

TEST_DB="${GC_TEST_DB_NAME:-}"
case "$TEST_DB" in
  lekhanmart_itest|gc_ci) ;;
  *) echo "STOP: GC_TEST_DB_NAME must be lekhanmart_itest or gc_ci"; exit 1 ;;
esac
if [ "$TEST_DB" = "goldencreation_db" ]; then
  echo "STOP: refusing the production database"
  exit 1
fi

ROOT="${GC_ROOT:-/opt/goldencreation}"
REPO="${REPO:-https://github.com/golden-creation/golden-creation.git}"
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
LOCK="$ROOT/deploy.lock"
ENV_FILE="$ROOT/shared/.env"
CI_ENV="${GC_CI_ENV:-$ROOT/gc-ci.env}"
BACKUP_DIR="$ROOT/backups/db"
LOG_DIR="$ROOT/logs"
SOURCE_DB=goldencreation_db
TEST_HOST="${GC_TEST_DB_HOST:-127.0.0.1}"
TEST_PORT="${GC_TEST_DB_PORT:-3306}"
TEST_USER="${GC_TEST_DB_USER:-}"

if [ -z "$TEST_USER" ] || [ "$TEST_USER" = "gc_restore" ]; then
  echo "STOP: set GC_TEST_DB_USER to an isolated test user"
  exit 1
fi
if [ "$TEST_DB" = "gc_ci" ] && [ "$TEST_USER" != "gc_ci_user" ]; then
  echo "STOP: gc_ci must be used with GC_TEST_DB_USER=gc_ci_user"
  exit 1
fi

echo "dry_run=$DRY"
echo "approved_commit=$DEPLOY_SHA"
echo "test_database=$TEST_DB"
echo "test_user=$TEST_USER"
echo "production_database_import=no"
echo "automatic_database_restore=no"

file_mode() {
  stat -c %a "$1" 2>/dev/null || stat -f %OLp "$1"
}

read_secret() {
  local file="$1" key="$2" line value=""
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "${key}="*) value="${line#"${key}"=}" ;;
    esac
  done < "$file"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

resolve_current() {
  if [ -L "$CURRENT" ]; then
    readlink -f "$CURRENT"
  elif [ "${GC_SIMULATE:-}" = 1 ] && [ -f "$CURRENT.link" ]; then
    cat "$CURRENT.link"
  else
    echo "STOP: current is not a symlink" >&2
    return 1
  fi
}

replace_current() {
  if [ "${GC_SIMULATE:-}" = 1 ]; then
    printf '%s\n' "$1" > "$CURRENT.link"
    return
  fi
  local next="${CURRENT}.next"
  rm -f "$next"
  ln -s "$1" "$next"
  mv -Tf "$next" "$CURRENT"
}

verify_pm2_cwd() {
  local expected pid actual
  expected=$(readlink -f "$1")
  if [ "${GC_SIMULATE:-}" = 1 ]; then
    pm2 jlist | node --input-type=module -e '
let text = "";
process.stdin.on("data", (chunk) => { text += chunk; });
process.stdin.on("end", () => {
  const matches = JSON.parse(text).filter((item) => item.name === "goldencreation-api");
  if (matches.length !== 1) process.exit(1);
  const cwd = matches[0].pm2_env && matches[0].pm2_env.pm_cwd;
  if (cwd !== process.argv[1]) process.exit(1);
});
' "$expected"
    return
  fi
  pid=$(pm2 pid goldencreation-api | head -n 1 | tr -d '[:space:]')
  if ! [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "STOP: goldencreation-api process was not found" >&2
    return 1
  fi
  actual=$(readlink -f "/proc/${pid}/cwd")
  if [ "$actual" != "$expected" ]; then
    echo "STOP: running process directory is not the expected release" >&2
    return 1
  fi
  echo "pm2_cwd=$actual"
}

write_client_defaults() {
  CLIENT_DEFAULTS=$(mktemp)
  chmod 600 "$CLIENT_DEFAULTS"
  {
    printf '%s\n' "[client]"
    printf '%s\n' "protocol=tcp"
    printf 'host=%s\n' "$TEST_HOST"
    printf 'port=%s\n' "$TEST_PORT"
    printf 'user=%s\n' "$TEST_USER"
    printf 'password=%s\n' "$TEST_PASSWORD"
  } > "$CLIENT_DEFAULTS"
  chmod 600 "$CLIENT_DEFAULTS"
}

schema_count() {
  mariadb --batch --skip-column-names -e "$1" | grep -qx 1
}

preflight() {
  local command_name mode
  for command_name in git node npm mariadb mariadb-dump pm2 curl sha256sum; do
    command -v "$command_name" >/dev/null
  done
  echo "preflight_commands=ok"

  test -f "$ENV_FILE"
  if [ "${GC_SIMULATE:-}" != 1 ]; then
    mode=$(file_mode "$ENV_FILE")
    test "$mode" = "600"
  fi
  node --input-type=module -e '
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(process.argv[1], "utf8").split(/\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^["'\'']|["'\'']$/g, "")];
}));
if (env.NODE_ENV !== "production") process.exit(1);
if (env.DB_NAME !== "goldencreation_db") process.exit(1);
if (env.DB_USER === "gc_restore" || env.DB_USER === "gc_ci_user") process.exit(1);
if (/^(1|true|yes|on)$/i.test(env.GC_ISOLATED_TEST || "")) process.exit(1);
if ((env.DOTENV_CONFIG_PATH || "").includes(".env.test")) process.exit(1);
' "$ENV_FILE"
  echo "preflight_production_env=ok"

  test -f "$CI_ENV"
  if [ "${GC_SIMULATE:-}" != 1 ]; then
    mode=$(file_mode "$CI_ENV")
    test "$mode" = "600"
  fi
  TEST_PASSWORD=$(read_secret "$CI_ENV" DB_PASSWORD)
  test -n "$TEST_PASSWORD"
  echo "preflight_test_secret=ok"

  PREVIOUS=$(resolve_current)
  test -d "$PREVIOUS"
  echo "previous_release=$PREVIOUS"

  FREE=$(df -B1 --output=avail "$ROOT" | tail -1)
  test "$FREE" -gt 2000000000
  echo "preflight_disk=ok"

  write_client_defaults
  mariadb --defaults-file="$CLIENT_DEFAULTS" --batch --skip-column-names -e "SELECT DATABASE()" "$TEST_DB" | grep -qx "$TEST_DB"
  echo "preflight_test_database=ok"
  set +e
  mariadb --defaults-file="$CLIENT_DEFAULTS" --batch -e "SELECT 1" "$SOURCE_DB" >/dev/null 2>&1
  local deny=$?
  set -e
  if [ "$deny" -eq 0 ]; then
    echo "STOP: the test user can access the production database" >&2
    exit 1
  fi
  echo "production_database_denied=yes"

  schema_count "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='checkout_attempts'"
  schema_count "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='orders' AND COLUMN_NAME='checkout_attempt_id'"
  schema_count "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='checkout_attempts' AND INDEX_NAME='uq_checkout_attempt_key' AND NON_UNIQUE=0"
  schema_count "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='orders' AND INDEX_NAME='uq_orders_checkout_attempt' AND NON_UNIQUE=0"
  local payment_column
  for payment_column in \
    payment_settings:cod_min_amount \
    payment_settings:cod_max_amount \
    payment_settings:cod_pin_restricted \
    payment_settings:cod_pins \
    payment_settings:porter_enabled \
    payment_settings:porter_pins \
    payment_settings:porter_collects_cod \
    orders:delivery_method \
    orders:partial_advance_percent \
    orders:porter_booking_reference \
    orders:porter_status
  do
    if ! schema_count "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='${payment_column%%:*}' AND COLUMN_NAME='${payment_column#*:}'"; then
      echo "STOP: missing production column ${payment_column}" >&2
      exit 1
    fi
  done
  echo "preflight_payment_columns=ok"
  local audit_column
  for audit_column in admin_id session_id request_id source layer outcome changed_fields previous_hash row_hash; do
    if ! schema_count "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='admin_audit_events' AND COLUMN_NAME='${audit_column}'"; then
      echo "STOP: missing production audit column admin_audit_events.${audit_column}" >&2
      exit 1
    fi
  done
  echo "preflight_audit=ok"
  if ! schema_count "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${SOURCE_DB}' AND TRIGGER_NAME='admin_audit_events_no_update'"; then
    echo "STOP: missing append-only audit update trigger" >&2
    exit 1
  fi
  if ! schema_count "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${SOURCE_DB}' AND TRIGGER_NAME='admin_audit_events_no_delete'"; then
    echo "STOP: missing append-only audit delete trigger" >&2
    exit 1
  fi
  echo "preflight_audit_triggers=ok"
  echo "preflight_schema=ok"
  rm -f "$CLIENT_DEFAULTS"
  unset CLIENT_DEFAULTS
}

SWITCHED=0
finish() {
  status=$?
  if [ "$SWITCHED" = 1 ] && [ "$status" -ne 0 ]; then
    set +e
    replace_current "$PREVIOUS"
    pointer_status=$?
    pm2 restart goldencreation-api --update-env
    pm2_status=$?
    sleep 3
    verify_pm2_cwd "$PREVIOUS"
    cwd_status=$?
    resolved=$(resolve_current)
    resolve_status=$?
    set -e
    if [ "$pointer_status" -ne 0 ] || [ "$pm2_status" -ne 0 ] || [ "$cwd_status" -ne 0 ] || [ "$resolve_status" -ne 0 ] || [ "$resolved" != "$PREVIOUS" ]; then
      echo "code_rollback=failed previous=$PREVIOUS database_unchanged=yes" >&2
      status=1
    else
      echo "code_rollback=$PREVIOUS database_unchanged=yes"
    fi
  fi
  if [ -n "${CLIENT_DEFAULTS:-}" ]; then
    rm -f "$CLIENT_DEFAULTS"
  fi
  if [ -n "${RUNTIME_ENV:-}" ]; then
    rm -f "$RUNTIME_ENV"
  fi
  if [ -n "${ISOLATED_HOME:-}" ]; then
    rm -rf "$ISOLATED_HOME"
  fi
  exit "$status"
}
trap finish EXIT

preflight

if [ "$DRY" = 1 ]; then
  echo "dry_run_plan=read_only_preflight_only"
  echo "dry_run_status=ok"
  exit 0
fi

mkdir -p "$LOG_DIR"
exec 9>"$LOCK"
flock -n 9 || { echo "STOP: another deployment is running"; exit 1; }

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$LOG_DIR/deploy-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1

write_client_defaults
RUNTIME_ENV=$(mktemp)
chmod 600 "$RUNTIME_ENV"
{
  printf '%s\n' "GC_ISOLATED_TEST=true"
  printf '%s\n' "PORT=5001"
  printf '%s\n' "NODE_ENV=development"
  printf 'DB_HOST=%s\n' "$TEST_HOST"
  printf 'DB_PORT=%s\n' "$TEST_PORT"
  printf 'DB_USER=%s\n' "$TEST_USER"
  printf 'DB_PASSWORD=%s\n' "$TEST_PASSWORD"
  printf 'DB_NAME=%s\n' "$TEST_DB"
  printf '%s\n' "RUN_STARTUP_JOBS=false"
  printf '%s\n' "MAILER_CLOUD_ENABLED=false"
  printf '%s\n' "NIMBUS_SMS_ENABLED=false"
} > "$RUNTIME_ENV"
chmod 600 "$RUNTIME_ENV"
ISOLATED_HOME=$(mktemp -d)
chmod 700 "$ISOLATED_HOME"
: > "$ISOLATED_HOME/aws-credentials"
: > "$ISOLATED_HOME/aws-config"
chmod 600 "$ISOLATED_HOME/aws-credentials" "$ISOLATED_HOME/aws-config"

WORK=$(mktemp -d)
if [ "${GC_SIMULATE:-}" = 1 ]; then
  mkdir -p "$WORK/src"
  cp -a "${GC_SOURCE:?}/." "$WORK/src/"
  SHA=$(git -C "$WORK/src" rev-parse HEAD)
else
  git init -q "$WORK/src"
  git -C "$WORK/src" remote add origin "$REPO"
  git -C "$WORK/src" fetch --depth 1 origin "$DEPLOY_SHA"
  git -C "$WORK/src" checkout --detach FETCH_HEAD
  SHA=$(git -C "$WORK/src" rev-parse HEAD)
fi
test "$SHA" = "$DEPLOY_SHA"
echo "commit=$SHA"

RELEASE="$RELEASES/$STAMP"
mkdir -p "$RELEASE"
cp -a "$WORK/src/backend/." "$RELEASE/"
rm -rf "$RELEASE/node_modules" "$RELEASE/public/assets" "$RELEASE/public/admin"
test ! -f "$RELEASE/.env"
test "$RELEASE" != "$PREVIOUS"

clear_frontend_env() {
  rm -f \
    "$1/.env" \
    "$1/.env.local" \
    "$1/.env.production" \
    "$1/.env.production.local" \
    "$1/.env.development" \
    "$1/.env.development.local"
}

reject_loopback_bundle() {
  if grep -R -E -q "https?://(localhost|127\\.0\\.0\\.1):5000" "$1" --include='*.js' --include='*.html' --include='*.css'; then
    echo "STOP: production bundle contains a loopback API address in $1" >&2
    exit 1
  fi
}

resolve_recaptcha_site_key() {
  local from_env committed
  from_env=$(read_secret "$ENV_FILE" VITE_RECAPTCHA_SITE_KEY)
  if [ -z "$from_env" ]; then
    from_env=$(read_secret "$ENV_FILE" RECAPTCHA_SITE_KEY)
  fi
  committed=$(sed -n 's/^export const publicRecaptchaSiteKey = "\([^"]*\)";/\1/p' "$WORK/src/frontend/src/lib/publicFrontendConfig.js")
  if [ -n "$from_env" ]; then
    case "$from_env" in
      your_google*|changeme|*placeholder*)
        echo "STOP: production reCAPTCHA site key is a placeholder" >&2
        exit 1
        ;;
    esac
    if ! [[ "$from_env" =~ ^6L[A-Za-z0-9_-]{20,}$ ]]; then
      echo "STOP: production reCAPTCHA site key is not a public site key" >&2
      exit 1
    fi
    printf '%s' "$from_env"
    return
  fi
  if ! [[ "$committed" =~ ^6L[A-Za-z0-9_-]{20,}$ ]]; then
    echo "STOP: the storefront is missing its public reCAPTCHA site key" >&2
    exit 1
  fi
  printf '%s' "$committed"
}

require_recaptcha_site_key() {
  if ! grep -R -F -q -- "$1" "$2"; then
    echo "STOP: storefront bundle is missing the reCAPTCHA site key" >&2
    exit 1
  fi
}

clear_frontend_env "$WORK/src/frontend"
clear_frontend_env "$WORK/src/saas-panel"
RECAPTCHA_SITE_KEY=$(resolve_recaptcha_site_key)
export VITE_RECAPTCHA_SITE_KEY="$RECAPTCHA_SITE_KEY"
(
  cd "$WORK/src/frontend"
  npm ci && npm run lint && node --test test/*.test.js
  NODE_ENV=production VITE_API_BASE_URL=/api VITE_SITE_BASE_URL= VITE_RECAPTCHA_SITE_KEY="$VITE_RECAPTCHA_SITE_KEY" npm run build
)
(
  cd "$WORK/src/saas-panel"
  npm ci && npm run lint
  NODE_ENV=production VITE_API_BASE_URL=/api VITE_SITE_BASE_URL= npm run build
)
reject_loopback_bundle "$WORK/src/frontend/dist"
reject_loopback_bundle "$WORK/src/saas-panel/dist"
require_recaptcha_site_key "$RECAPTCHA_SITE_KEY" "$WORK/src/frontend/dist"
echo "production_api_bundle=same_origin"
echo "production_recaptcha_site_key=present"
cp -a "$WORK/src/frontend/dist/." "$RELEASE/public/"
mkdir -p "$RELEASE/public/admin"
cp -a "$WORK/src/saas-panel/dist/." "$RELEASE/public/admin/"
if [ ! -f "$PREVIOUS/public/.well-known/assetlinks.json" ]; then
  echo "STOP: previous release is missing Android assetlinks.json"
  exit 1
fi
mkdir -p "$RELEASE/public/.well-known"
cp "$PREVIOUS/public/.well-known/assetlinks.json" "$RELEASE/public/.well-known/assetlinks.json"
cmp -s "$PREVIOUS/public/.well-known/assetlinks.json" "$RELEASE/public/.well-known/assetlinks.json"
echo "android_assetlinks=preserved"
test -s "$RELEASE/routes/order.routes.js"
test -s "$RELEASE/public/index.html"
test -s "$RELEASE/public/admin/index.html"
ASSET=$(grep -o 'assets/index-[^" ]*\.js' "$RELEASE/public/index.html" | head -1)
test -n "$ASSET"
test -s "$RELEASE/public/$ASSET"

run_isolated() {
  env -i \
    PATH="$PATH" \
    HOME="$ISOLATED_HOME" \
    USER="${USER:-deploy}" \
    NODE_ENV=development \
    GC_ISOLATED_TEST=true \
    DOTENV_CONFIG_PATH="$RUNTIME_ENV" \
    PORT=5001 \
    DB_HOST="$TEST_HOST" \
    DB_PORT="$TEST_PORT" \
    DB_USER="$TEST_USER" \
    DB_PASSWORD="$TEST_PASSWORD" \
    DB_NAME="$TEST_DB" \
    RUN_STARTUP_JOBS=false \
    MAILER_CLOUD_ENABLED=false \
    NIMBUS_SMS_ENABLED=false \
    RAZORPAY_KEY_ID= \
    RAZORPAY_KEY_SECRET= \
    RAZORPAY_WEBHOOK_SECRET= \
    DO_SPACES_BUCKET= \
    DO_SPACES_ACCESS_KEY_ID= \
    DO_SPACES_SECRET_KEY= \
    DO_SPACES_REGION= \
    DO_SPACES_ENDPOINT= \
    AWS_EC2_METADATA_DISABLED=true \
    AWS_SHARED_CREDENTIALS_FILE="$ISOLATED_HOME/aws-credentials" \
    AWS_CONFIG_FILE="$ISOLATED_HOME/aws-config" \
    AWS_ACCESS_KEY_ID= \
    AWS_SECRET_ACCESS_KEY= \
    AWS_SESSION_TOKEN= \
    AWS_PROFILE= \
    AWS_CONTAINER_CREDENTIALS_RELATIVE_URI= \
    AWS_CONTAINER_CREDENTIALS_FULL_URI= \
    AWS_WEB_IDENTITY_TOKEN_FILE= \
    S3_BUCKET= \
    S3_ACCESS_KEY_ID= \
    S3_SECRET_ACCESS_KEY= \
    WHATSAPP_TOKEN= \
    WHATSAPP_API_TOKEN= \
    WHATSAPP_PHONE_NUMBER_ID= \
    DELHIVERY_API_TOKEN= \
    DELHIVERY_TOKEN= \
    "$@"
}

CHECKOUT="$WORK/src"
test -d "$CHECKOUT/backend"
test -d "$CHECKOUT/frontend"
test -d "$CHECKOUT/saas-panel"
test -f "$CHECKOUT/backend/test/product-import.test.js"
test -f "$CHECKOUT/saas-panel/src/lib/spreadsheetImport.js"
test ! -d "$(dirname "$RELEASE")/saas-panel"
test "$RELEASE" != "$CHECKOUT/backend"
echo "checkout_backend=$CHECKOUT/backend"
echo "checkout_admin=$CHECKOUT/saas-panel"
echo "release_backend=$RELEASE"

(cd "$CHECKOUT/backend" && npm ci)
test -d "$CHECKOUT/backend/node_modules"
test -d "$CHECKOUT/saas-panel/node_modules/jszip"
if [ "${GC_SIMULATE:-}" != 1 ]; then
  (
    cd "$CHECKOUT/backend"
    run_isolated node scripts/ensure-admin-modules-schema.js
    run_isolated node scripts/ensure-orders-schema.js
    run_isolated node scripts/ensure-customer-mobile-schema.js
    run_isolated node scripts/ensure-commerce-media-schema.js
    run_isolated node scripts/ensure-referral-affiliate-schema.js
    run_isolated node scripts/itest-fixtures.js
  )
  echo "test_database_initialized=synthetic"
fi
(
  cd "$CHECKOUT/backend"
  test "$(pwd -P)" = "$(cd "$CHECKOUT/backend" && pwd -P)"
  test "$(pwd -P)" != "$(cd "$RELEASE" && pwd -P)"
  run_isolated npm test
)
echo "isolated_tests=ok"
echo "isolated_test_cwd=$CHECKOUT/backend"

(cd "$RELEASE" && npm ci)

mkdir -p "$BACKUP_DIR"
if [ "${GC_SIMULATE:-}" != 1 ]; then
  chmod 700 "$BACKUP_DIR"
fi
DUMP="$BACKUP_DIR/${SOURCE_DB}-${STAMP}.sql"
mariadb-dump --single-transaction --quick --routines --triggers --events --skip-add-drop-table --default-character-set=utf8mb4 --hex-blob --result-file="$DUMP" "$SOURCE_DB"
test -s "$DUMP"
sha256sum "$DUMP" | tee "$DUMP.sha256"
sha256sum -c "$DUMP.sha256"
if grep -q "CREATE DATABASE" "$DUMP"; then
  echo "STOP: backup contains CREATE DATABASE"
  exit 1
fi
grep -q "checkout_attempts" "$DUMP"
if [ "${GC_SIMULATE:-}" != 1 ]; then
  chmod 600 "$DUMP" "$DUMP.sha256"
  test "$(file_mode "$DUMP")" = "600"
  test "$(file_mode "$DUMP.sha256")" = "600"
fi
echo "backup_verified=yes"

cp "$ENV_FILE" "$RELEASE/.env"
if [ "${GC_SIMULATE:-}" != 1 ]; then
  chmod 600 "$RELEASE/.env"
fi

replace_current "$RELEASE"
SWITCHED=1
test "$(resolve_current)" = "$RELEASE"
pm2 restart goldencreation-api --update-env
sleep 3
verify_pm2_cwd "$RELEASE"

curl -fsS http://127.0.0.1:5000/api/health | grep -q '"status":"ok"'
curl -fsS https://www.goldencreation.in/ | grep -F "$ASSET"
curl -fsS https://admin.goldencreation.in/ | grep -q 'assets/'

echo "deployment_status=ok commit=$SHA release=$RELEASE previous=$PREVIOUS"
SWITCHED=0
rm -rf "$WORK"
exit 0

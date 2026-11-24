#!/bin/bash
# Golden Creation code deployment.
# Copy to /opt/goldencreation/deploy.sh only after review.
# This script never imports, restores, or replaces a database.
set -euo pipefail

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

echo "dry_run=$DRY"
echo "approved_commit=$DEPLOY_SHA"
echo "test_database=$TEST_DB"
echo "production_database_import=no"
echo "automatic_database_restore=no"

if [ "$DRY" = 1 ]; then
  echo "dry_run_plan=lock,fetch_exact_sha,new_release,npm_ci,build,isolated_tests,schema_check,backup,symlink,pm2,health,code_rollback_only"
  echo "dry_run_status=ok"
  exit 0
fi

mkdir -p "$LOG_DIR"
exec 9>"$LOCK"
flock -n 9 || { echo "STOP: another deployment is running"; exit 1; }

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$LOG_DIR/deploy-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1
SWITCHED=0
PREVIOUS=""
rollback_code() {
  status=$?
  if [ "$SWITCHED" = 1 ] && [ "$status" -ne 0 ]; then
    replace_current "$PREVIOUS"
    pm2 restart goldencreation-api --update-env || true
    echo "code_rollback=$PREVIOUS database_unchanged=yes"
  fi
  exit "$status"
}
trap rollback_code EXIT

for command_name in git node npm mariadb mariadb-dump pm2 curl sha256sum; do
  command -v "$command_name" >/dev/null
done
test -f "$ENV_FILE"
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
  else
    ln -sfn "$1" "$CURRENT"
  fi
}
PREVIOUS=$(resolve_current)
test -d "$PREVIOUS"
echo "previous_release=$PREVIOUS"

node --input-type=module -e '
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(process.argv[1], "utf8").split(/\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).replace(/^["'\'']|["'\'']$/g, "")];
}));
if (env.NODE_ENV !== "production") process.exit(1);
if (env.DB_NAME !== "goldencreation_db") process.exit(1);
if (env.DB_USER === "gc_restore") process.exit(1);
if (/^(1|true|yes|on)$/i.test(env.GC_ISOLATED_TEST || "")) process.exit(1);
if ((env.DOTENV_CONFIG_PATH || "").includes(".env.test")) process.exit(1);
' "$ENV_FILE"
echo "production_env_checked=yes"

FREE=$(df -B1 --output=avail "$ROOT" | tail -1)
test "$FREE" -gt 2000000000

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

(cd "$WORK/src/frontend" && npm ci && npm run lint && node --test test/*.test.js && npm run build)
(cd "$WORK/src/saas-panel" && npm ci && npm run lint && npm run build)
cp -a "$WORK/src/frontend/dist/." "$RELEASE/public/"
mkdir -p "$RELEASE/public/admin"
cp -a "$WORK/src/saas-panel/dist/." "$RELEASE/public/admin/"
if [ -f "$PREVIOUS/public/.well-known/assetlinks.json" ]; then
  mkdir -p "$RELEASE/public/.well-known"
  cp "$PREVIOUS/public/.well-known/assetlinks.json" "$RELEASE/public/.well-known/assetlinks.json"
fi
test -s "$RELEASE/public/index.html"
test -s "$RELEASE/public/admin/index.html"
ASSET=$(grep -o 'assets/index-[^" ]*\.js' "$RELEASE/public/index.html" | head -1)
test -n "$ASSET"
test -s "$RELEASE/public/$ASSET"

mariadb --protocol=tcp -h "$TEST_HOST" -P "$TEST_PORT" -u "$TEST_USER" --batch --skip-column-names -e "SELECT DATABASE()" "$TEST_DB" | grep -qx "$TEST_DB"
(cd "$RELEASE" && npm ci)
(
  cd "$RELEASE"
  env -u DB_PASSWORD -u RAZORPAY_KEY_ID -u RAZORPAY_KEY_SECRET -u RAZORPAY_WEBHOOK_SECRET \
    NODE_ENV=development \
    DB_HOST="$TEST_HOST" \
    DB_PORT="$TEST_PORT" \
    DB_USER="$TEST_USER" \
    DB_NAME="$TEST_DB" \
    RUN_STARTUP_JOBS=false \
    MAILER_CLOUD_ENABLED=false \
    NIMBUS_SMS_ENABLED=false \
    npm test
)

schema_count() {
  mariadb --batch --skip-column-names -e "$1" | grep -qx 1
}
schema_count "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='checkout_attempts'"
schema_count "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='orders' AND COLUMN_NAME='checkout_attempt_id'"
schema_count "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='checkout_attempts' AND INDEX_NAME='uq_checkout_attempt_key' AND NON_UNIQUE=0"
schema_count "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='orders' AND INDEX_NAME='uq_orders_checkout_attempt' AND NON_UNIQUE=0"

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

cp "$ENV_FILE" "$RELEASE/.env"
if [ "${GC_SIMULATE:-}" != 1 ]; then
  chmod 600 "$RELEASE/.env"
fi

replace_current "$RELEASE"
SWITCHED=1
test "$(resolve_current)" = "$RELEASE"
pm2 restart goldencreation-api --update-env
sleep 3
pm2 jlist | node --input-type=module -e '
let text = "";
process.stdin.on("data", (chunk) => { text += chunk; });
process.stdin.on("end", () => {
  const matches = JSON.parse(text).filter((item) => item.name === "goldencreation-api");
  if (matches.length !== 1) process.exit(1);
  const cwd = matches[0].pm2_env && matches[0].pm2_env.pm_cwd;
  if (cwd !== process.argv[1]) process.exit(1);
});
' "$RELEASE"

curl -fsS http://127.0.0.1:5000/api/health | grep -q '"status":"ok"'
curl -fsS https://www.goldencreation.in/ | grep -F "$ASSET"
curl -fsS https://admin.goldencreation.in/ | grep -q 'assets/'

echo "deployment_status=ok commit=$SHA release=$RELEASE previous=$PREVIOUS"
SWITCHED=0
rm -rf "$WORK"
trap - EXIT
exit 0

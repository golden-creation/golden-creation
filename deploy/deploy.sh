#!/bin/bash
# Prepare a new Golden Creation release from GitHub main.
# Do not run this until it has been reviewed and copied to the VPS.
# It never imports, restores, or replaces the production database.
set -euo pipefail

REPO="${REPO:-https://github.com/golden-creation/golden-creation.git}"
BRANCH="${BRANCH:-main}"
ROOT=/opt/goldencreation
RELEASES="$ROOT/releases"
CURRENT="$ROOT/current"
LOCK="$ROOT/deploy.lock"
ENV_FILE="$ROOT/shared/.env"
BACKUP_DIR="$ROOT/backups/db"
LOG_DIR="$ROOT/logs"
SOURCE_DB=goldencreation_db

exec 9>"$LOCK"
flock -n 9 || { echo "STOP: another deployment is running"; exit 1; }

mkdir -p "$LOG_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOG="$LOG_DIR/deploy-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1
SWITCHED=0
rollback_code() {
  status=$?
  if [ "$SWITCHED" = 1 ] && [ "$status" -ne 0 ]; then
    ln -sfn "$PREVIOUS" "$CURRENT"
    pm2 restart goldencreation-api --update-env || true
    echo "code_rollback=$PREVIOUS database_unchanged=yes"
  fi
  exit "$status"
}
trap rollback_code EXIT

echo "deployment_stamp=$STAMP"
command -v git >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v mariadb >/dev/null
command -v mariadb-dump >/dev/null
command -v pm2 >/dev/null
test -f "$ENV_FILE"
PREVIOUS=$(readlink -f "$CURRENT")
echo "previous_release=$PREVIOUS"

WORK=$(mktemp -d)
git clone --branch "$BRANCH" --depth 1 "$REPO" "$WORK/src"
SHA=$(git -C "$WORK/src" rev-parse HEAD)
echo "commit=$SHA"
test "$(git -C "$WORK/src" branch --show-current)" = "main"

FREE=$(df -B1 --output=avail "$ROOT" | tail -1)
test "$FREE" -gt 2000000000 || { echo "STOP: less than 2GB free"; exit 1; }

RELEASE="$RELEASES/$STAMP"
mkdir -p "$RELEASE"
cp -a "$WORK/src/backend/." "$RELEASE/"
rm -rf "$RELEASE/node_modules" "$RELEASE/public/assets" "$RELEASE/public/admin"
test ! -f "$RELEASE/.env"

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

(cd "$RELEASE" && npm ci --omit=dev)
(cd "$RELEASE" && NODE_ENV=development DB_HOST=127.0.0.1 DB_NAME=lekhanmart_itest npm test)

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
test "${NODE_ENV:-}" = "production"
test "${DB_NAME:-}" = "$SOURCE_DB"
test "${DB_USER:-}" != "gc_restore"
test "${GC_ISOLATED_TEST:-}" != "true"

mariadb --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='checkout_attempts';" | grep -qx 1
mariadb --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_NAME='orders' AND COLUMN_NAME='checkout_attempt_id';" | grep -qx 1

install -d -m 700 "$BACKUP_DIR"
DUMP="$BACKUP_DIR/${SOURCE_DB}-${STAMP}.sql"
mariadb-dump --single-transaction --quick --routines --triggers --events --skip-add-drop-table --default-character-set=utf8mb4 --hex-blob --result-file="$DUMP" "$SOURCE_DB"
test -s "$DUMP"
sha256sum "$DUMP" | tee "$DUMP.sha256"
sha256sum -c "$DUMP.sha256"
install -m 600 /dev/null "$RELEASE/.env"
cp "$ENV_FILE" "$RELEASE/.env"
chmod 600 "$RELEASE/.env"

ln -sfn "$RELEASE" "$CURRENT"
SWITCHED=1
pm2 restart goldencreation-api --update-env
sleep 3
pm2 describe goldencreation-api | grep -F "$RELEASE" >/dev/null
curl -fsS http://127.0.0.1:5000/api/health | grep -q '"status":"ok"'
curl -fsS https://goldencreation.in/api/health | grep -q '"status":"ok"'
curl -fsS https://admin.goldencreation.in/api/health | grep -q '"status":"ok"'
curl -fsS https://www.goldencreation.in/ | grep -q 'assets/'

echo "deployment_status=ok commit=$SHA release=$RELEASE"
SWITCHED=0
rm -rf "$WORK"
trap - EXIT
exit 0

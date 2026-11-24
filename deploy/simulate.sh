#!/bin/bash
# Local simulation of deploy.sh. It does not contact the VPS or a real database.
set -euo pipefail

ROOT=$(mktemp -d)
BIN="$ROOT/bin"
SOURCE="$ROOT/source"
export PATH="$BIN:/usr/bin:/bin"
export GC_ROOT="$ROOT/opt"
export GC_SIMULATE=1
export GC_SOURCE="$SOURCE"
export DEPLOY_SHA=0123456789abcdef0123456789abcdef01234567
export GC_TEST_DB_NAME=gc_ci
export GC_TEST_DB_USER=gc_ci_user
export GC_TEST_DB_HOST=127.0.0.1
export GC_FAIL_HEALTH="${GC_FAIL_HEALTH:-0}"

mkdir -p "$BIN" "$GC_ROOT/releases/previous/public/.well-known" "$GC_ROOT/shared" "$SOURCE/backend" "$SOURCE/frontend" "$SOURCE/saas-panel"
printf 'NODE_ENV=production\nDB_NAME=goldencreation_db\nDB_USER=app_user\n' > "$GC_ROOT/shared/.env"
printf 'DB_PASSWORD=simulate-only\n' > "$GC_ROOT/gc-ci.env"
printf 'ok' > "$GC_ROOT/releases/previous/public/.well-known/assetlinks.json"
printf '%s\n' "$GC_ROOT/releases/previous" > "$GC_ROOT/current.link"
printf 'console.log("test-ok")\n' > "$SOURCE/backend/server.js"
mkdir -p "$SOURCE/backend/test" "$SOURCE/backend/routes"
printf 'export {}\n' > "$SOURCE/backend/routes/order.routes.js"
printf 'test("ok", () => {});\n' > "$SOURCE/backend/test/sample.test.js"
mkdir -p "$SOURCE/backend/test" "$SOURCE/saas-panel/src/lib"
printf 'import "../../saas-panel/src/lib/spreadsheetImport.js";\n' > "$SOURCE/backend/test/product-import.test.js"
printf 'export {}\n' > "$SOURCE/saas-panel/src/lib/spreadsheetImport.js"
printf '{}\n' > "$SOURCE/backend/package.json"
printf '{}\n' > "$SOURCE/frontend/package.json"
printf '{}\n' > "$SOURCE/saas-panel/package.json"

cat > "$BIN/git" << 'EOF'
#!/bin/bash
if [ "$1" = "-C" ]; then
  echo "$DEPLOY_SHA"
  exit 0
fi
exit 0
EOF

cat > "$BIN/npm" << 'EOF'
#!/bin/bash
dir=$(pwd)
if [[ "$*" == *ci* ]]; then
  mkdir -p "$dir/node_modules/jszip"
  printf '{}\n' > "$dir/node_modules/jszip/package.json"
fi
if [[ "$*" == *build* ]]; then
  mkdir -p "$dir/dist/assets"
  if [[ "$dir" == *saas-panel* ]]; then
    printf '<html><script src="/assets/index-admin.js"></script></html>' > "$dir/dist/index.html"
    printf 'admin' > "$dir/dist/assets/index-admin.js"
  else
    printf '<html><script src="/assets/index-store.js"></script></html>' > "$dir/dist/index.html"
    printf 'store' > "$dir/dist/assets/index-store.js"
  fi
fi
exit 0
EOF

cat > "$BIN/node" << 'EOF'
#!/bin/bash
if [ "$1" = "--test" ]; then exit 0; fi
if [ "$1" = "--input-type=module" ]; then
  if [ -t 0 ]; then exit 0; fi
  input=$(cat)
  if [[ "$input" != *"goldencreation-api"* ]]; then exit 0; fi
  cwd=$(cat "$GC_ROOT/current.link")
  [[ "$input" == *"$cwd"* ]]
  exit $?
fi
exit 0
EOF

cat > "$BIN/mariadb" << 'EOF'
#!/bin/bash
if [[ "$*" == *"SELECT 1"* && "$*" == *"goldencreation_db"* ]]; then
  exit 1
fi
if [[ "$*" == *"SELECT DATABASE()"* ]]; then
  echo "$GC_TEST_DB_NAME"
  exit 0
fi
echo 1
exit 0
EOF

cat > "$BIN/mariadb-dump" << 'EOF'
#!/bin/bash
out=""
for arg in "$@"; do
  case "$arg" in
    --result-file=*) out="${arg#--result-file=}" ;;
  esac
done
printf 'CREATE TABLE checkout_attempts (id INT);\nINSERT INTO example VALUES (1);\n' > "$out"
exit 0
EOF

cat > "$BIN/pm2" << 'EOF'
#!/bin/bash
if [ "$1" = "jlist" ]; then
  printf '[{"name":"goldencreation-api","pm2_env":{"pm_cwd":"%s"}}]\n' "$GC_EXPECT_CWD"
  exit 0
fi
exit 0
EOF

cat > "$BIN/curl" << 'EOF'
#!/bin/bash
url="${@: -1}"
if [ "$GC_FAIL_HEALTH" = 1 ]; then exit 1; fi
if [[ "$url" == *health* ]]; then echo '{"status":"ok"}'; exit 0; fi
if [[ "$url" == *admin* ]]; then echo '<html>assets/index-admin.js</html>'; exit 0; fi
echo '<html>assets/index-store.js</html>'
exit 0
EOF

cat > "$BIN/sha256sum" << 'EOF'
#!/bin/bash
if [ "$1" = "-c" ]; then exit 0; fi
file=$(echo "$@" | awk '{print $NF}')
echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  $file"
EOF

cat > "$BIN/flock" << 'EOF'
#!/bin/bash
exit 0
EOF

chmod +x "$BIN"/*

SCRIPT=$(cd "$(dirname "$0")" && pwd)/deploy.sh
bash "$SCRIPT" --dry-run | tee "$ROOT/dry-run.txt" | grep -q "dry_run_status=ok"

cat > "$BIN/pm2" << 'EOF'
#!/bin/bash
if [ "$1" = "jlist" ]; then
  cwd=$(cat "$GC_ROOT/current.link")
  printf '[{"name":"goldencreation-api","pm2_env":{"pm_cwd":"%s"}}]\n' "$cwd"
  exit 0
fi
if [ "$1" = "restart" ] && [ "${GC_PM2_RESTART_FAIL:-}" = 1 ]; then
  echo "pm2 restart failed" >&2
  exit 1
fi
echo "pm2 $*" >> "$GC_ROOT/pm2.log"
exit 0
EOF
chmod +x "$BIN/pm2"

bash "$SCRIPT" > "$ROOT/success.txt"
grep -q "deployment_status=ok" "$ROOT/success.txt"
test "$(cat "$GC_ROOT/current.link")" != "$GC_ROOT/releases/previous"
test -s "$GC_ROOT/backups/db/"*.sql
if grep -R "CREATE DATABASE" "$GC_ROOT/backups/db" >/dev/null; then
  echo "simulation found a database create statement" >&2
  exit 1
fi
echo "simulation_success=ok release=$(cat "$GC_ROOT/current.link")"

printf '%s\n' "$GC_ROOT/releases/previous" > "$GC_ROOT/current.link"
export GC_FAIL_HEALTH=1
set +e
bash "$SCRIPT" > "$ROOT/rollback.txt"
status=$?
set -e
test "$status" -ne 0
grep -q "code_rollback=" "$ROOT/rollback.txt"
test "$(cat "$GC_ROOT/current.link")" = "$GC_ROOT/releases/previous"
echo "simulation_rollback=ok"
if grep -q "code_rollback=failed" "$ROOT/rollback.txt"; then
  echo "simulation reported a successful rollback as a failure" >&2
  exit 1
fi

export GC_PM2_RESTART_FAIL=1
set +e
bash "$SCRIPT" > "$ROOT/rollback-failed.txt"
failed_status=$?
set -e
test "$failed_status" -ne 0
grep -q "code_rollback=failed" "$ROOT/rollback-failed.txt"
test "$(cat "$GC_ROOT/current.link")" = "$GC_ROOT/releases/previous"
echo "simulation_rollback_failure_reported=ok"
unset GC_PM2_RESTART_FAIL

if grep -q "defaults-extra-file" "$SCRIPT"; then
  echo "simulation found a MariaDB client that can inherit root defaults" >&2
  exit 1
fi
if grep -q "simulate-only" "$ROOT/dry-run.txt" "$ROOT/success.txt" "$ROOT/rollback.txt" "$ROOT/rollback-failed.txt"; then
  echo "simulation printed the test password" >&2
  exit 1
fi
echo "simulation_secret_not_printed=ok"
echo "simulation_root=$ROOT"

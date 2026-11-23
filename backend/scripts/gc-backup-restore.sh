#!/bin/bash
# Backup goldencreation_db and restore it into an empty database.
# Does not write to goldencreation_db. Run only after explicit approval.
set -euo pipefail
umask 077

test "$(id -u)" = "0" || { echo "STOP: run this as root"; exit 1; }
command -v mariadb >/dev/null 2>&1 || { echo "STOP: mariadb client is missing"; exit 1; }
command -v mariadb-dump >/dev/null 2>&1 || { echo "STOP: mariadb-dump is missing"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "STOP: python3 is missing"; exit 1; }
command -v runuser >/dev/null 2>&1 || { echo "STOP: runuser is missing"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "STOP: openssl is missing"; exit 1; }

SOURCE_DB=goldencreation_db
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RESTORE_DB=goldencreation_restore_${STAMP}
BACKUP_DIR=/opt/goldencreation/backups/db
DUMP="${BACKUP_DIR}/${SOURCE_DB}-${STAMP}.sql"
AUTH_DIR=/var/lib/gc-restore-auth
RESTORE_CNF="${AUTH_DIR}/client.cnf"
CREATE_ERR="${AUTH_DIR}/create.err"
VERIFY_PY="${VERIFY_PY:-/opt/goldencreation/backup-tools/gc_restore_verify.py}"
test "$RESTORE_DB" != "$SOURCE_DB"
test -f "$VERIFY_PY" || { echo "STOP: verifier is missing at ${VERIFY_PY}"; exit 1; }

echo "dump_client: $(mariadb-dump --version)"
echo "server: $(mariadb --batch --skip-column-names -e "SELECT VERSION();")"

NON_INNODB=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB';")
TABLES_BEFORE=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA='${SOURCE_DB}' AND TABLE_TYPE='BASE TABLE';")
DATA_BYTES=$(mariadb --batch --skip-column-names -e "
SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0)
FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SOURCE_DB}';")
DATADIR=$(mariadb --batch --skip-column-names -e "SELECT @@datadir;")
echo "tables_before=${TABLES_BEFORE} data_bytes=${DATA_BYTES}"
test "$NON_INNODB" = "0" || { echo "STOP: a base table is not InnoDB"; exit 2; }
test "$TABLES_BEFORE" = "121" || { echo "STOP: expected 121 base tables, found ${TABLES_BEFORE}"; exit 1; }

DISK_PATH=/
if [ -d /opt/goldencreation ]; then DISK_PATH=/opt/goldencreation; elif [ -d /opt ]; then DISK_PATH=/opt; fi
BACKUP_FREE=$(df -B1 --output=avail "$DISK_PATH" | tail -1)
DATA_FREE=$(df -B1 --output=avail "$DATADIR" | tail -1)
echo "backup_free=${BACKUP_FREE} datadir_free=${DATA_FREE}"
test "$BACKUP_FREE" -gt $((DATA_BYTES * 2)) || { echo "STOP: not enough backup disk"; exit 1; }
test "$DATA_FREE" -gt $((DATA_BYTES + DATA_BYTES / 5)) || { echo "STOP: not enough data-directory disk"; exit 1; }

EXISTS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${RESTORE_DB}';")
test "$EXISTS" = "0" || { echo "STOP: restore schema already exists"; exit 1; }
ACCOUNT_EXISTS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM mysql.user WHERE User='gc_restore';")
test "$ACCOUNT_EXISTS" = "0" || { echo "STOP: MariaDB account gc_restore already exists; it was not changed"; exit 1; }

install -d -m 700 -o root -g root "$BACKUP_DIR"

mariadb-dump \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --skip-add-drop-table \
  --default-character-set=utf8mb4 \
  --hex-blob \
  --result-file="$DUMP" \
  "$SOURCE_DB"

test -s "$DUMP"
tail -n 30 "$DUMP" | grep -q "Dump completed" || { echo "STOP: dump is incomplete"; exit 1; }
sha256sum "$DUMP" | tee "${DUMP}.sha256"
sha256sum -c "${DUMP}.sha256"
chmod 600 "$DUMP" "${DUMP}.sha256"
gzip -k "$DUMP"
sha256sum "${DUMP}.gz" | tee "${DUMP}.gz.sha256"
sha256sum -c "${DUMP}.gz.sha256"
chmod 600 "${DUMP}.gz" "${DUMP}.gz.sha256"

python3 "$VERIFY_PY" precheck "$DUMP" 121

if id gc_restore >/dev/null 2>&1; then
  RESTORE_SHELL=$(getent passwd gc_restore | cut -d: -f7)
  case "$RESTORE_SHELL" in
    /usr/sbin/nologin|/sbin/nologin|/bin/false) ;;
    *) echo "STOP: Linux user gc_restore exists and is not a locked system user"; exit 1 ;;
  esac
else
  useradd --system --no-create-home --shell /usr/sbin/nologin gc_restore
fi

install -d -m 750 -o root -g gc_restore "$AUTH_DIR"
PASS=$(openssl rand -hex 24)
cat > "$RESTORE_CNF" <<CNF
[client]
user=gc_restore
password=${PASS}
protocol=socket
CNF
chown root:gc_restore "$RESTORE_CNF"
chmod 640 "$RESTORE_CNF"
mariadb >"$CREATE_ERR" 2>&1 <<SQL
CREATE USER 'gc_restore'@'localhost' IDENTIFIED BY '${PASS}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'gc_restore'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, REFERENCES, LOCK TABLES
  ON \`${RESTORE_DB}\`.* TO 'gc_restore'@'localhost';
SQL
unset PASS
chmod 600 "$CREATE_ERR"
chown root:root "$CREATE_ERR"
if [ -s "$CREATE_ERR" ]; then
  echo "STOP: restore account was not created; root-only error file kept at ${CREATE_ERR}"
  exit 1
fi
rm -f "$CREATE_ERR"

# information_schema.GRANTEE stores the quotes as characters. Build that value
# inside SQL. Do not capture QUOTE() in the shell and paste it back into SQL.
GRANTEE_SQL="CONCAT(CHAR(39),'gc_restore',CHAR(39),'@',CHAR(39),'localhost',CHAR(39))"
GLOBAL_PRIVS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.USER_PRIVILEGES
WHERE GRANTEE=${GRANTEE_SQL} AND PRIVILEGE_TYPE <> 'USAGE';")
SCHEMA_PRIVS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES
WHERE GRANTEE=${GRANTEE_SQL} AND TABLE_SCHEMA <> '${RESTORE_DB}';")
TABLE_PRIVS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.TABLE_PRIVILEGES
WHERE GRANTEE=${GRANTEE_SQL} AND TABLE_SCHEMA <> '${RESTORE_DB}';")
COLUMN_PRIVS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.COLUMN_PRIVILEGES
WHERE GRANTEE=${GRANTEE_SQL} AND TABLE_SCHEMA <> '${RESTORE_DB}';")
ROLE_MAPS=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM mysql.roles_mapping WHERE User='gc_restore';")
DEFAULT_ROLE=$(mariadb --batch --skip-column-names -e "
SELECT COUNT(*) FROM mysql.user
WHERE User='gc_restore' AND default_role IS NOT NULL AND default_role <> '';")
echo "restore_global_privs=${GLOBAL_PRIVS} other_schema_privs=${SCHEMA_PRIVS} other_table_privs=${TABLE_PRIVS} other_column_privs=${COLUMN_PRIVS} role_mappings=${ROLE_MAPS} default_roles=${DEFAULT_ROLE}"
test "$GLOBAL_PRIVS" = "0"
test "$SCHEMA_PRIVS" = "0"
test "$TABLE_PRIVS" = "0"
test "$COLUMN_PRIVS" = "0"
test "$ROLE_MAPS" = "0"
test "$DEFAULT_ROLE" = "0"

mariadb -e "CREATE DATABASE \`${RESTORE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

python3 "$VERIFY_PY" import "$DUMP" "$RESTORE_DB" runuser -u gc_restore -- mariadb --defaults-extra-file="$RESTORE_CNF" --binary-mode
echo "restore_exit=0"

set +e
VISIBLE=$(runuser -u gc_restore -- mariadb --defaults-extra-file="$RESTORE_CNF" --batch --skip-column-names -e "
SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${SOURCE_DB}';" 2>&1)
VISIBLE_STATUS=$?
set -e
if [ "$VISIBLE_STATUS" -eq 0 ] && [ "$VISIBLE" != "0" ]; then
  echo "STOP: restore account can see ${SOURCE_DB}"
  exit 1
fi
if [ "$VISIBLE_STATUS" -ne 0 ] && ! printf '%s\n' "$VISIBLE" | grep -qi 'denied'; then
  echo "STOP: production visibility check was inconclusive"
  exit 1
fi
echo "production_access=DENIED"

chmod 600 "$RESTORE_CNF"
chown root:root "$RESTORE_CNF"

python3 "$VERIFY_PY" verify "$DUMP" "$RESTORE_DB" mariadb
sha256sum -c "${DUMP}.sha256"
echo "backup=${DUMP}"
echo "restore_schema=${RESTORE_DB}"
echo "Original backup and checksum are unchanged. Restore objects are kept."

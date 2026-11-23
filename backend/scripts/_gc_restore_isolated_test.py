"""Isolated MariaDB 10.11 test for the restore verifier. Not a production run."""

import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import gc_restore_verify as v

BIN = os.path.join(os.environ["TEMP"], "gc-mariadb-1011", "mariadb-10.11.16-winx64", "bin")
MARIADB = os.path.join(BIN, "mariadb.exe")
DUMP = os.path.join(os.environ["TEMP"], "gc-synth.sql")
HOST = ["-h", "127.0.0.1", "-P", "33110", "--protocol=tcp"]
ROOT = [MARIADB, *HOST, "-u", "root"]


def sql(statement, client=None):
    result = subprocess.run(
        [*(client or ROOT), "--batch", "--skip-column-names"],
        input=statement,
        text=True,
        capture_output=True,
    )
    return result.returncode, result.stdout, result.stderr


def main():
    text = open(DUMP, encoding="utf-8").read()
    tables, kinds = v.precheck_dump(text)
    print("version_dump_client_file_ok tables=%s kinds=%s" % (tables, sorted(set(kinds))))
    assert "goldencreation_db" in text
    code, out, err = sql(
        "DROP DATABASE IF EXISTS gc_synth_restore;"
        "CREATE DATABASE gc_synth_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        "CREATE USER IF NOT EXISTS 'gc_restore'@'127.0.0.1' IDENTIFIED BY 'synthetic-only';"
        "REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'gc_restore'@'127.0.0.1';"
        "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER, REFERENCES, LOCK TABLES ON gc_synth_restore.* TO 'gc_restore'@'127.0.0.1';"
    )
    if code != 0:
        print("account_setup_failed")
        print(err)
        return 1
    limited = [MARIADB, *HOST, "-u", "gc_restore", "-psynthetic-only", "--binary-mode"]
    try:
        v.execute_dump(text, limited, "gc_synth_restore")
        print("clean_import=PASS")
    except v.RestoreRejected as exc:
        print("clean_import=FAIL " + str(exc))
        print(sql("SHOW WARNINGS;")[1])
        return 1
    try:
        result = v.verify_restore(text, "gc_synth_restore", ROOT)
        print("schema_and_rows=%s" % result)
    except v.RestoreRejected as exc:
        print("schema_and_rows=FAIL " + str(exc))
        for statement in v.iter_statements(text):
            if v.classify_statement(statement) == "create-table":
                parsed = v.parse_create(statement)
                print("PARSED", parsed)
        return 1
    v.precheck_dump("-- Database: goldencreation_db\n" + text)
    print("production_name_in_comment=ACCEPTED")
    samples = [
        "USE gc_synth_src",
        "UPDATE parent SET marker='x'",
        "DELETE FROM parent",
        "INSERT INTO gc_synth_src.parent (code, qty, amount) VALUES ('Z', 1, 1)",
        "DROP TABLE parent",
        "CREATE DATABASE other_db",
        "CREATE VIEW v AS SELECT 1",
        "CREATE TRIGGER tr BEFORE INSERT ON parent FOR EACH ROW SET NEW.qty=1",
        "CREATE PROCEDURE p() BEGIN SELECT 1; END",
        "CREATE EVENT e ON SCHEDULE EVERY 1 HOUR DO SELECT 1",
        "GRANT ALL ON gc_synth_src.* TO 'gc_restore'@'127.0.0.1'",
    ]
    for sample in samples:
        try:
            v.classify_statement(sample)
            print("unexpected_sql=FAIL accepted " + sample.split()[0])
            return 1
        except v.RestoreRejected as exc:
            print("unexpected_sql=REJECTED " + str(exc))
    try:
        v.execute_dump(text + "\nUPDATE parent SET marker='rewritten';\n", limited, "gc_synth_restore")
        print("poisoned_import=FAIL executed")
        return 1
    except v.RestoreRejected as exc:
        print("poisoned_import=REJECTED_BEFORE_EXECUTION " + str(exc))
    restore_rewritten = sql("SELECT COUNT(*) FROM gc_synth_restore.parent WHERE marker='rewritten';")[1].strip()
    print("poisoned_import_rows=%s" % restore_rewritten)
    bypass_code, _bout, bypass_err = sql(
        "INSERT INTO gc_synth_src.parent (code, qty, amount, marker) VALUES ('Z', 1, 1.00, 'rewritten');",
        limited,
    )
    source_rewritten = sql("SELECT COUNT(*) FROM gc_synth_src.parent WHERE marker='rewritten';")[1].strip()
    print("bypass_insert_exit=%d" % bypass_code)
    print("bypass_insert_denied=%s" % ("denied" in bypass_err.lower()))
    print("bypass_insert_rows=%s" % source_rewritten)
    denied_code, _out, denied_err = sql(
        "UPDATE gc_synth_src.parent SET marker='rewritten' WHERE id=1;",
        limited,
    )
    changed = sql("SELECT COUNT(*) FROM gc_synth_src.parent WHERE marker <> 'unchanged';")[1].strip()
    print("direct_write_exit=%d" % denied_code)
    print("direct_write_denied=%s" % ("denied" in denied_err.lower()))
    print("sentinel_unchanged=%s" % (changed == "0"))
    visible = sql(
        "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gc_synth_src';",
        limited,
    )
    print("source_tables_visible_to_restore_user=%s exit=%d" % (visible[1].strip() or "none", visible[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

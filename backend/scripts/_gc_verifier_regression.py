"""Regression for metadata differences that are not data corruption."""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import gc_restore_verify as v

BIN = os.path.join(os.environ["TEMP"], "gc-mariadb-1011", "mariadb-10.11.16-winx64", "bin")
MARIADB = os.path.join(BIN, "mariadb.exe")
DUMPBIN = os.path.join(BIN, "mariadb-dump.exe")
ROOT = [MARIADB, "-h", "127.0.0.1", "-P", "13306", "--protocol=tcp", "-u", "root"]


def sql(statement):
    result = subprocess.run([*ROOT, "--batch", "--skip-column-names"], input=statement, text=True, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(result.stderr)
    return result.stdout


def main():
    create = """CREATE TABLE `sample` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `body` longtext DEFAULT NULL,
  `note` text DEFAULT NULL,
  `status` enum('pending','confirmed') NOT NULL DEFAULT 'pending',
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `qty` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_qty` CHECK (`qty` > 0)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""
    parsed = v.parse_create(create + ";")
    by_name = {column[0]: column for column in parsed["columns"]}
    assert by_name["body"][2] == "", by_name["body"]
    assert by_name["note"][2] == "", by_name["note"]
    assert by_name["status"][2] == "enum:pending|confirmed", by_name["status"]
    mixed = v.parse_create(
        "CREATE TABLE `labels` (\n"
        "  `state` enum('Pending','Approved','Rejected') NOT NULL,\n"
        "  `rail` set('UPI','Bank') NOT NULL\n"
        ") ENGINE=InnoDB;"
    )
    mixed_by_name = {column[0]: column for column in mixed["columns"]}
    assert mixed_by_name["state"][2] == "enum:Pending|Approved|Rejected", mixed_by_name["state"]
    assert mixed_by_name["rail"][2] == "set:UPI|Bank", mixed_by_name["rail"]
    assert "json_valid(payload)" in {clause for _name, clause in parsed["checks"]}
    assert "qty>0" in {clause for _name, clause in parsed["checks"]}
    assert v._length_signature("longtext", "4294967295", "longtext") == ""
    assert v._length_signature("text", "65535", "text") == ""
    assert v._length_signature("enum", "9", "enum('pending','confirmed')") == "enum:pending|confirmed"
    assert v._length_signature("varchar", "40", "varchar(40)") == "40"
    print("parser_normalization=PASS")

    sql(
        "DROP DATABASE IF EXISTS gc_verify_src; CREATE DATABASE gc_verify_src CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        "CREATE TABLE gc_verify_src.sample ("
        " id INT UNSIGNED NOT NULL AUTO_INCREMENT,"
        " body LONGTEXT NULL,"
        " note TEXT NULL,"
        " status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',"
        " rail SET('UPI','Bank') NOT NULL DEFAULT 'UPI',"
        " payload JSON NULL,"
        " qty INT NOT NULL DEFAULT 1,"
        " PRIMARY KEY (id),"
        " CONSTRAINT chk_qty CHECK (qty > 0)"
        ") ENGINE=InnoDB;"
        "INSERT INTO gc_verify_src.sample (body, note, status, rail, payload, qty) VALUES ('a', 'b', 'Pending', 'UPI', '{\"ok\":true}', 2);"
    )
    dump = os.path.join(os.environ["TEMP"], "gc-verify.sql")
    subprocess.run(
        [DUMPBIN, "--single-transaction", "--quick", "--routines", "--triggers", "--events",
         "--skip-add-drop-table", "--default-character-set=utf8mb4", "--hex-blob",
         "--result-file=" + dump, "-h", "127.0.0.1", "-P", "13306", "-u", "root", "--protocol=tcp", "gc_verify_src"],
        check=True,
    )
    sql("DROP DATABASE IF EXISTS gc_verify_restore; CREATE DATABASE gc_verify_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    text = open(dump, encoding="utf-8").read()
    v.execute_dump(text, [*ROOT, "--binary-mode"], "gc_verify_restore")
    result = v.verify_restore(text, "gc_verify_restore", ROOT)
    print("normalized_restore=%s" % result)
    rows = sql("SELECT COUNT(*) FROM gc_verify_restore.sample;").strip()
    print("row_count=%s" % rows)
    sql("ALTER TABLE gc_verify_restore.sample MODIFY status ENUM('pending','Approved','Rejected') NOT NULL DEFAULT 'pending';")
    try:
        v.verify_restore(text, "gc_verify_restore", ROOT)
        print("enum_case_change=FAIL accepted")
        return 1
    except v.RestoreRejected as exc:
        print("enum_case_change=REJECTED")
        if "status" not in str(exc):
            print(exc)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

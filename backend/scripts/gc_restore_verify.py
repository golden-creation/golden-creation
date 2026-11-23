"""Whitelist importer and structural verifier for a MariaDB dump.

The dump is accepted only when every statement is one of the statement
forms produced by mariadb-dump for base tables. Least privilege on the
restore account is the isolation control; this whitelist fails closed
before an unexpected statement is sent to the server.
"""

import re
import subprocess
import sys


class RestoreRejected(Exception):
    pass


_TYPE_WORDS = {
    "not",
    "null",
    "default",
    "comment",
    "collate",
    "character",
    "auto_increment",
    "on",
    "generated",
    "as",
    "invisible",
    "visible",
    "check",
    "constraint",
    "primary",
    "unique",
    "key",
    "references",
    "column_format",
    "storage",
    "srid",
}


def _strip_leading_comments(statement):
    text = statement.strip()
    while text:
        if text.startswith("/*!"):
            end = text.find("*/")
            if end < 0:
                raise RestoreRejected("unclosed executable comment")
            body_start = 3
            while body_start < end and text[body_start].isdigit():
                body_start += 1
            text = (text[body_start:end] + " " + text[end + 2:]).strip()
            continue
        if text.startswith("/*"):
            end = text.find("*/")
            if end < 0:
                raise RestoreRejected("unclosed comment")
            text = text[end + 2:].strip()
            continue
        if text.startswith("--") or text.startswith("#"):
            newline = text.find("\n")
            text = "" if newline < 0 else text[newline + 1:].strip()
            continue
        break
    return text.strip()


def _unqualified_table(sql, keyword):
    match = re.match(keyword + r"\s+", sql, re.I | re.S)
    if not match:
        return False
    rest = sql[match.end():].lstrip()
    if rest.startswith("`"):
        end = rest.find("`", 1)
        if end < 0:
            return False
        return not rest[end + 1:].lstrip().startswith(".")
    ident = re.match(r"[A-Za-z0-9_]+", rest)
    if not ident:
        return False
    return not rest[ident.end():].lstrip().startswith(".")


def classify_statement(statement):
    sql = _strip_leading_comments(statement)
    if not sql:
        return "comment"
    head = sql.lower()
    if head.startswith("set "):
        if re.match(r"set\s+(global|password)\b", head):
            raise RestoreRejected("SET GLOBAL or SET PASSWORD is not part of a table dump")
        return "set"
    if re.match(r"create\s+table\b", head):
        if not _unqualified_table(sql, r"CREATE\s+TABLE"):
            raise RestoreRejected("schema-qualified CREATE TABLE")
        if re.search(r"\bselect\b", head):
            raise RestoreRejected("CREATE TABLE ... SELECT")
        return "create-table"
    if re.match(r"insert\s+(ignore\s+|low_priority\s+|delayed\s+|high_priority\s+)*into\b", head):
        if not _unqualified_table(sql, r"INSERT\s+(?:IGNORE\s+|LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+)*INTO"):
            raise RestoreRejected("schema-qualified INSERT")
        if not re.search(r"\bvalues\b", head):
            raise RestoreRejected("INSERT without VALUES")
        return "insert"
    if head.startswith("lock tables "):
        if re.search(r"\w\s*\.\s*`|\.\s*[A-Za-z0-9_]", sql):
            raise RestoreRejected("schema-qualified LOCK TABLES")
        return "lock"
    if head == "unlock tables":
        return "unlock"
    if re.match(r"alter\s+table\b", head):
        if not _unqualified_table(sql, r"ALTER\s+TABLE"):
            raise RestoreRejected("schema-qualified ALTER TABLE")
        if not re.search(r"\b(disable|enable)\s+keys\s*$", head):
            raise RestoreRejected("ALTER TABLE other than DISABLE KEYS or ENABLE KEYS")
        return "alter-keys"
    if head in {"start transaction", "commit", "rollback"}:
        return head
    raise RestoreRejected("unexpected SQL: " + " ".join(sql.split())[:80])


def iter_statements(text):
    buf = []
    quote = None
    escape = False
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if quote:
            buf.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if text.startswith("--", i) or ch == "#":
            newline = text.find("\n", i)
            buf.append(text[i:] if newline < 0 else text[i:newline + 1])
            i = n if newline < 0 else newline + 1
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            if end < 0:
                raise RestoreRejected("unclosed comment")
            buf.append(text[i:end + 2])
            i = end + 2
            continue
        if ch in {"'", '"', "`"}:
            quote = ch
            buf.append(ch)
            i += 1
            continue
        if ch == ";":
            statement = "".join(buf).strip()
            buf = []
            if statement:
                yield statement
            i += 1
            continue
        buf.append(ch)
        i += 1
    if quote:
        raise RestoreRejected("unclosed quote")
    tail = "".join(buf).strip()
    if tail and _strip_leading_comments(tail):
        raise RestoreRejected("dump ends with an unterminated statement")


def precheck_dump(text):
    kinds = []
    tables = []
    for statement in iter_statements(text):
        kind = classify_statement(statement)
        kinds.append(kind)
        if kind == "create-table":
            match = re.search(r"CREATE\s+TABLE\s+`([^`]+)`", statement, re.I)
            if not match:
                raise RestoreRejected("CREATE TABLE has no quoted name")
            tables.append(match.group(1))
    if len(tables) != len(set(tables)):
        raise RestoreRejected("duplicate CREATE TABLE names")
    return tables, kinds


def _cut_type(body):
    depth = 0
    for token in re.finditer(r"[A-Za-z_]+|\(|\)", body):
        value = token.group(0)
        if value == "(":
            depth += 1
        elif value == ")":
            depth -= 1
        elif depth == 0 and value.lower() in _TYPE_WORDS:
            return body[:token.start()]
    return body


def _member_signature(type_sql):
    match = re.match(r"\s*(enum|set)\s*\(", type_sql, re.I)
    if not match:
        return ""
    start = type_sql.find("(", match.end() - 1)
    depth = 0
    quote = None
    escape = False
    values = []
    token = []
    for index in range(start, len(type_sql)):
        ch = type_sql[index]
        if quote:
            if escape:
                token.append(ch)
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            else:
                token.append(ch)
            continue
        if ch in {"'", '"'}:
            quote = ch
            continue
        if ch == "(":
            depth += 1
            continue
        if ch == ",":
            values.append("".join(token))
            token = []
            continue
        if ch == ")":
            depth -= 1
            if depth == 0:
                values.append("".join(token))
                return match.group(1).lower() + ":" + "|".join(values)
            token.append(ch)
            continue
        if not ch.isspace():
            token.append(ch)
    return ""


def _length_signature(base, explicit_length, type_sql):
    if base in {"enum", "set"}:
        return _member_signature(type_sql)
    if base in {"char", "varchar", "binary", "varbinary"}:
        return explicit_length
    return ""


def _inline_checks(body):
    found = []
    for match in re.finditer(r"\bCHECK\b", body, re.I):
        start = body.find("(", match.end())
        if start < 0:
            continue
        depth = 0
        quote = None
        escape = False
        for index in range(start, len(body)):
            ch = body[index]
            if quote:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == quote:
                    quote = None
                continue
            if ch in {"'", '"', "`"}:
                quote = ch
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    found.append(_normalize_expr(body[start:index + 1]))
                    break
    return found


def _normalize_expr(expr):
    text = expr.strip().lower()
    text = text.replace("`", "")
    text = re.sub(r"\s+", "", text)
    while text.startswith("(") and text.endswith(")") and text.count("(") == text.count(")"):
        inner = text[1:-1]
        if inner.count("(") != inner.count(")"):
            break
        text = inner
    return text


def _normalize_default(value):
    if value is None:
        return None
    text = str(value).strip()
    if text.upper() == "NULL":
        return None
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        text = text[1:-1]
    lowered = text.lower().replace("`", "")
    if re.match(r"(current_timestamp|now|localtime|localtimestamp)\b", lowered):
        text = re.sub(r"current_timestamp\s*\(\s*\)", "current_timestamp", lowered)
        text = re.sub(r"\s+", "", text)
        return text
    text = text.replace("`", "")
    text = re.sub(r"\s+", "", text)
    if re.fullmatch(r"-?\d+\.0+", text):
        text = str(int(float(text)))
    return text


def parse_create(statement):
    lines = statement.splitlines()
    columns, indexes, checks, fks = [], [], [], []
    for line in lines[1:]:
        stripped = line.strip().rstrip(",")
        if stripped.startswith(")"):
            break
        column = re.match(r"`([^`]+)`\s+(.+)$", stripped)
        key = re.match(
            r"(PRIMARY KEY|UNIQUE KEY|FULLTEXT KEY|SPATIAL KEY|KEY)\s*(?:`([^`]+)`)?\s*\((.+)\)$",
            stripped,
            re.I,
        )
        foreign = re.match(
            r"CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY\s+\(([^)]+)\)\s+REFERENCES\s+`([^`]+)`\s+\(([^)]+)\)(.*)$",
            stripped,
            re.I,
        )
        check = re.match(r"(?:CONSTRAINT\s+`([^`]+)`\s+)?CHECK\s+(\(.+\))$", stripped, re.I)
        if foreign:
            rules = foreign.group(5).upper()
            delete_rule = "RESTRICT"
            update_rule = "RESTRICT"
            delete_match = re.search(r"ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT)", rules)
            update_match = re.search(r"ON UPDATE (CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT)", rules)
            if delete_match:
                delete_rule = "RESTRICT" if delete_match.group(1) == "NO ACTION" else delete_match.group(1)
            if update_match:
                update_rule = "RESTRICT" if update_match.group(1) == "NO ACTION" else update_match.group(1)
            fks.append(
                (
                    foreign.group(1),
                    tuple(part.strip(" `") for part in foreign.group(2).split(",")),
                    foreign.group(3),
                    tuple(part.strip(" `") for part in foreign.group(4).split(",")),
                    delete_rule,
                    update_rule,
                )
            )
        elif check:
            checks.append((check.group(1) or "", _normalize_expr(check.group(2))))
        elif key:
            kind = key.group(1).upper()
            columns_in_key = []
            for part in key.group(3).split(","):
                match = re.match(r"`?([^`(]+)`?(?:\((\d+)\))?", part.strip())
                columns_in_key.append((match.group(1), match.group(2) or ""))
            columns_in_key = tuple(columns_in_key)
            if kind == "PRIMARY KEY":
                indexes.append(("PRIMARY", 0, columns_in_key))
            else:
                indexes.append((key.group(2), 0 if kind.startswith("UNIQUE") else 1, columns_in_key))
        elif column:
            body = column.group(2)
            dtype_raw = re.sub(r"\s+", " ", _cut_type(body)).strip()
            dtype = dtype_raw.lower()
            base = re.match(r"[a-z]+", dtype).group(0)
            if base == "integer":
                base = "int"
            nullable = "NO" if re.search(r"\bNOT NULL\b", body, re.I) else "YES"
            unsigned = "unsigned" in dtype
            length = precision = scale = ""
            arg = re.search(r"\(([^)]*)\)", dtype)
            if base in {"varchar", "char", "varbinary", "binary"} and arg:
                length = arg.group(1).strip()
            elif base in {"decimal", "numeric"} and arg and "," in arg.group(1):
                precision, scale = [part.strip() for part in arg.group(1).split(",", 1)]
            length = _length_signature(base, length, dtype_raw)
            checks.extend(("", clause) for clause in _inline_checks(body))
            default = None
            default_match = re.search(r"\bDEFAULT\s+((?:'[^']*'|\"[^\"]*\"|\S+))", body, re.I)
            if default_match and "GENERATED ALWAYS" not in body.upper():
                default = _normalize_default(default_match.group(1))
            generated = ""
            generated_match = re.search(
                r"\bGENERATED ALWAYS AS\s*(\(.+\))\s*(VIRTUAL|STORED)?",
                body,
                re.I,
            )
            if generated_match:
                storage = (generated_match.group(2) or "VIRTUAL").lower()
                generated = storage + ":" + _normalize_expr(generated_match.group(1))
            columns.append((column.group(1), base, length, precision, scale, nullable, unsigned, default, generated))
    tail = statement[statement.rfind(")") :]
    auto_match = re.search(r"AUTO_INCREMENT=(\d+)", tail, re.I)
    collation = re.search(r"COLLATE\s*=?\s*([A-Za-z0-9_]+)", tail, re.I)
    return {
        "columns": columns,
        "indexes": indexes,
        "checks": checks,
        "fks": fks,
        "auto_increment": auto_match.group(1) if auto_match else None,
        "collation": collation.group(1).lower() if collation else None,
    }


def _query(client, sql):
    out = subprocess.check_output(
        [*client, "--batch", "--raw", "--skip-column-names", "-e", sql],
        text=True,
    )
    return [line.split("\t") for line in out.splitlines() if line]


def verify_restore(dump_text, restore_db, client):
    tables, _kinds = precheck_dump(dump_text)
    parsed = {}
    for statement in iter_statements(dump_text):
        if classify_statement(statement) == "create-table":
            name = re.search(r"CREATE\s+TABLE\s+`([^`]+)`", statement, re.I).group(1)
            parsed[name] = parse_create(statement)
    restored = [
        row[0]
        for row in _query(
            client,
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA='%s' AND TABLE_TYPE='BASE TABLE' ORDER BY 1" % restore_db,
        )
    ]
    missing = sorted(set(tables) - set(restored))
    extra = sorted(set(restored) - set(tables))
    if missing or extra or len(tables) != len(set(tables)):
        raise RestoreRejected(
            "table name mismatch missing=%s extra=%s" % (",".join(missing), ",".join(extra))
        )

    live_columns = {}
    for row in _query(
        client,
        "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IFNULL(CHARACTER_MAXIMUM_LENGTH,''), "
        "IFNULL(NUMERIC_PRECISION,''), IFNULL(NUMERIC_SCALE,''), IS_NULLABLE, COLUMN_TYPE, "
        "COLUMN_DEFAULT, IFNULL(GENERATION_EXPRESSION,''), EXTRA "
        "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='%s' "
        "ORDER BY TABLE_NAME, ORDINAL_POSITION" % restore_db,
    ):
        table, name, dtype, length, precision, scale, nullable, ctype, default, generated, extra = row
        base = "int" if dtype == "integer" else dtype
        if base not in {"decimal", "numeric"}:
            precision = ""
            scale = ""
        length = _length_signature(base, length, ctype)
        generated_norm = ""
        if generated:
            storage = "stored" if "stored" in extra.lower() else "virtual"
            generated_norm = storage + ":" + _normalize_expr(generated)
        live_columns.setdefault(table, []).append(
            (name, base, length, precision, scale, nullable, "unsigned" in ctype.lower(), _normalize_default(default), generated_norm)
        )

    live_indexes = {}
    for table, iname, nonunique, _seq, column, prefix in _query(
        client,
        "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, IFNULL(SUB_PART,'') "
        "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='%s' "
        "ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX" % restore_db,
    ):
        live_indexes.setdefault(table, {}).setdefault((iname, int(nonunique)), []).append((column, prefix))

    live_fks = {}
    usage = {}
    for table, cname, column, parent, parent_col in _query(
        client,
        "SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME "
        "FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='%s' "
        "AND REFERENCED_TABLE_NAME IS NOT NULL "
        "ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION" % restore_db,
    ):
        bucket = usage.setdefault((table, cname), {"cols": [], "parent": parent, "parent_cols": []})
        bucket["cols"].append(column)
        bucket["parent_cols"].append(parent_col)
    rules = {
        (table, cname): (delete_rule, update_rule)
        for table, cname, delete_rule, update_rule in _query(
            client,
            "SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE, UPDATE_RULE "
            "FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='%s'" % restore_db,
        )
    }
    for (table, cname), bucket in usage.items():
        delete_rule, update_rule = rules.get((table, cname), ("RESTRICT", "RESTRICT"))
        delete_rule = "RESTRICT" if delete_rule == "NO ACTION" else delete_rule
        update_rule = "RESTRICT" if update_rule == "NO ACTION" else update_rule
        live_fks.setdefault(table, {})[cname] = (
            tuple(bucket["cols"]),
            bucket["parent"],
            tuple(bucket["parent_cols"]),
            delete_rule,
            update_rule,
        )

    live_checks = {}
    for table, cname, clause in _query(
        client,
        "SELECT TABLE_NAME, CONSTRAINT_NAME, CHECK_CLAUSE "
        "FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='%s'" % restore_db,
    ):
        live_checks.setdefault(table, []).append((cname, _normalize_expr(clause)))

    live_tables = {
        table: (auto or None, (collation or "").lower())
        for table, auto, collation in _query(
            client,
            "SELECT TABLE_NAME, IFNULL(AUTO_INCREMENT,''), IFNULL(TABLE_COLLATION,'') "
            "FROM information_schema.TABLES WHERE TABLE_SCHEMA='%s'" % restore_db,
        )
    }
    schema_bad = []
    for table in tables:
        expected = parsed[table]
        if expected["columns"] != live_columns.get(table, []):
            schema_bad.append(table + ":columns")
            for index, pair in enumerate(zip(expected["columns"], live_columns.get(table, []))):
                if pair[0] != pair[1]:
                    schema_bad.append("%s:column[%d] dump=%s live=%s" % (table, index, pair[0], pair[1]))
                    break
        expected_indexes = {(name, unique): list(cols) for name, unique, cols in expected["indexes"]}
        if expected_indexes != live_indexes.get(table, {}):
            schema_bad.append(table + ":indexes")
        expected_fks = {
            name: (cols, parent, parent_cols, delete_rule, update_rule)
            for name, cols, parent, parent_cols, delete_rule, update_rule in expected["fks"]
        }
        if expected_fks != live_fks.get(table, {}):
            schema_bad.append(table + ":foreign-keys")
        expected_checks = sorted({_normalize_expr(clause) for _name, clause in expected["checks"]})
        actual_checks = sorted({clause for _name, clause in live_checks.get(table, [])})
        if expected_checks != actual_checks:
            schema_bad.append(table + ":checks")
        live_auto, live_collation = live_tables.get(table, (None, ""))
        if expected["auto_increment"] is not None and expected["auto_increment"] != (live_auto or None):
            schema_bad.append(table + ":auto-increment")
        if expected["collation"] is not None and expected["collation"] != live_collation:
            schema_bad.append(table + ":collation")

    def tuple_counts(text):
        counts, i, n = {}, 0, len(text)
        while True:
            start = text.find("INSERT INTO `", i)
            if start < 0:
                break
            at = start + len("INSERT INTO `")
            end = text.find("`", at)
            table = text[at:end]
            values = re.search(r"\bVALUES\b", text[end:], re.I)
            if not values:
                raise RestoreRejected("unreadable INSERT for " + table)
            i, depth, quote, escape, count = end + values.end(), 0, None, False, 0
            while i < n:
                ch = text[i]
                if quote:
                    if escape:
                        escape = False
                    elif ch == "\\":
                        escape = True
                    elif ch == quote:
                        quote = None
                    i += 1
                    continue
                if ch in {"'", '"', "`"}:
                    quote = ch
                elif ch == "(":
                    if depth == 0:
                        count += 1
                    depth += 1
                elif ch == ")":
                    depth -= 1
                elif ch == ";" and depth == 0:
                    i += 1
                    break
                i += 1
            counts[table] = counts.get(table, 0) + count
        return counts

    counts = tuple_counts(dump_text)
    count_bad = []
    for table in tables:
        actual = _query(client, "SELECT COUNT(*) FROM `%s`.`%s`" % (restore_db, table.replace("`", "``")))[0][0]
        if actual != str(counts.get(table, 0)):
            count_bad.append(table)
    if schema_bad or count_bad:
        raise RestoreRejected(
            "schema=" + ",".join(schema_bad[:50]) + " rows=" + ",".join(count_bad[:50])
        )
    return {"tables": len(tables), "rows_match": True, "schema_match": True}


def execute_dump(text, client, database):
    statements = []
    for statement in iter_statements(text):
        kind = classify_statement(statement)
        if kind != "comment":
            statements.append(statement)
    if not statements:
        raise RestoreRejected("dump has no executable statements")
    # One session keeps the dump's session settings, including foreign_key_checks=0.
    # Classification above finishes before any statement is sent.
    payload = ";\n".join(statements) + ";\n"
    result = subprocess.run(
        [*client, database],
        input=payload,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        error_line = next((line for line in result.stderr.splitlines() if line.startswith("ERROR ")), "")
        raise RestoreRejected("import failed with exit %d %s" % (result.returncode, error_line))


def main(argv):
    command = argv[1]
    if command == "precheck":
        text = open(argv[2], encoding="utf-8").read()
        tables, _kinds = precheck_dump(text)
        expected = int(argv[3])
        if len(tables) != expected:
            raise RestoreRejected("dump contains %d tables, expected %d" % (len(tables), expected))
        print("dump_table_names=%d" % len(tables))
        return 0
    if command == "import":
        text = open(argv[2], encoding="utf-8").read()
        execute_dump(text, argv[4:], argv[3])
        print("import_statements_accepted")
        return 0
    if command == "verify":
        text = open(argv[2], encoding="utf-8").read()
        verify_restore(text, argv[3], argv[4:])
        print("table_names_schema_and_row_counts_match")
        return 0
    raise RestoreRejected("unknown command")


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except (RestoreRejected, subprocess.CalledProcessError) as exc:
        print("STOP: " + str(exc))
        sys.exit(1)

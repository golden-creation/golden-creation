from __future__ import annotations

import argparse
import json
from pathlib import Path

import openpyxl


def text(value) -> str:
    return "" if value is None else str(value).strip()


def qty(value):
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return None
    value = str(value).strip().replace(",", "")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def header_map(ws):
    return {text(cell.value): idx for idx, cell in enumerate(ws[1], start=1)}


def normalize_blank(value):
    return None if value == "" else value


def workbook_rows(path: Path, normalize_empty_strings: bool = False):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    ws = wb.active
    headers = header_map(ws)
    sku_col = headers["Variant SKU"]
    stock_col = headers["Variant Inventory Qty"]
    warehouse_col = headers.get("Warehouse Stock")
    shop_col = headers.get("Shop Stock")
    data = {"sheet": ws.title, "max_row": ws.max_row, "max_col": ws.max_column, "headers": headers, "rows": {}}
    for row_number in range(2, ws.max_row + 1):
        sku = text(ws.cell(row_number, sku_col).value)
        if not sku:
            continue
        data["rows"][row_number] = {
            "sku": sku,
            "stock": clean(qty(ws.cell(row_number, stock_col).value)),
            "warehouse": ws.cell(row_number, warehouse_col).value if warehouse_col else None,
            "shop": ws.cell(row_number, shop_col).value if shop_col else None,
            "j_to_n": [
                normalize_blank(ws.cell(row_number, col).value)
                if normalize_empty_strings
                else ws.cell(row_number, col).value
                for col in range(10, 15)
            ],
        }
    wb.close()
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", required=True)
    parser.add_argument("--normalize-empty-strings", action="store_true")
    args = parser.parse_args()
    audit = json.loads(Path(args.audit).read_text(encoding="utf-8"))
    source = workbook_rows(Path(audit["source_file"]), args.normalize_empty_strings)
    project = workbook_rows(Path(audit["project_output"]), args.normalize_empty_strings)
    downloads = workbook_rows(Path(audit["downloads_output"]), args.normalize_empty_strings)
    failures = []
    if (source["sheet"], source["max_row"], source["max_col"]) != (project["sheet"], project["max_row"], project["max_col"]):
        failures.append("Project workbook dimensions or active sheet changed")
    if source["headers"] != project["headers"]:
        failures.append("Project workbook headers changed")
    if project["headers"] != downloads["headers"]:
        failures.append("Downloads workbook headers differ from project workbook")
    audit_by_row = {row["row"]: row for row in audit["rows"]}
    for row_number, source_row in source["rows"].items():
        project_row = project["rows"].get(row_number)
        downloads_row = downloads["rows"].get(row_number)
        if project_row is None or downloads_row is None:
            failures.append(f"Missing row {row_number} in output")
            continue
        if project_row["sku"] != source_row["sku"]:
            failures.append(f"SKU changed at row {row_number}")
        if downloads_row != project_row:
            failures.append(f"Downloads row differs from project row {row_number}")
        if project_row["warehouse"] != source_row["warehouse"]:
            failures.append(f"Warehouse Stock changed at row {row_number}")
        if project_row["shop"] != source_row["shop"]:
            failures.append(f"Shop Stock changed at row {row_number}")
        if project_row["j_to_n"] != source_row["j_to_n"]:
            failures.append(f"Columns J:N changed at row {row_number}")
        expected = audit_by_row[row_number]["new_qty"]
        if project_row["stock"] != expected:
            failures.append(f"Wrong stock at row {row_number} SKU {source_row['sku']}: expected {expected}, got {project_row['stock']}")
    if failures:
        print("VERIFY FAILED")
        for failure in failures[:50]:
            print(f"- {failure}")
        raise SystemExit(1)
    print("VERIFY PASSED")
    print(json.dumps(audit["summary"], indent=2))
    print(f"downloads_output={audit['downloads_output']}")


if __name__ == "__main__":
    main()

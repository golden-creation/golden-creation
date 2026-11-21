from __future__ import annotations

from pathlib import Path
import json

import openpyxl


SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (9).xlsx")
OUTPUT_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\artzilla products - Updated Website Stock.xlsx")
PROJECT_OUTPUT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_artzilla_20260824\artzilla products - Updated Website Stock.xlsx")
AUDIT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_artzilla_20260824\artzilla_stock_update_audit.json")


def blank_equivalent(value):
    return "" if value is None else value


def load_products(path: Path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Products"]
    headers = [cell.value for cell in next(ws.iter_rows(max_row=1))]
    col = {header: idx + 1 for idx, header in enumerate(headers)}
    return wb, ws, col


def main():
    audit = json.loads(AUDIT_FILE.read_text(encoding="utf-8"))

    _, src_ws, src_col = load_products(SOURCE_FILE)
    _, out_ws, out_col = load_products(OUTPUT_FILE)
    _, project_ws, project_col = load_products(PROJECT_OUTPUT_FILE)

    problems = []
    if src_ws.max_row != out_ws.max_row or src_ws.max_column != out_ws.max_column:
        problems.append(
            f"Dimensions changed: source {src_ws.max_row}x{src_ws.max_column}, output {out_ws.max_row}x{out_ws.max_column}"
        )

    for header in ["Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]:
        if src_col.get(header) != out_col.get(header):
            problems.append(f"Column moved for {header}: source {src_col.get(header)}, output {out_col.get(header)}")

    for col_idx in range(10, 16):  # J:O
        for row_idx in range(1, src_ws.max_row + 1):
            if blank_equivalent(src_ws.cell(row=row_idx, column=col_idx).value) != blank_equivalent(
                out_ws.cell(row=row_idx, column=col_idx).value
            ):
                problems.append(
                    f"Template option column changed at row {row_idx}, col {col_idx}: "
                    f"{src_ws.cell(row=row_idx, column=col_idx).value!r} -> {out_ws.cell(row=row_idx, column=col_idx).value!r}"
                )
                break

    audit_by_row = {row["website_row"]: row for row in audit["rows"]}
    qty_col = out_col["Variant Inventory Qty"]
    warehouse_col = out_col["Warehouse Stock"]
    shop_col = out_col["Shop Stock"]
    changed_rows = []
    negative_rows = []
    for row_idx in range(2, out_ws.max_row + 1):
        expected = audit_by_row[row_idx]["new_variant_inventory_qty"]
        actual = out_ws.cell(row=row_idx, column=qty_col).value
        project_actual = project_ws.cell(row=row_idx, column=project_col["Variant Inventory Qty"]).value
        if actual != expected:
            problems.append(f"Output Q mismatch row {row_idx}: expected {expected!r}, got {actual!r}")
        if project_actual != actual:
            problems.append(f"Downloads/project copy mismatch row {row_idx}: {actual!r} vs {project_actual!r}")
        if src_ws.cell(row=row_idx, column=qty_col).value != actual:
            changed_rows.append(row_idx)
        if isinstance(actual, (int, float)) and actual < 0:
            negative_rows.append(row_idx)
        if src_ws.cell(row=row_idx, column=warehouse_col).value != out_ws.cell(row=row_idx, column=warehouse_col).value:
            problems.append(f"Warehouse stock changed unexpectedly at row {row_idx}")
        if src_ws.cell(row=row_idx, column=shop_col).value != out_ws.cell(row=row_idx, column=shop_col).value:
            problems.append(f"Shop stock changed unexpectedly at row {row_idx}")

    result = {
        "verified": not problems,
        "problems": problems,
        "rows_verified": len(audit["rows"]),
        "changed_rows": len(changed_rows),
        "negative_rows": negative_rows,
        "counts": audit["counts"],
    }
    print(json.dumps(result, indent=2))
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

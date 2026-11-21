from __future__ import annotations

from pathlib import Path
import json

import openpyxl


SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\Addgel Products.xlsx")
OUTPUT_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\Addgel Products - Updated Website Stock.xlsx")
PROJECT_OUTPUT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_addgel_20260820\Addgel Products - Updated Website Stock.xlsx")
AUDIT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_addgel_20260820\addgel_stock_update_audit.json")


def clean(value) -> str:
    return "" if value is None else str(value).strip()


def load_products(path: Path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Products"]
    headers = [cell.value for cell in next(ws.iter_rows(max_row=1))]
    col = {header: idx + 1 for idx, header in enumerate(headers)}
    return wb, ws, col


def cell_value(ws, row: int, col: int):
    return ws.cell(row=row, column=col).value


def blank_equivalent(value):
    return "" if value is None else value


def main():
    audit = json.loads(AUDIT_FILE.read_text(encoding="utf-8"))

    src_wb, src_ws, src_col = load_products(SOURCE_FILE)
    out_wb, out_ws, out_col = load_products(OUTPUT_FILE)
    project_wb, project_ws, project_col = load_products(PROJECT_OUTPUT_FILE)

    problems = []
    if src_ws.max_row != out_ws.max_row or src_ws.max_column != out_ws.max_column:
        problems.append(
            f"Dimensions changed: source {src_ws.max_row}x{src_ws.max_column}, output {out_ws.max_row}x{out_ws.max_column}"
        )

    for header in ["Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]:
        if src_col.get(header) != out_col.get(header):
            problems.append(f"Column moved for {header}: source {src_col.get(header)}, output {out_col.get(header)}")

    # Shopify option/template columns must remain exactly as in the original.
    for col_idx in range(10, 16):  # J:O
        for row_idx in range(1, src_ws.max_row + 1):
            if blank_equivalent(cell_value(src_ws, row_idx, col_idx)) != blank_equivalent(cell_value(out_ws, row_idx, col_idx)):
                problems.append(
                    f"Template option column changed at row {row_idx}, col {col_idx}: "
                    f"{cell_value(src_ws, row_idx, col_idx)!r} -> {cell_value(out_ws, row_idx, col_idx)!r}"
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
        actual = cell_value(out_ws, row_idx, qty_col)
        project_actual = cell_value(project_ws, row_idx, project_col["Variant Inventory Qty"])
        if actual != expected:
            problems.append(f"Output Q mismatch row {row_idx}: expected {expected!r}, got {actual!r}")
        if project_actual != actual:
            problems.append(f"Downloads/project copy mismatch row {row_idx}: {actual!r} vs {project_actual!r}")
        if cell_value(src_ws, row_idx, qty_col) != actual:
            changed_rows.append(row_idx)
        if isinstance(actual, (int, float)) and actual < 0:
            negative_rows.append(row_idx)
        if cell_value(src_ws, row_idx, warehouse_col) != cell_value(out_ws, row_idx, warehouse_col):
            problems.append(f"Warehouse stock changed unexpectedly at row {row_idx}")
        if cell_value(src_ws, row_idx, shop_col) != cell_value(out_ws, row_idx, shop_col):
            problems.append(f"Shop stock changed unexpectedly at row {row_idx}")

    duplicate_summed = [
        {
            "row": row["website_row"],
            "sku": row["variant_sku"],
            "title": row["title"],
            "new_qty": row["new_variant_inventory_qty"],
            "busy_rows": [
                {
                    "busy_row": match["busy_row"],
                    "item_details": match["item_details"],
                    "cl_qty": match["cl_qty"],
                }
                for match in row["busy_matches"]
            ],
        }
        for row in audit["rows"]
        if row["status"] == "Matched - Busy Duplicates Summed"
    ]

    result = {
        "verified": not problems,
        "problems": problems,
        "rows_verified": len(audit["rows"]),
        "changed_rows": len(changed_rows),
        "negative_rows": negative_rows,
        "counts": audit["counts"],
        "duplicate_summed": duplicate_summed,
    }
    print(json.dumps(result, indent=2))
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

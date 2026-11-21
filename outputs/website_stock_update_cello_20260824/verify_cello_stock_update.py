from pathlib import Path
import json
import sys

import openpyxl


SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (18).xlsx")
OUTPUT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_cello_20260824\cello products - Updated Website Stock.xlsx")
DOWNLOADS_COPY = Path(r"C:\Users\My-PC-Win10\Downloads\cello products - Updated Website Stock.xlsx")
AUDIT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_cello_20260824\cello_stock_update_audit.json")


def text(value):
    return "" if value is None else str(value).strip()


def values_equal(left, right):
    if left is None and right == "":
        return True
    if right is None and left == "":
        return True
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return float(left) == float(right)
    return left == right


def header_map(sheet):
    return {text(cell.value): cell.column for cell in sheet[1]}


def workbook_values(path):
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb["Products"] if "Products" in wb.sheetnames else wb[wb.sheetnames[0]]
    values = [[cell.value for cell in row] for row in ws.iter_rows()]
    wb.close()
    return values


def main():
    with AUDIT_FILE.open("r", encoding="utf-8") as handle:
        audit = json.load(handle)

    src_wb = openpyxl.load_workbook(SOURCE_FILE, data_only=False)
    out_wb = openpyxl.load_workbook(OUTPUT_FILE, data_only=False)
    src_ws = src_wb["Products"] if "Products" in src_wb.sheetnames else src_wb[src_wb.sheetnames[0]]
    out_ws = out_wb["Products"] if "Products" in out_wb.sheetnames else out_wb[out_wb.sheetnames[0]]

    src_headers = header_map(src_ws)
    out_headers = header_map(out_ws)
    required = ["Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]
    errors = []

    if src_ws.max_row != out_ws.max_row or src_ws.max_column != out_ws.max_column:
        errors.append(
            f"Dimension changed: source {src_ws.max_row}x{src_ws.max_column}, output {out_ws.max_row}x{out_ws.max_column}"
        )

    for name in required:
        if src_headers.get(name) != out_headers.get(name):
            errors.append(f"Column moved for {name}: source {src_headers.get(name)}, output {out_headers.get(name)}")

    stock_col = out_headers["Variant Inventory Qty"]
    sku_col = out_headers["Variant SKU"]
    warehouse_col = out_headers["Warehouse Stock"]
    shop_col = out_headers["Shop Stock"]
    option_cols = range(10, 15)
    audit_by_row = {row["website_row"]: row for row in audit["rows"]}

    changed_rows = []
    no_match_rows = []
    negative_rows = []
    matched_rows = 0
    duplicate_summed_rows = 0

    for row_number in range(2, out_ws.max_row + 1):
        src_sku = text(src_ws.cell(row=row_number, column=sku_col).value)
        out_sku = text(out_ws.cell(row=row_number, column=sku_col).value)
        if src_sku != out_sku:
            errors.append(f"SKU changed at row {row_number}: {src_sku!r} -> {out_sku!r}")

        audit_row = audit_by_row.get(row_number)
        if out_sku and not audit_row:
            errors.append(f"Missing audit row for worksheet row {row_number}")
            continue

        if not out_sku:
            continue

        expected = audit_row["new_variant_inventory_qty"]
        actual = out_ws.cell(row=row_number, column=stock_col).value
        if not values_equal(actual, expected):
            errors.append(f"Stock mismatch at row {row_number} SKU {out_sku}: expected {expected!r}, got {actual!r}")

        src_qty = src_ws.cell(row=row_number, column=stock_col).value
        if not values_equal(src_qty, actual):
            changed_rows.append(row_number)

        for col in (warehouse_col, shop_col):
            if not values_equal(src_ws.cell(row=row_number, column=col).value, out_ws.cell(row=row_number, column=col).value):
                errors.append(f"Warehouse/shop column changed at row {row_number}, column {col}")

        for col in option_cols:
            if not values_equal(src_ws.cell(row=row_number, column=col).value, out_ws.cell(row=row_number, column=col).value):
                errors.append(f"Shopify option/helper column changed at row {row_number}, column {col}")

        if audit_row["status"] == "Matched":
            matched_rows += 1
        elif audit_row["status"] == "Matched - Busy Duplicates Summed":
            duplicate_summed_rows += 1
        elif audit_row["status"] == "No Busy Match":
            no_match_rows.append(
                {
                    "row": row_number,
                    "sku": out_sku,
                    "title": audit_row["title"],
                    "left_unchanged_qty": actual,
                }
            )
        else:
            errors.append(f"Unexpected audit status at row {row_number}: {audit_row['status']}")

        if isinstance(actual, (int, float)) and actual < 0:
            negative_rows.append({"row": row_number, "sku": out_sku, "title": audit_row["title"], "qty": actual})

    src_wb.close()
    out_wb.close()

    if workbook_values(OUTPUT_FILE) != workbook_values(DOWNLOADS_COPY):
        errors.append("Downloads copy differs from project output workbook")

    result = {
        "errors": errors,
        "sku_rows": len(audit["rows"]),
        "matched_rows": matched_rows,
        "duplicate_summed_rows": duplicate_summed_rows,
        "no_match_rows": no_match_rows,
        "changed_rows": len(changed_rows),
        "negative_rows": negative_rows,
        "warehouse_shop_preserved": not any("Warehouse/shop" in error for error in errors),
        "option_columns_preserved": not any("Shopify option/helper" in error for error in errors),
        "downloads_copy_matches": "Downloads copy differs from project output workbook" not in errors,
    }
    print(json.dumps(result, indent=2))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

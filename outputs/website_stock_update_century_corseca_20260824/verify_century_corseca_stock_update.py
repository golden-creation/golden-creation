from pathlib import Path
import json
import sys

import openpyxl


AUDIT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_century_corseca_20260824\century_corseca_stock_update_audit.json")


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


def verify_result(result):
    source = Path(result["source_file"])
    output = Path(result["output_file"])
    downloads = Path(result["downloads_copy"])
    source_wb = openpyxl.load_workbook(source, data_only=False)
    output_wb = openpyxl.load_workbook(output, data_only=False)
    source_ws = source_wb["Products"] if "Products" in source_wb.sheetnames else source_wb[source_wb.sheetnames[0]]
    output_ws = output_wb["Products"] if "Products" in output_wb.sheetnames else output_wb[output_wb.sheetnames[0]]

    errors = []
    if source_ws.max_row != output_ws.max_row or source_ws.max_column != output_ws.max_column:
        errors.append(
            f"{result['brand']}: dimension changed from {source_ws.max_row}x{source_ws.max_column} to {output_ws.max_row}x{output_ws.max_column}"
        )

    source_headers = header_map(source_ws)
    output_headers = header_map(output_ws)
    required = ["Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]
    for name in required:
        if source_headers.get(name) != output_headers.get(name):
            errors.append(f"{result['brand']}: column moved for {name}")

    sku_col = output_headers["Variant SKU"]
    stock_col = output_headers["Variant Inventory Qty"]
    warehouse_col = output_headers["Warehouse Stock"]
    shop_col = output_headers["Shop Stock"]
    option_cols = range(10, 15)
    audit_by_row = {row["website_row"]: row for row in result["rows"]}

    changed_rows = []
    negative_rows = []
    no_match_rows = []
    matched_rows = 0
    duplicate_summed_rows = 0

    for row_number in range(2, output_ws.max_row + 1):
        sku = text(output_ws.cell(row=row_number, column=sku_col).value)
        if not sku:
            continue
        if text(source_ws.cell(row=row_number, column=sku_col).value) != sku:
            errors.append(f"{result['brand']}: SKU changed at row {row_number}")

        audit_row = audit_by_row.get(row_number)
        if not audit_row:
            errors.append(f"{result['brand']}: missing audit row {row_number}")
            continue

        actual = output_ws.cell(row=row_number, column=stock_col).value
        expected = audit_row["new_variant_inventory_qty"]
        if not values_equal(actual, expected):
            errors.append(f"{result['brand']}: row {row_number} SKU {sku} expected {expected!r}, got {actual!r}")

        source_qty = source_ws.cell(row=row_number, column=stock_col).value
        if not values_equal(source_qty, actual):
            changed_rows.append(row_number)

        for col in (warehouse_col, shop_col):
            if not values_equal(source_ws.cell(row=row_number, column=col).value, output_ws.cell(row=row_number, column=col).value):
                errors.append(f"{result['brand']}: warehouse/shop changed at row {row_number}, col {col}")

        for col in option_cols:
            if not values_equal(source_ws.cell(row=row_number, column=col).value, output_ws.cell(row=row_number, column=col).value):
                errors.append(f"{result['brand']}: Shopify option/helper col changed at row {row_number}, col {col}")

        if audit_row["status"] == "Matched":
            matched_rows += 1
        elif audit_row["status"] == "Matched - Busy Duplicates Summed":
            duplicate_summed_rows += 1
        elif audit_row["status"] == "No Busy Match":
            no_match_rows.append(
                {
                    "row": row_number,
                    "sku": sku,
                    "title": audit_row["title"],
                    "left_unchanged_qty": actual,
                }
            )
        else:
            errors.append(f"{result['brand']}: unexpected audit status {audit_row['status']} at row {row_number}")

        if isinstance(actual, (int, float)) and actual < 0:
            negative_rows.append({"row": row_number, "sku": sku, "title": audit_row["title"], "qty": actual})

    source_wb.close()
    output_wb.close()

    if workbook_values(output) != workbook_values(downloads):
        errors.append(f"{result['brand']}: downloads copy differs from project output")

    return {
        "brand": result["brand"],
        "errors": errors,
        "sku_rows": len(result["rows"]),
        "matched_rows": matched_rows,
        "duplicate_summed_rows": duplicate_summed_rows,
        "no_match_rows": no_match_rows,
        "changed_rows": len(changed_rows),
        "negative_rows": negative_rows,
        "warehouse_shop_preserved": not any("warehouse/shop" in error for error in errors),
        "option_columns_preserved": not any("Shopify option/helper" in error for error in errors),
        "downloads_copy_matches": not any("downloads copy differs" in error for error in errors),
    }


def main():
    with AUDIT_FILE.open("r", encoding="utf-8") as handle:
        audit = json.load(handle)
    results = [verify_result(result) for result in audit["results"]]
    print(json.dumps(results, indent=2))
    if any(result["errors"] for result in results):
        sys.exit(1)


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
import sys
from pathlib import Path

import openpyxl


AUDIT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_hq_20260831\hq_stock_update_audit.json")


def norm(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def header_map(ws) -> dict[str, int]:
    return {str(cell.value).strip(): idx for idx, cell in enumerate(ws[1], start=1) if cell.value is not None}


def workbook_values(path: Path):
    wb = openpyxl.load_workbook(path, data_only=False, read_only=True)
    payload = []
    for ws in wb.worksheets:
        payload.append((ws.title, tuple(tuple(cell.value for cell in row) for row in ws.iter_rows())))
    wb.close()
    return payload


def main() -> None:
    audit = json.loads(AUDIT_FILE.read_text(encoding="utf-8"))
    source = Path(audit["source_file"])
    output = Path(audit["output_file"])
    downloads = Path(audit["downloads_copy"])

    source_wb = openpyxl.load_workbook(source, data_only=False, read_only=True)
    output_wb = openpyxl.load_workbook(output, data_only=False, read_only=True)
    source_ws = source_wb.active
    output_ws = output_wb.active
    source_headers = header_map(source_ws)
    output_headers = header_map(output_ws)

    errors: list[str] = []
    changed_rows = []
    no_match_rows = []
    duplicate_summed_rows = []
    negative_rows = []

    if source_ws.max_row != output_ws.max_row or source_ws.max_column != output_ws.max_column:
        errors.append("Workbook dimensions changed")

    for header in ["Title", "Brand", "Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]:
        if source_headers.get(header) != output_headers.get(header):
            errors.append(f"Header position changed for {header}")

    for audit_row in audit["rows"]:
        row_number = audit_row["row"]
        source_sku = norm(source_ws.cell(row_number, source_headers["Variant SKU"]).value)
        output_sku = norm(output_ws.cell(row_number, output_headers["Variant SKU"]).value)
        actual_qty = output_ws.cell(row_number, output_headers["Variant Inventory Qty"]).value

        if source_sku != output_sku or output_sku != audit_row["sku"]:
            errors.append(f"SKU mismatch at row {row_number}")
        if actual_qty != audit_row["new_qty"]:
            errors.append(f"Stock mismatch for SKU {audit_row['sku']} at row {row_number}")

        if audit_row["old_qty"] != audit_row["new_qty"]:
            changed_rows.append(
                {
                    "row": row_number,
                    "sku": audit_row["sku"],
                    "old_qty": audit_row["old_qty"],
                    "new_qty": audit_row["new_qty"],
                }
            )
        if audit_row["status"] == "No Busy Match":
            no_match_rows.append({"row": row_number, "sku": audit_row["sku"], "title": audit_row["title"]})
        elif audit_row["status"] == "Duplicate Busy SKU Summed":
            duplicate_summed_rows.append(
                {
                    "row": row_number,
                    "sku": audit_row["sku"],
                    "new_qty": audit_row["new_qty"],
                    "busy_match_count": len(audit_row["busy_matches"]),
                }
            )
        elif audit_row["status"] != "Matched":
            errors.append(f"Unexpected audit status {audit_row['status']}")

        if isinstance(actual_qty, (int, float)) and actual_qty < 0:
            negative_rows.append({"row": row_number, "sku": audit_row["sku"], "qty": actual_qty})

    for col_name in ["Warehouse Stock", "Shop Stock"]:
        for row_number in range(2, source_ws.max_row + 1):
            if source_ws.cell(row_number, source_headers[col_name]).value != output_ws.cell(
                row_number, output_headers[col_name]
            ).value:
                errors.append(f"{col_name} changed at row {row_number}")

    for col_number in range(10, 15):
        for row_number in range(1, source_ws.max_row + 1):
            if source_ws.cell(row_number, col_number).value != output_ws.cell(row_number, col_number).value:
                errors.append(f"Shopify option/helper column {col_number} changed at row {row_number}")

    source_wb.close()
    output_wb.close()

    if workbook_values(output) != workbook_values(downloads):
        errors.append("Downloads copy differs from project output")

    result = {
        "errors": errors,
        "sku_rows": len(audit["rows"]),
        "matched_rows": sum(1 for row in audit["rows"] if row["status"] == "Matched"),
        "changed_rows": len(changed_rows),
        "duplicate_summed_rows": duplicate_summed_rows,
        "no_match_rows": no_match_rows,
        "negative_rows": negative_rows,
        "warehouse_shop_preserved": not any("Warehouse Stock" in error or "Shop Stock" in error for error in errors),
        "option_columns_preserved": not any("Shopify option/helper" in error for error in errors),
        "downloads_copy_matches": "Downloads copy differs from project output" not in errors,
    }
    print(json.dumps(result, indent=2))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

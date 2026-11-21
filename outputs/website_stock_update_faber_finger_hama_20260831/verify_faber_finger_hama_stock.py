from __future__ import annotations

import json
import sys
from pathlib import Path

import openpyxl


OUTPUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_faber_finger_hama_20260831")
AUDIT_FILE = OUTPUT_DIR / "faber_finger_hama_stock_update_audit.json"


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
    errors: list[str] = []
    summary = []

    for result in audit["results"]:
        source = Path(result["source"])
        output = Path(result["output"])
        downloads = Path(result["downloads_copy"])
        source_wb = openpyxl.load_workbook(source, data_only=False, read_only=True)
        output_wb = openpyxl.load_workbook(output, data_only=False, read_only=True)
        source_ws = source_wb.active
        output_ws = output_wb.active
        source_headers = header_map(source_ws)
        output_headers = header_map(output_ws)

        if source_ws.max_row != output_ws.max_row or source_ws.max_column != output_ws.max_column:
            errors.append(f"{result['brand']}: workbook dimensions changed")

        required = ["Title", "Brand", "Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]
        for header in required:
            if source_headers.get(header) != output_headers.get(header):
                errors.append(f"{result['brand']}: header position changed for {header}")

        rows_by_number = {row["row"]: row for row in result["rows"]}
        changed_rows = []
        no_match_rows = []
        duplicate_summed_rows = []
        negative_rows = []

        for row_number, audit_row in rows_by_number.items():
            sku_col = output_headers["Variant SKU"]
            qty_col = output_headers["Variant Inventory Qty"]
            source_sku = norm(source_ws.cell(row_number, source_headers["Variant SKU"]).value)
            output_sku = norm(output_ws.cell(row_number, sku_col).value)
            if source_sku != output_sku or output_sku != audit_row["sku"]:
                errors.append(f"{result['brand']}: SKU mismatch at row {row_number}")

            actual_qty = output_ws.cell(row_number, qty_col).value
            if actual_qty != audit_row["new_qty"]:
                errors.append(
                    f"{result['brand']}: stock mismatch for SKU {audit_row['sku']} at row {row_number}: "
                    f"expected {audit_row['new_qty']}, got {actual_qty}"
                )

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
                no_match_rows.append(
                    {
                        "row": row_number,
                        "sku": audit_row["sku"],
                        "title": audit_row["title"],
                        "left_unchanged_qty": actual_qty,
                    }
                )
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
                errors.append(f"{result['brand']}: unexpected audit status {audit_row['status']}")

            if isinstance(actual_qty, (int, float)) and actual_qty < 0:
                negative_rows.append({"row": row_number, "sku": audit_row["sku"], "qty": actual_qty})

        for col_name in ["Warehouse Stock", "Shop Stock"]:
            src_col = source_headers[col_name]
            out_col = output_headers[col_name]
            for row_number in range(2, source_ws.max_row + 1):
                if source_ws.cell(row_number, src_col).value != output_ws.cell(row_number, out_col).value:
                    errors.append(f"{result['brand']}: {col_name} changed at row {row_number}")

        for col_number in range(10, 15):
            for row_number in range(1, source_ws.max_row + 1):
                if source_ws.cell(row_number, col_number).value != output_ws.cell(row_number, col_number).value:
                    errors.append(
                        f"{result['brand']}: Shopify option/helper column {col_number} changed at row {row_number}"
                    )

        source_wb.close()
        output_wb.close()

        if workbook_values(output) != workbook_values(downloads):
            errors.append(f"{result['brand']}: Downloads copy differs from project output")

        summary.append(
            {
                "brand": result["brand"],
                "sku_rows": len(result["rows"]),
                "matched_rows": sum(1 for row in result["rows"] if row["status"] == "Matched"),
                "changed_rows": changed_rows,
                "no_match_rows": no_match_rows,
                "duplicate_summed_rows": duplicate_summed_rows,
                "negative_rows": negative_rows,
                "downloads_copy_matches": True,
            }
        )

    print(json.dumps({"errors": errors, "summary": summary}, indent=2))
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

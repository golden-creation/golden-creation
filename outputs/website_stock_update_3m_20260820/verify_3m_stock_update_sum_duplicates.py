import json
from pathlib import Path

import openpyxl


OUTPUT_FILE = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3M Products for Website Stock - Updated Sum Duplicates.xlsx"
)
AUDIT_FILE = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_sum_duplicates_audit.json"
)


def main():
    audit = json.loads(AUDIT_FILE.read_text(encoding="utf-8"))
    workbook = openpyxl.load_workbook(OUTPUT_FILE, read_only=True, data_only=True)
    sheet = workbook["Products"]
    mismatches = []
    option_cells_changed = []
    for row in audit["rows"]:
        actual_sku = str(sheet.cell(row["excel_row"], 16).value or "").strip()
        actual_qty = sheet.cell(row["excel_row"], 17).value
        if actual_sku != row["sku"] or actual_qty != row["new_variant_inventory_qty"]:
            mismatches.append(
                {
                    "row": row["excel_row"],
                    "sku": actual_sku,
                    "expected_sku": row["sku"],
                    "actual_qty": actual_qty,
                    "expected_qty": row["new_variant_inventory_qty"],
                }
            )
    for row_number in range(2, sheet.max_row + 1):
        for col in range(10, 16):
            value = sheet.cell(row_number, col).value
            if value not in (None, ""):
                option_cells_changed.append((sheet.cell(row_number, col).coordinate, value))
    print(f"Rows: {sheet.max_row}; columns: {sheet.max_column}")
    print(f"Mismatches: {len(mismatches)}")
    print(f"Nonblank option cells J:O: {len(option_cells_changed)}")
    print(f"8536 Q value: {sheet['Q24'].value}")
    print(f"Summed duplicate rows: {len(audit['summed_duplicate_rows'])}")
    for row in audit["summed_duplicate_rows"]:
        print(row["sku"], row["new_variant_inventory_qty"], row["busy_rows"])
    if mismatches:
        raise SystemExit(mismatches)
    if option_cells_changed:
        raise SystemExit(option_cells_changed[:10])


if __name__ == "__main__":
    main()

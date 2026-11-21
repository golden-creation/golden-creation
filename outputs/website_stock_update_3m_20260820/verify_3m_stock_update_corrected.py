from pathlib import Path
import json

import openpyxl


OUTPUT_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Corrected.xlsx")
PLAN_FILE = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_plan_corrected.json"
)
EXPECTED_MANUAL = {"8536": 2}


def main():
    plan = json.loads(PLAN_FILE.read_text(encoding="utf-8"))
    workbook = openpyxl.load_workbook(OUTPUT_FILE, read_only=True, data_only=True)
    sheet = workbook["Products"]
    mismatches = []
    nonblank_option_cells = []
    q_values = []
    for item in plan["rows"]:
        row = item["excel_row"]
        sku = str(sheet.cell(row, 16).value or "").strip()
        actual = sheet.cell(row, 17).value
        expected = EXPECTED_MANUAL.get(sku, item["new_variant_inventory_qty"])
        if expected is None:
            expected = item["old_variant_inventory_qty"]
        if sku != item["sku"] or actual != expected:
            mismatches.append(
                {
                    "row": row,
                    "sku": sku,
                    "planned_sku": item["sku"],
                    "actual": actual,
                    "expected": expected,
                }
            )
        q_values.append((row, sku, actual))

    for row in range(2, sheet.max_row + 1):
        for col in range(10, 16):
            value = sheet.cell(row, col).value
            if value not in (None, ""):
                nonblank_option_cells.append((sheet.cell(row, col).coordinate, value))

    print(f"Workbook: {OUTPUT_FILE}")
    print(f"Rows: {sheet.max_row}; columns: {sheet.max_column}")
    print(f"Mismatches: {len(mismatches)}")
    print(f"Nonblank option cells J:O: {len(nonblank_option_cells)}")
    print("Q values:")
    for value in q_values:
        print(value)
    if mismatches:
        raise SystemExit(mismatches)
    if nonblank_option_cells:
        raise SystemExit(nonblank_option_cells[:10])


if __name__ == "__main__":
    main()

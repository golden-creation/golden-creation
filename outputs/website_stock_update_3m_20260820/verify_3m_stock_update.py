import json
from pathlib import Path

import openpyxl


UPDATED_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Updated.xlsx")
PLAN_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_plan.json")


def main():
    plan = json.loads(PLAN_FILE.read_text(encoding="utf-8"))
    workbook = openpyxl.load_workbook(UPDATED_FILE, read_only=True, data_only=True)
    sheet = workbook["Products"]
    mismatches = []
    for item in plan["rows"]:
        actual = sheet.cell(item["excel_row"], 17).value
        expected = item["new_variant_inventory_qty"]
        if actual != expected:
            mismatches.append((item["excel_row"], item["sku"], actual, expected))

    option_cells_changed = []
    for row in range(2, sheet.max_row + 1):
        for col in range(10, 16):
            value = sheet.cell(row, col).value
            if value not in (None, ""):
                option_cells_changed.append((sheet.cell(row, col).coordinate, value))

    q_values = [
        {
            "row": row,
            "sku": sheet.cell(row, 16).value,
            "variant_inventory_qty": sheet.cell(row, 17).value,
        }
        for row in range(2, sheet.max_row + 1)
    ]
    print(f"Rows: {sheet.max_row}; Columns: {sheet.max_column}")
    print(f"Mismatches: {len(mismatches)}")
    print(f"Nonblank option cells J:O: {len(option_cells_changed)}")
    print("Q values:")
    for item in q_values:
        print(item)
    if mismatches:
        raise SystemExit(f"Mismatches found: {mismatches}")


if __name__ == "__main__":
    main()

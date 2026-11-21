from pathlib import Path
import json

import openpyxl


SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock.xlsx")
OUTPUT_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Corrected.xlsx")
PLAN_FILE = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_plan_corrected.json"
)

# User-confirmed duplicate-code correction. Busy contains two ITEM CODE 8536 rows;
# the valid website stock for the 3M SKU 8536 is 2, not the later duplicate 17.
MANUAL_CONFIRMED_QTY = {"8536": 2}


def main():
    plan = json.loads(PLAN_FILE.read_text(encoding="utf-8"))
    workbook = openpyxl.load_workbook(SOURCE_FILE)
    sheet = workbook[plan["sheet"]]
    headers = [cell.value for cell in sheet[1]]
    header_index = {header: idx + 1 for idx, header in enumerate(headers)}
    sku_col = header_index["Variant SKU"]
    stock_col = header_index["Variant Inventory Qty"]
    if stock_col != 17:
        raise RuntimeError(f"Expected Variant Inventory Qty in column Q/17, found {stock_col}")

    audit_rows = []
    for update in plan["rows"]:
        row_number = update["excel_row"]
        sku = str(sheet.cell(row_number, sku_col).value or "").strip()
        if sku != update["sku"]:
            raise RuntimeError(f"SKU mismatch at row {row_number}: sheet={sku} plan={update['sku']}")
        if sku in MANUAL_CONFIRMED_QTY:
            new_qty = MANUAL_CONFIRMED_QTY[sku]
            reason = "manual duplicate-code correction confirmed by user"
        elif update["status"] == "Matched":
            new_qty = update["new_variant_inventory_qty"]
            reason = update["match_reason"]
        else:
            # Conservative fallback: leave current website stock unchanged when Busy is ambiguous.
            new_qty = sheet.cell(row_number, stock_col).value
            reason = f"left unchanged: {update['match_reason']}"
        sheet.cell(row_number, stock_col).value = new_qty
        audit_rows.append(
            {
                "row": row_number,
                "sku": sku,
                "title": update["title"],
                "new_qty": new_qty,
                "reason": reason,
                "candidate_count": update["candidate_count"],
                "candidate_busy_rows": update["candidate_busy_rows"],
            }
        )

    workbook.save(OUTPUT_FILE)
    print(f"Saved {OUTPUT_FILE}")
    print("Audit:")
    for row in audit_rows:
        print(f"{row['row']} {row['sku']} -> {row['new_qty']} | {row['reason']}")


if __name__ == "__main__":
    main()

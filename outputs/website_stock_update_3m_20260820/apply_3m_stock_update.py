from pathlib import Path
import shutil

import openpyxl


TARGET_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock.xlsx")
UPDATED_COPY = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Updated.xlsx")
UPDATE_PLAN = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_plan.json")
BACKUP_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3M Products for Website Stock.before_update.xlsx")


def main():
    import json

    plan = json.loads(UPDATE_PLAN.read_text(encoding="utf-8"))
    if not BACKUP_FILE.exists():
        shutil.copy2(TARGET_FILE, BACKUP_FILE)

    workbook = openpyxl.load_workbook(TARGET_FILE)
    sheet = workbook[plan["sheet"]]
    headers = [cell.value for cell in sheet[1]]
    header_index = {header: idx + 1 for idx, header in enumerate(headers)}

    sku_col = header_index["Variant SKU"]
    stock_col = header_index["Variant Inventory Qty"]
    if stock_col != 17:
        raise RuntimeError(f"Expected Variant Inventory Qty in column Q/17, found {stock_col}")

    updates_by_row = {row["excel_row"]: row for row in plan["rows"]}
    changed = 0
    for excel_row, update in updates_by_row.items():
        sku = str(sheet.cell(excel_row, sku_col).value or "").strip()
        if sku != update["sku"]:
            raise RuntimeError(f"SKU mismatch at row {excel_row}: sheet={sku} plan={update['sku']}")
        new_qty = update["new_variant_inventory_qty"]
        if new_qty is None:
            continue
        cell = sheet.cell(excel_row, stock_col)
        if cell.value != new_qty:
            changed += 1
        cell.value = new_qty

    try:
        workbook.save(TARGET_FILE)
        saved_to = TARGET_FILE
    except PermissionError:
        workbook.save(UPDATED_COPY)
        saved_to = UPDATED_COPY
    print(f"Updated {saved_to}")
    print(f"Backup {BACKUP_FILE}")
    print(f"Rows updated: {len(updates_by_row)}; changed values: {changed}")


if __name__ == "__main__":
    main()

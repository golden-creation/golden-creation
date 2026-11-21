import json
from pathlib import Path

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
TARGET_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock.xlsx")
OUTPUT_JSON = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_plan.json")


def text(value):
    return "" if value is None else str(value).strip()


def load_busy_lookup():
    workbook = openpyxl.load_workbook(BUSY_FILE, read_only=True, data_only=True)
    sheet = workbook["Sheet1"]
    headers = [cell.value for cell in next(sheet.iter_rows(max_row=1))]
    idx = {header: pos for pos, header in enumerate(headers)}
    lookup = {}
    duplicates = {}
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        code = text(row[idx["ITEM CODE"]])
        if not code:
            continue
        qty = row[idx["Cl. Qty"]]
        item_group = text(row[idx["ITEM GROUP"]])
        item_details = text(row[idx["Item Details"]])
        record = {
            "busy_row": row_number,
            "item_code": code,
            "item_group": item_group,
            "item_details": item_details,
            "cl_qty": qty,
        }
        if code in lookup:
            duplicates.setdefault(code, [lookup[code]]).append(record)
        lookup[code] = record
    return lookup, duplicates


def main():
    lookup, duplicates = load_busy_lookup()
    workbook = openpyxl.load_workbook(TARGET_FILE, read_only=True, data_only=True)
    sheet = workbook["Products"]
    headers = [cell.value for cell in next(sheet.iter_rows(max_row=1))]
    idx = {header: pos for pos, header in enumerate(headers)}

    rows = []
    changed = []
    unchanged = []
    missing = []
    duplicate_match = []
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        sku = text(row[idx["Variant SKU"]])
        current_qty = row[idx["Variant Inventory Qty"]]
        title = text(row[idx["Title"]])
        brand = text(row[idx["Brand"]])
        busy = lookup.get(sku)
        status = "Matched"
        new_qty = None
        notes = ""
        if not busy:
            status = "No Busy Match"
            notes = "No exact ITEM CODE match found in Busy file"
            missing.append({"excel_row": row_number, "sku": sku, "title": title})
        else:
            new_qty = busy["cl_qty"]
            if sku in duplicates:
                status = "Duplicate Busy Code"
                notes = "Busy file has duplicate ITEM CODE rows; using the last occurrence found"
                duplicate_match.append({"excel_row": row_number, "sku": sku, "title": title, "matches": duplicates[sku]})
            if current_qty == new_qty:
                unchanged.append({"excel_row": row_number, "sku": sku, "title": title, "qty": current_qty})
            else:
                changed.append({"excel_row": row_number, "sku": sku, "title": title, "old_qty": current_qty, "new_qty": new_qty})
        rows.append(
            {
                "excel_row": row_number,
                "sku": sku,
                "handle": text(row[idx["Handle"]]),
                "title": title,
                "brand": brand,
                "old_variant_inventory_qty": current_qty,
                "new_variant_inventory_qty": new_qty,
                "busy_item_group": busy["item_group"] if busy else "",
                "busy_item_details": busy["item_details"] if busy else "",
                "busy_row": busy["busy_row"] if busy else "",
                "status": status,
                "notes": notes,
            }
        )

    payload = {
        "busy_file": str(BUSY_FILE),
        "target_file": str(TARGET_FILE),
        "sheet": "Products",
        "sku_column": "P",
        "website_stock_column": "Q",
        "website_stock_header": "Variant Inventory Qty",
        "target_rows": len(rows),
        "matched_rows": sum(1 for row in rows if row["status"] in ("Matched", "Duplicate Busy Code")),
        "missing_rows": len(missing),
        "changed_rows": len(changed),
        "unchanged_rows": len(unchanged),
        "duplicate_busy_code_rows": len(duplicate_match),
        "negative_new_qty_rows": sum(
            1
            for row in rows
            if isinstance(row["new_variant_inventory_qty"], (int, float)) and row["new_variant_inventory_qty"] < 0
        ),
        "rows": rows,
        "changed": changed,
        "missing": missing,
        "duplicate_match": duplicate_match,
    }
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")
    print(
        f"Rows {payload['target_rows']}; matched {payload['matched_rows']}; "
        f"missing {payload['missing_rows']}; changed {payload['changed_rows']}; "
        f"negative new qty {payload['negative_new_qty_rows']}"
    )
    for item in changed:
        print(f"{item['excel_row']} {item['sku']}: {item['old_qty']} -> {item['new_qty']} | {item['title']}")
    if missing:
        print("Missing:")
        for item in missing:
            print(f"{item['excel_row']} {item['sku']} | {item['title']}")


if __name__ == "__main__":
    main()

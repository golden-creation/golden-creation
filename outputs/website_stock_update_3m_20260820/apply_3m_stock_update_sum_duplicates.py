from collections import defaultdict
from pathlib import Path
import json
import shutil

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock.xlsx")
OUTPUT_FILE = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3M Products for Website Stock - Updated Sum Duplicates.xlsx"
)
AUDIT_FILE = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_sum_duplicates_audit.json"
)


def text(value):
    return "" if value is None else str(value).strip()


def load_busy_by_code():
    print("Loading Busy workbook...", flush=True)
    workbook = openpyxl.load_workbook(BUSY_FILE, read_only=True, data_only=True)
    print("Busy workbook loaded", flush=True)
    sheet = workbook["Sheet1"]
    headers = [cell.value for cell in sheet[1]]
    idx = {header: pos + 1 for pos, header in enumerate(headers)}
    by_code = defaultdict(list)
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        code = text(row[idx["ITEM CODE"] - 1])
        if not code:
            continue
        qty = row[idx["Cl. Qty"] - 1]
        if not isinstance(qty, (int, float)):
            continue
        by_code[code].append(
            {
                "busy_row": row_number,
                "item_code": code,
                "item_group": text(row[idx["ITEM GROUP"] - 1]),
                "item_details": text(row[idx["Item Details"] - 1]),
                "cl_qty": qty,
            }
        )
    return by_code


def main():
    busy_by_code = load_busy_by_code()
    print("Copying source workbook...", flush=True)
    shutil.copy2(SOURCE_FILE, OUTPUT_FILE)
    print("Loading output workbook copy...", flush=True)
    workbook = openpyxl.load_workbook(OUTPUT_FILE)
    print("Output workbook loaded", flush=True)
    sheet = workbook["Products"]
    headers = [cell.value for cell in sheet[1]]
    idx = {header: pos + 1 for pos, header in enumerate(headers)}
    sku_col = idx["Variant SKU"]
    stock_col = idx["Variant Inventory Qty"]
    if stock_col != 17:
        raise RuntimeError(f"Expected Variant Inventory Qty in column Q/17, found {stock_col}")

    website_code_counts = defaultdict(int)
    for row_number in range(2, sheet.max_row + 1):
        sku = text(sheet.cell(row_number, sku_col).value)
        if sku:
            website_code_counts[sku] += 1

    audit_rows = []
    for row_number in range(2, sheet.max_row + 1):
        sku = text(sheet.cell(row_number, sku_col).value)
        title = text(sheet.cell(row_number, idx["Title"]).value)
        old_qty = sheet.cell(row_number, stock_col).value
        candidates = busy_by_code.get(sku, [])
        if not candidates:
            new_qty = old_qty
            status = "No Busy Match - left unchanged"
        elif len(candidates) == 1:
            new_qty = candidates[0]["cl_qty"]
            status = "Matched single Busy row"
        elif website_code_counts[sku] == 1:
            new_qty = sum(candidate["cl_qty"] for candidate in candidates)
            status = "Summed duplicate Busy rows for one website SKU"
        else:
            new_qty = old_qty
            status = "Ambiguous duplicate Busy rows and duplicate website SKU - left unchanged"
        sheet.cell(row_number, stock_col).value = new_qty
        audit_rows.append(
            {
                "excel_row": row_number,
                "sku": sku,
                "title": title,
                "old_variant_inventory_qty": old_qty,
                "new_variant_inventory_qty": new_qty,
                "status": status,
                "busy_candidate_count": len(candidates),
                "busy_rows": candidates,
            }
        )

    print("Saving output workbook...", flush=True)
    workbook.save(OUTPUT_FILE)
    print("Output workbook saved", flush=True)
    AUDIT_FILE.write_text(
        json.dumps(
            {
                "busy_file": str(BUSY_FILE),
                "source_file": str(SOURCE_FILE),
                "output_file": str(OUTPUT_FILE),
                "rule": "If Busy has multiple rows for the same ITEM CODE and the website sheet has only one SKU row for that code, sum all Busy Cl. Qty values and use the total as Variant Inventory Qty.",
                "rows": audit_rows,
                "changed_rows": sum(
                    1 for row in audit_rows if row["old_variant_inventory_qty"] != row["new_variant_inventory_qty"]
                ),
                "summed_duplicate_rows": [
                    row for row in audit_rows if row["status"] == "Summed duplicate Busy rows for one website SKU"
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Saved {OUTPUT_FILE}")
    print(f"Audit {AUDIT_FILE}")
    for row in audit_rows:
        print(
            f"{row['excel_row']} {row['sku']} {row['old_variant_inventory_qty']} -> "
            f"{row['new_variant_inventory_qty']} | {row['status']}"
        )


if __name__ == "__main__":
    main()

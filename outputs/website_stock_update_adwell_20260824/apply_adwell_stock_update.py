from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
import json
import shutil

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (8).xlsx")
OUTPUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_adwell_20260824")
OUTPUT_FILE = OUTPUT_DIR / "adwell products - Updated Website Stock.xlsx"
DOWNLOADS_COPY = Path(r"C:\Users\My-PC-Win10\Downloads\adwell products - Updated Website Stock.xlsx")
AUDIT_FILE = OUTPUT_DIR / "adwell_stock_update_audit.json"


def clean(value) -> str:
    return "" if value is None else str(value).strip()


def load_busy_by_code():
    wb = openpyxl.load_workbook(BUSY_FILE, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    headers = [cell.value for cell in next(ws.iter_rows(max_row=1))]
    col = {header: idx for idx, header in enumerate(headers)}

    busy_by_code = defaultdict(list)
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        item_code = clean(row[col["ITEM CODE"]])
        if not item_code:
            continue

        qty = row[col["Cl. Qty"]]
        if not isinstance(qty, (int, float)):
            continue

        busy_by_code[item_code].append(
            {
                "busy_row": row_number,
                "item_code": item_code,
                "item_details": clean(row[col["Item Details"]]),
                "item_group": clean(row[col["ITEM GROUP"]]),
                "cl_qty": qty,
            }
        )
    return busy_by_code


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE_FILE, OUTPUT_FILE)

    busy_by_code = load_busy_by_code()
    wb = openpyxl.load_workbook(OUTPUT_FILE)
    ws = wb["Products"]
    headers = [cell.value for cell in ws[1]]
    col = {header: idx + 1 for idx, header in enumerate(headers)}

    sku_col = col["Variant SKU"]
    qty_col = col["Variant Inventory Qty"]
    title_col = col["Title"]

    website_skus = [
        clean(ws.cell(row=row_number, column=sku_col).value)
        for row_number in range(2, ws.max_row + 1)
        if clean(ws.cell(row=row_number, column=sku_col).value)
    ]
    website_sku_counts = Counter(website_skus)

    audit_rows = []
    counts = Counter()
    changed_count = 0

    for row_number in range(2, ws.max_row + 1):
        sku = clean(ws.cell(row=row_number, column=sku_col).value)
        if not sku:
            continue

        title = clean(ws.cell(row=row_number, column=title_col).value)
        old_qty = ws.cell(row=row_number, column=qty_col).value
        matches = busy_by_code.get(sku, [])

        status = "No Busy Match"
        new_qty = old_qty
        action = "left unchanged"

        if len(matches) == 1:
            status = "Matched"
            new_qty = matches[0]["cl_qty"]
            action = "updated from single Busy row"
        elif len(matches) > 1 and website_sku_counts[sku] == 1:
            status = "Matched - Busy Duplicates Summed"
            new_qty = sum(match["cl_qty"] for match in matches)
            action = "updated from summed Busy rows"
        elif len(matches) > 1:
            status = "Needs Review - Duplicate Website SKU and Busy SKU"
            action = "left unchanged because both files contain duplicates"

        ws.cell(row=row_number, column=qty_col).value = new_qty

        if old_qty != new_qty:
            changed_count += 1
        counts[status] += 1
        audit_rows.append(
            {
                "website_row": row_number,
                "variant_sku": sku,
                "title": title,
                "old_variant_inventory_qty": old_qty,
                "new_variant_inventory_qty": new_qty,
                "status": status,
                "action": action,
                "busy_matches": matches,
            }
        )

    wb.save(OUTPUT_FILE)

    copy_status = "copied"
    try:
        shutil.copy2(OUTPUT_FILE, DOWNLOADS_COPY)
    except PermissionError as exc:
        copy_status = f"not copied: {exc}"

    audit = {
        "source_file": str(SOURCE_FILE),
        "busy_file": str(BUSY_FILE),
        "output_file": str(OUTPUT_FILE),
        "downloads_copy": str(DOWNLOADS_COPY),
        "downloads_copy_status": copy_status,
        "target_sheet": "Products",
        "lookup_column": "Variant SKU",
        "updated_column": "Variant Inventory Qty",
        "counts": dict(counts),
        "website_sku_rows": len(website_skus),
        "website_unique_skus": len(website_sku_counts),
        "website_duplicate_skus": {sku: count for sku, count in website_sku_counts.items() if count > 1},
        "changed_rows": changed_count,
        "rows": audit_rows,
    }
    AUDIT_FILE.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                k: audit[k]
                for k in [
                    "output_file",
                    "downloads_copy",
                    "downloads_copy_status",
                    "counts",
                    "changed_rows",
                    "website_sku_rows",
                    "website_unique_skus",
                    "website_duplicate_skus",
                ]
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

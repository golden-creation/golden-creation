from collections import Counter, defaultdict
from pathlib import Path
import json
import shutil

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
OUTPUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_century_corseca_20260824")
AUDIT_FILE = OUTPUT_DIR / "century_corseca_stock_update_audit.json"

JOBS = [
    {
        "brand": "Century",
        "source": Path(r"C:\Users\My-PC-Win10\Downloads\website-products (19).xlsx"),
        "output": OUTPUT_DIR / "century products - Updated Website Stock.xlsx",
        "downloads_copy": Path(r"C:\Users\My-PC-Win10\Downloads\century products - Updated Website Stock.xlsx"),
    },
    {
        "brand": "Corseca",
        "source": Path(r"C:\Users\My-PC-Win10\Downloads\website-products (20).xlsx"),
        "output": OUTPUT_DIR / "corseca products - Updated Website Stock.xlsx",
        "downloads_copy": Path(r"C:\Users\My-PC-Win10\Downloads\corseca products - Updated Website Stock.xlsx"),
    },
]


def text(value):
    return "" if value is None else str(value).strip()


def qty_number(value):
    if isinstance(value, (int, float)):
        return value
    if value is None:
        return None
    value = str(value).strip().replace(",", "")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def clean_qty(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def header_map(sheet):
    return {text(cell.value): cell.column for cell in sheet[1]}


def load_busy_by_code():
    busy_wb = openpyxl.load_workbook(BUSY_FILE, read_only=True, data_only=True)
    busy_ws = busy_wb[busy_wb.sheetnames[0]]
    busy_headers = {text(cell.value): idx for idx, cell in enumerate(next(busy_ws.iter_rows(max_row=1)))}

    required = ["ITEM CODE", "ITEM GROUP", "Item Details", "Cl. Qty"]
    missing = [name for name in required if name not in busy_headers]
    if missing:
        raise RuntimeError(f"Busy workbook missing required columns: {missing}")

    by_code = defaultdict(list)
    for row_number, row in enumerate(busy_ws.iter_rows(min_row=2, values_only=True), start=2):
        sku = text(row[busy_headers["ITEM CODE"]])
        quantity = qty_number(row[busy_headers["Cl. Qty"]])
        if not sku or quantity is None:
            continue
        by_code[sku].append(
            {
                "busy_row": row_number,
                "item_code": sku,
                "item_details": text(row[busy_headers["Item Details"]]),
                "item_group": text(row[busy_headers["ITEM GROUP"]]),
                "cl_qty": clean_qty(quantity),
            }
        )
    busy_wb.close()
    return by_code


def process_job(job, busy_by_code):
    shutil.copy2(job["source"], job["output"])
    wb = openpyxl.load_workbook(job["output"])
    ws = wb["Products"] if "Products" in wb.sheetnames else wb[wb.sheetnames[0]]
    headers = header_map(ws)

    required = ["Title", "Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]
    missing = [name for name in required if name not in headers]
    if missing:
        raise RuntimeError(f"{job['source']} missing required columns: {missing}")

    title_col = headers["Title"]
    sku_col = headers["Variant SKU"]
    stock_col = headers["Variant Inventory Qty"]
    warehouse_col = headers["Warehouse Stock"]
    shop_col = headers["Shop Stock"]
    brand_col = headers.get("Brand")

    website_skus = [
        text(ws.cell(row=row_number, column=sku_col).value)
        for row_number in range(2, ws.max_row + 1)
        if text(ws.cell(row=row_number, column=sku_col).value)
    ]
    website_sku_counts = Counter(website_skus)

    audit_rows = []
    summary = Counter()
    for row_number in range(2, ws.max_row + 1):
        sku = text(ws.cell(row=row_number, column=sku_col).value)
        if not sku:
            continue

        old_qty = ws.cell(row=row_number, column=stock_col).value
        matches = busy_by_code.get(sku, [])

        if not matches:
            status = "No Busy Match"
            new_qty = old_qty
        elif len(matches) == 1:
            status = "Matched"
            new_qty = matches[0]["cl_qty"]
            ws.cell(row=row_number, column=stock_col).value = new_qty
        elif website_sku_counts[sku] == 1:
            status = "Matched - Busy Duplicates Summed"
            new_qty = clean_qty(sum(float(match["cl_qty"]) for match in matches))
            ws.cell(row=row_number, column=stock_col).value = new_qty
        else:
            status = "Needs Review - Duplicate Website SKU and Busy SKU"
            new_qty = old_qty

        summary[status] += 1
        audit_rows.append(
            {
                "brand_file": job["brand"],
                "website_row": row_number,
                "title": text(ws.cell(row=row_number, column=title_col).value),
                "brand": text(ws.cell(row=row_number, column=brand_col).value) if brand_col else "",
                "variant_sku": sku,
                "old_variant_inventory_qty": old_qty,
                "new_variant_inventory_qty": new_qty,
                "warehouse_stock": ws.cell(row=row_number, column=warehouse_col).value,
                "shop_stock": ws.cell(row=row_number, column=shop_col).value,
                "status": status,
                "busy_matches": matches,
            }
        )

    wb.save(job["output"])
    wb.close()
    shutil.copy2(job["output"], job["downloads_copy"])

    changed = sum(
        1
        for row in audit_rows
        if row["status"] in {"Matched", "Matched - Busy Duplicates Summed"}
        and row["old_variant_inventory_qty"] != row["new_variant_inventory_qty"]
    )
    return {
        "brand": job["brand"],
        "source_file": str(job["source"]),
        "output_file": str(job["output"]),
        "downloads_copy": str(job["downloads_copy"]),
        "summary": dict(summary),
        "changed_rows": changed,
        "rows": audit_rows,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    busy_by_code = load_busy_by_code()
    results = [process_job(job, busy_by_code) for job in JOBS]
    audit = {"busy_file": str(BUSY_FILE), "results": results}
    AUDIT_FILE.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "audit": str(AUDIT_FILE),
                "results": [
                    {
                        "brand": result["brand"],
                        "downloads_copy": result["downloads_copy"],
                        "summary": result["summary"],
                        "changed_rows": result["changed_rows"],
                    }
                    for result in results
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

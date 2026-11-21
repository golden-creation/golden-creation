from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import openpyxl


BUSY_PATH = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
FULL_WEBSITE_PATH = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (7).xlsx")

UPDATED_FILES = {
    "3M": Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Updated Sum Duplicates.xlsx"),
    "Adwell": Path(r"C:\Users\My-PC-Win10\Downloads\adwell products - Updated Website Stock.xlsx"),
    "Artzilla": Path(r"C:\Users\My-PC-Win10\Downloads\artzilla products - Updated Website Stock.xlsx"),
    "Belkin": Path(r"C:\Users\My-PC-Win10\Downloads\belkin products - Updated Website Stock.xlsx"),
    "Brustro": Path(r"C:\Users\My-PC-Win10\Downloads\brustro products - Updated Website Stock.xlsx"),
    "Camlin": Path(r"C:\Users\My-PC-Win10\Downloads\camlin products - Updated Website Stock.xlsx"),
    "Kaweco": Path(r"C:\Users\My-PC-Win10\Downloads\kaweco products - Updated Website Stock.xlsx"),
}


def text(value) -> str:
    return "" if value is None else str(value).strip()


def as_number(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value
    s = str(value).replace(",", "").strip()
    if not s:
        return None
    try:
        n = float(s)
    except ValueError:
        return value
    return int(n) if n.is_integer() else n


def header_indexes(ws):
    return {text(cell.value): idx for idx, cell in enumerate(ws[1], start=1)}


def read_website_file(path: Path, source_label: str, needed_skus=None):
    needed_skus = {str(sku) for sku in needed_skus or []}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    headers = header_indexes(ws)
    sku_col = headers.get("Variant SKU")
    title_col = headers.get("Title")
    stock_col = headers.get("Variant Inventory Qty")
    handle_col = headers.get("Handle")
    out = {}
    if sku_col:
        max_col = max(c for c in [sku_col, title_col, stock_col, handle_col] if c)
        for row_number, row in enumerate(ws.iter_rows(min_row=2, max_col=max_col, values_only=True), start=2):
            sku = text(row[sku_col - 1] if len(row) >= sku_col else "")
            if not sku:
                continue
            if needed_skus and sku not in needed_skus:
                continue
            out.setdefault(
                sku,
                {
                    "website_title": text(row[title_col - 1] if title_col and len(row) >= title_col else ""),
                    "website_stock": as_number(row[stock_col - 1] if stock_col and len(row) >= stock_col else None),
                    "website_handle": text(row[handle_col - 1] if handle_col and len(row) >= handle_col else ""),
                    "website_source": source_label,
                    "website_source_row": row_number,
                },
            )
            if needed_skus and len(out) >= len(needed_skus):
                break
    wb.close()
    return out


def read_busy_lookup(needed_codes=None):
    needed_codes = {str(code) for code in needed_codes or []}
    needed_headers = {"ITEM CODE", "Item Details", "ITEM GROUP", "Cl. Qty", "MRP", "Unit"}
    wb = openpyxl.load_workbook(BUSY_PATH, read_only=True, data_only=True)
    ws = wb.active
    headers = header_indexes(ws)
    missing = needed_headers - set(headers)
    if missing:
        raise RuntimeError(f"Busy source missing headers: {sorted(missing)}")
    lookup = defaultdict(list)
    seen = set()
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        code = text(row[headers["ITEM CODE"] - 1] if len(row) >= headers["ITEM CODE"] else "")
        if not code:
            continue
        if needed_codes and code not in needed_codes:
            continue
        seen.add(code)
        lookup[code].append(
            {
                "busy_row": row_number,
                "item_details": text(row[headers["Item Details"] - 1] if len(row) >= headers["Item Details"] else ""),
                "item_group": text(row[headers["ITEM GROUP"] - 1] if len(row) >= headers["ITEM GROUP"] else ""),
                "mrp": as_number(row[headers["MRP"] - 1] if len(row) >= headers["MRP"] else None),
                "unit": text(row[headers["Unit"] - 1] if len(row) >= headers["Unit"] else ""),
                "cl_qty": as_number(row[headers["Cl. Qty"] - 1] if len(row) >= headers["Cl. Qty"] else None),
            }
        )
    wb.close()
    return lookup


def e(brand, sku, qty, page, rows, method, note="", confidence="High"):
    return {
        "brand": brand,
        "sku": str(sku),
        "shop_qty": qty,
        "source_page": page,
        "source_rows": str(rows),
        "method": method,
        "scan_note": note,
        "confidence": confidence,
    }


entries = []

# Kaweco, page 1. Rows were checked at Cl. Qty.
for row, sku, qty in [
    (1, 30129, 0), (2, 30117, 1), (3, 30118, 1), (4, 30119, 1), (5, 30120, 1),
    (6, 30121, 1), (7, 30122, 1), (8, 30281, 5), (9, 30123, 1), (10, 30124, 1),
    (11, 30125, 1), (12, 30126, 1), (13, 30282, 0), (14, 30127, 1), (15, 30128, 1),
    (16, 30276, 1), (17, 30275, 1), (18, 30279, 0), (19, 30277, 1), (20, 30280, 1),
    (21, 30278, 4),
]:
    entries.append(e("Kaweco", sku, qty, 1, row, "Checked Cl.Qty"))

# Camlin, pages 2-6.
for row, sku, qty in [
    (3, 9919, 1), (4, 9920, 2), (8, 9921, 1), (10, 16449, 3), (11, 16499, 4),
    (12, 30028, 7), (13, 9925, 3), (16, 30170, 2), (17, 30171, 2), (18, 30172, 2),
    (19, 16496, 3), (20, 8587, 3), (21, 9932, 1), (22, 9926, 1),
]:
    entries.append(e("Camlin", sku, qty, 2, row, "Handwritten remark"))
for row, sku, qty in [
    (23, 9926, 3), (24, 30173, 10), (25, 10428, 2), (26, 30174, 10), (27, 10413, 2),
    (28, 9928, 2), (29, 9927, 1), (30, 9929, 3), (32, 10441, 5), (33, 16463, 10),
]:
    entries.append(e("Camlin", sku, qty, 3, row, "Handwritten remark"))
for row, sku, qty, note, confidence in [
    (48, 10417, 7, "", "High"), (49, 20254, 1, "", "High"), (51, 10420, 44, "Written as 40+4/44", "High"),
    (52, 16453, 6, "", "High"), (54, 16438, 2, "", "High"),
    (56, 30082, 340, "Written as 320+20=340", "High"), (57, 8593, 3, "", "High"),
    (58, 10429, 1, "", "High"), (59, 30378, 5, "", "High"), (60, 30379, 5, "", "High"),
    (62, 8599, 240, "Written as 10+30+200", "High"), (63, 10421, 4, "", "High"),
    (64, 10433, 13, "", "High"), (65, 10432, 6, "", "High"), (66, 10434, 7, "", "High"),
    (67, 10439, 5, "", "High"), (68, 10444, 3, "", "High"), (69, 16419, 1, "", "High"),
]:
    entries.append(e("Camlin", sku, qty, 4, row, "Handwritten remark/addition", note, confidence))
for row, sku, qty, note in [
    (71, 10437, 4, ""), (72, 10438, 1, ""), (76, 10440, 10, ""),
    (80, 17161, 4, "Written as 3+1=4"), (81, 16472, 1, ""), (82, 17193, 3, ""),
    (83, 10445, 2, ""), (84, 10446, 4, ""), (85, 30081, 20, "Written as 10+10"),
    (86, 16462, 10, ""), (87, 10447, 2, ""), (88, 10448, 1, ""), (90, 8604, 10, ""),
    (91, 8607, 5, ""), (92, 8605, 11, ""), (93, 8606, 16, ""), (94, 30179, 2, ""),
]:
    entries.append(e("Camlin", sku, qty, 5, row, "Handwritten remark/addition", note))
for row, sku, qty, note, confidence in [
    (95, 30180, 2, "", "High"), (96, 30181, 2, "", "High"), (97, 30182, 1, "Handwriting reads as 1", "Medium"),
    (98, 16432, 3, "", "High"), (99, 16434, 5, "", "High"), (100, 10449, 4, "", "High"),
    (101, 10450, 5, "", "High"), (103, 10452, 400, "Red handwritten count near item name", "High"),
    (105, 30083, 13, "", "High"),
]:
    entries.append(e("Camlin", sku, qty, 6, row, "Handwritten remark/near-name count", note, confidence))

# Brustro, page 7.
for row, sku, qty, note in [
    (1, 9628, 2, ""), (2, 9656, 1, ""), (3, 30069, 2, ""), (4, 30070, 1, ""),
    (5, 9653, 1, ""), (6, 9638, 1, ""), (7, 9629, 1, ""), (8, 9645, 1, ""),
    (9, 9631, 1, ""), (10, 9630, 1, ""), (11, 9644, 2, ""), (12, 9642, 2, ""),
    (13, 9666, 2, "Written as 1+1=2"),
]:
    entries.append(e("Brustro", sku, qty, 7, row, "Handwritten remark", note))

# Belkin, page 8.
for row, sku, qty, method, note, confidence in [
    (1, 13147, 1, "Handwritten remark", "", "High"),
    (2, 13151, 1, "Side check/checked Cl.Qty", "No number in Remarks, visible side mark and Cl.Qty is 1", "Medium"),
    (4, 13158, 2, "Handwritten remark", "", "High"), (5, 13162, 2, "Handwritten remark", "", "High"),
    (6, 13169, 1, "Handwritten remark", "", "High"), (7, 13165, 1, "Handwritten remark", "", "High"),
    (8, 19056, 1, "Handwritten remark", "", "High"),
]:
    entries.append(e("Belkin", sku, qty, 8, row, method, note, confidence))

# Beetel Panasonic, page 9. No prior updated brand workbook was found.
for row, sku, qty, note, confidence in [
    (1, 8561, 2, "Written as 1+1=2", "High"), (2, 10164, 1, "Overwritten handwriting reads as 1", "Low"),
    (3, 10165, 1, "", "High"), (4, 8563, 1, "", "High"), (5, 8564, 1, "", "High"),
    (6, 10167, 0, "Checked Cl.Qty zero", "High"), (7, 8562, 1, "", "High"),
    (8, 8568, 1, "", "High"), (9, 13088, 3, "", "High"), (10, 8569, 2, "", "High"),
    (11, 10168, 2, "", "High"), (12, 10169, 0, "Checked Cl.Qty zero", "High"),
    (13, 10170, 0, "Checked Cl.Qty zero", "High"), (14, 19058, 2, "", "High"),
    (15, 13081, 1, "", "High"), (16, 13083, 1, "Handwritten count despite Cl.Qty zero", "High"),
    (17, 10172, 2, "", "High"), (18, 13098, 2, "", "High"),
]:
    entries.append(e("Beetel Panasonic", sku, qty, 9, row, "Handwritten remark/checked Cl.Qty", note, confidence))

# 3M, pages 10-11. Duplicate price rows for SKU 8536 were summed.
for row, sku, qty, note, confidence in [
    (1, 10120, 6, "Written as 2+4 and /6", "High"), (2, 10121, 6, "Written as 2+4 and /6", "High"),
    (3, 10122, 4, "Written as 2+2 and /4", "High"), (4, 10123, 1, "", "High"),
    (5, 10124, 4, "Written as 2+2 and /4", "High"), (6, 10125, 3, "Written as 2+1 and /3", "High"),
    (7, 10126, 4, "Written as 2+2 and /4", "High"), (8, 8527, 6, "", "High"),
    (10, 10131, 2, "Handwritten count beside 160 MRP note", "High"),
    (12, 8530, 4, "65 MRP /4", "High"), (13, 8526, 8, "70 MRP /8 written near preceding row", "Medium"),
    (14, 8535, 20, "Written /20", "High"), (15, 8536, 21, "Duplicate SKU rows summed: 65 MRP 2 pcs + 75 MRP 19 pcs", "High"),
    (18, 8533, 1, "", "High"), (19, 8532, 19, "", "High"), (20, 19110, 40, "", "High"),
    (21, 8525, 11, "", "High"), (22, 9427, 11, "", "High"),
]:
    entries.append(e("3M", sku, qty, 10, row, "Handwritten near-name count/addition", note, confidence))
for row, sku, qty in [(23, 10130, 2), (24, 8529, 11)]:
    entries.append(e("3M", sku, qty, 11, row, "Handwritten near-name count"))

# Adwell, pages 12-13.
for row, sku, qty, note, confidence in [
    (3, 20134, 5, "", "High"), (4, 9913, 3, "", "High"), (5, 20135, 3, "", "High"),
    (6, 9915, 2, "", "High"), (7, 9916, 2, "", "High"), (8, 9917, 9, "Handwritten near item name", "High"),
    (15, 10216, 10, "Red 9 plus blue 1; summed, no explicit total shown", "Medium"),
    (16, 10228, 15, "Red handwritten count near item name", "High"),
    (20, 9912, 44, "Red 37 plus blue 7; summed, no explicit total shown", "Medium"),
]:
    entries.append(e("Adwell", sku, qty, 12, row, "Handwritten remark/near-name count", note, confidence))
for row, sku, qty, note, confidence in [
    (25, 10232, 21, "Written as 4+9+8=21", "High"), (26, 10229, 2, "", "High"),
    (27, 10230, 39, "Circled total 39", "High"), (28, 20142, 11, "Handwritten count near item name", "High"),
    (29, 10223, 24, "Written as 15/BL + 9 PN = 24", "High"),
]:
    entries.append(e("Adwell", sku, qty, 13, row, "Handwritten near-name count/addition", note, confidence))

# Artzilla, page 14.
for row, sku, qty, note in [
    (1, 18181, 10, "Pista green /10"), (2, 18183, 10, "Green /10"),
    (3, 17873, 10, "Peach /10"), (4, 18179, 10, "Pink /10"),
    (5, 18175, 10, "Yellow /10"), (6, 18197, 14, "Color split count totals to 14"),
    (7, 18161, 30, "Five color counts of 6 each; total 30"),
]:
    entries.append(e("Artzilla", sku, qty, 14, row, "Handwritten near-name count/checked Cl.Qty", note))

needs_review = [
    {"brand": "Camlin", "sku": "10423", "source_page": 4, "source_rows": "53", "reason": "Handwritten remark is overwritten/unclear; not extracted."},
    {"brand": "3M", "sku": "10127", "source_page": 10, "source_rows": "9", "reason": "Marked with x/tick but no numeric count; not extracted."},
    {"brand": "3M", "sku": "19107", "source_page": 10, "source_rows": "11", "reason": "Marked with x/tick but no numeric count; not extracted."},
    {"brand": "3M", "sku": "8534", "source_page": 10, "source_rows": "17", "reason": "Marked with x/tick but no numeric count; not extracted."},
]

skipped = [
    {"brand": "Camlin", "sku": "8588", "source_page": 3, "source_rows": "36", "reason": "SKIP written near product name."},
    {"brand": "Camlin", "sku": "9938", "source_page": 3, "source_rows": "37", "reason": "SKIP written near product name."},
    {"brand": "Camlin", "sku": "8591", "source_page": 3, "source_rows": "43", "reason": "SKIP written near product name."},
    {"brand": "Camlin", "sku": "8590", "source_page": 3, "source_rows": "46", "reason": "SKIP written near product name."},
    {"brand": "3M", "sku": "", "source_page": 11, "source_rows": "below table", "reason": "Handwritten-only 3M Magic Tape line ignored."},
    {"brand": "Adwell", "sku": "", "source_page": 12, "source_rows": "below table", "reason": "Handwritten-only Adwell product lines ignored."},
    {"brand": "Artzilla", "sku": "", "source_page": 14, "source_rows": "below table", "reason": "Handwritten-only product lines ignored."},
]


def grouped_entries(raw_entries):
    grouped = {}
    for item in raw_entries:
        key = (item["brand"], item["sku"])
        if key not in grouped:
            grouped[key] = {**item, "shop_qty": 0, "source_page": set(), "source_rows": [], "scan_note": [], "method": set(), "confidence": "High"}
        g = grouped[key]
        g["shop_qty"] += item["shop_qty"]
        g["source_page"].add(str(item["source_page"]))
        g["source_rows"].append(f"p{item['source_page']} r{item['source_rows']}")
        if item.get("scan_note"):
            g["scan_note"].append(item["scan_note"])
        g["method"].add(item["method"])
        if item["confidence"] == "Low" or g["confidence"] == "Low":
            g["confidence"] = "Low"
        elif item["confidence"] == "Medium" or g["confidence"] == "Medium":
            g["confidence"] = "Medium"
    rows = []
    for (_, _), g in grouped.items():
        g["source_page"] = ", ".join(sorted(g["source_page"], key=int))
        g["source_rows"] = "; ".join(g["source_rows"])
        g["scan_note"] = "; ".join(g["scan_note"])
        g["method"] = "; ".join(sorted(g["method"]))
        rows.append(g)
    return rows


def main():
    out_path = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\shop_stock_reconciliation_data.json")
    needed_codes = {item["sku"] for item in entries} | {item["sku"] for item in needs_review if item.get("sku")}
    busy = read_busy_lookup(needed_codes)
    full_web = read_website_file(FULL_WEBSITE_PATH, "Full website export", needed_codes)
    brand_web = {
        brand: read_website_file(path, f"{brand} updated website-stock workbook", needed_codes)
        for brand, path in UPDATED_FILES.items()
    }

    rows = []
    for item in grouped_entries(entries):
        brand = item["brand"]
        sku = item["sku"]
        source_brand = "Beetel" if brand == "Beetel Panasonic" else brand
        web = brand_web.get(source_brand, {}).get(sku) or full_web.get(sku) or {}
        busy_rows = busy.get(sku, [])
        busy_total = sum((r["cl_qty"] or 0) for r in busy_rows)
        website_stock = web.get("website_stock")
        website_source = web.get("website_source", "")
        if website_stock is None and brand == "Beetel Panasonic":
            website_stock = busy_total
            website_source = "Busy Cl.Qty aggregate; no updated Beetel workbook found"
        match_status = "Matched"
        if not web:
            match_status = "Website SKU not found"
        rows.append(
            {
                "Brand": brand,
                "SKU": sku,
                "Website Product Name": web.get("website_title", ""),
                "Website Stock": website_stock,
                "Shop Stock": item["shop_qty"],
                "Website Minus Shop": None if website_stock is None else website_stock - item["shop_qty"],
                "Match Status": match_status,
                "Confidence": item["confidence"],
                "Website Stock Source": website_source,
                "Source Page": item["source_page"],
                "Source Row(s)": item["source_rows"],
                "Extraction Method": item["method"],
                "Scan Notes": item["scan_note"],
                "Busy Item Details": " | ".join(
                    f"{r['item_details']} (MRP {r['mrp']}, Cl.Qty {r['cl_qty']})" for r in busy_rows
                ),
            }
        )

    for review in needs_review:
        sku = review["sku"]
        web = full_web.get(sku, {})
        busy_rows = busy.get(sku, [])
        review["website_product_name"] = web.get("website_title", "")
        review["busy_item_details"] = " | ".join(
            f"{r['item_details']} (MRP {r['mrp']}, Cl.Qty {r['cl_qty']})" for r in busy_rows
        )

    summary = []
    for brand in sorted({r["Brand"] for r in rows}):
        brand_rows = [r for r in rows if r["Brand"] == brand]
        summary.append(
            {
                "Brand": brand,
                "Extracted SKU Rows": len(brand_rows),
                "Total Shop Stock": sum(r["Shop Stock"] for r in brand_rows),
                "Medium/Low Confidence Rows": sum(r["Confidence"] != "High" for r in brand_rows),
                "Website SKU Not Found": sum(r["Match Status"] != "Matched" for r in brand_rows),
            }
        )

    payload = {
        "source_pdf": r"C:\Users\My-PC-Win10\Desktop\Golden Creation\Stock Reconcilation Works\Store Stocks Latest Countings\New Shop stock sheets scanned 04 September 2026.pdf",
        "created_for": "Shop stock counts from scanned sheets dated 04 September 2026",
        "rows": rows,
        "needs_review": needs_review,
        "skipped": skipped,
        "summary": summary,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(out_path)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

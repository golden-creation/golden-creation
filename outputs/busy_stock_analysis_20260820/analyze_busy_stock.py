import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
SHOPIFY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (7).xlsx")
OUTPUT_FILE = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\busy_stock_analysis_20260820\busy_stock_analysis.json")


def text(value):
    return "" if value is None else str(value).strip()


def norm_header(value):
    return re.sub(r"\s+", " ", text(value).replace("\n", " ")).strip().lower()


def leading_code(value):
    match = re.match(r"^(\d+)", text(value))
    return match.group(1) if match else ""


def find_header_row(sheet):
    best = None
    expected = {"item code", "item group", "cl. qty", "cl qty"}
    for row_idx in range(1, min(sheet.max_row, 30) + 1):
        values = [norm_header(cell.value) for cell in sheet[row_idx]]
        hits = sum(1 for value in values if value in expected)
        joined = " | ".join(values)
        if "item code" in joined and ("cl. qty" in joined or "cl qty" in joined):
            return row_idx
        if not best or hits > best[0]:
            best = (hits, row_idx)
    return best[1] if best else 1


def locate_columns(headers):
    normalized = [norm_header(header) for header in headers]

    def find_one(candidates):
        for candidate in candidates:
            for idx, header in enumerate(normalized):
                if header == candidate:
                    return idx
        for candidate in candidates:
            for idx, header in enumerate(normalized):
                if candidate in header:
                    return idx
        return None

    return {
        "item_code": find_one(["item code", "itemcode", "item no", "item no."]),
        "item_group": find_one(["item group", "itemgroup", "group"]),
        "item_name": find_one(["item details", "item detail", "item name", "name"]),
        "cl_qty": find_one(["cl. qty", "cl qty", "closing qty", "closing quantity"]),
    }


def load_shopify_codes():
    if not SHOPIFY_FILE.exists():
        return {}
    workbook = openpyxl.load_workbook(SHOPIFY_FILE, read_only=True, data_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    headers = [cell.value for cell in next(sheet.iter_rows(max_row=1))]
    idx = {header: pos for pos, header in enumerate(headers)}
    rows_by_leading_code = defaultdict(list)
    rows_by_exact_identifier = defaultdict(list)
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        handle = text(row[idx.get("Handle")])
        variant_sku = text(row[idx.get("Variant SKU")])
        code = leading_code(variant_sku) or leading_code(handle)
        record = {
            "row": row_number,
            "handle": handle,
            "variant_sku": variant_sku,
            "title": text(row[idx.get("Title")]),
            "brand": text(row[idx.get("Brand")]),
            "category": text(row[idx.get("Product Category")]),
            "inventory": row[idx.get("Variant Inventory Qty")] if "Variant Inventory Qty" in idx else None,
        }
        if code:
            rows_by_leading_code[code].append(record)
        for identifier in {handle, variant_sku}:
            if identifier:
                rows_by_exact_identifier[identifier].append(record)
    return rows_by_leading_code, rows_by_exact_identifier


def analyze_busy():
    workbook = openpyxl.load_workbook(BUSY_FILE, read_only=True, data_only=True)
    shopify_by_code, shopify_by_exact_identifier = load_shopify_codes()
    sheets = []
    primary = None

    for sheet in workbook.worksheets:
        header_row = find_header_row(sheet)
        headers = [cell.value for cell in sheet[header_row]]
        cols = locate_columns(headers)
        data_rows = []
        if all(cols[key] is not None for key in ("item_code", "item_group", "cl_qty")):
            for row_number, row in enumerate(sheet.iter_rows(min_row=header_row + 1, values_only=True), header_row + 1):
                item_code = text(row[cols["item_code"]])
                item_group = text(row[cols["item_group"]])
                item_name = text(row[cols["item_name"]]) if cols["item_name"] is not None else ""
                cl_qty = row[cols["cl_qty"]]
                if not item_code and not item_group and not item_name and cl_qty in (None, ""):
                    continue
                data_rows.append(
                    {
                        "row": row_number,
                        "item_code": item_code,
                        "leading_code": leading_code(item_code),
                        "item_group": item_group,
                        "item_name": item_name,
                        "cl_qty": cl_qty,
                    }
                )
        sheet_info = {
            "name": sheet.title,
            "max_row": sheet.max_row,
            "max_column": sheet.max_column,
            "header_row": header_row,
            "headers": [text(header) for header in headers],
            "columns": cols,
            "data_row_count": len(data_rows),
        }
        sheets.append(sheet_info)
        if data_rows and (primary is None or len(data_rows) > len(primary["rows"])):
            primary = {"sheet": sheet.title, "header_row": header_row, "headers": headers, "columns": cols, "rows": data_rows}

    if primary is None:
        raise RuntimeError("No usable Busy stock sheet found")

    rows = primary["rows"]
    code_counts = Counter(row["item_code"] for row in rows if row["item_code"])
    leading_counts = Counter(row["leading_code"] for row in rows if row["leading_code"])
    group_counts = Counter(row["item_group"] for row in rows if row["item_group"])
    qty_numeric = []
    qty_non_numeric = []
    for row in rows:
        qty = row["cl_qty"]
        if isinstance(qty, (int, float)):
            qty_numeric.append(float(qty))
        elif text(qty):
            qty_non_numeric.append({"row": row["row"], "item_code": row["item_code"], "cl_qty": text(qty)})

    busy_codes = set(row["leading_code"] for row in rows if row["leading_code"])
    shopify_codes = set(shopify_by_code.keys())
    matched_codes = busy_codes & shopify_codes
    unmatched_busy = sorted(busy_codes - shopify_codes, key=lambda value: int(value))
    unmatched_shopify = sorted(shopify_codes - busy_codes, key=lambda value: int(value))
    exact_match_rows = []
    leading_unique_rows = []
    leading_ambiguous_rows = []
    no_match_rows = []
    for row in rows:
        item_code = row["item_code"]
        lead = row["leading_code"]
        if item_code and item_code in shopify_by_exact_identifier:
            exact_match_rows.append(row)
        elif lead and lead in shopify_by_code:
            unique_skus = {record["variant_sku"] or record["handle"] for record in shopify_by_code[lead]}
            if len(unique_skus) == 1:
                leading_unique_rows.append(row)
            else:
                leading_ambiguous_rows.append(
                    {
                        **row,
                        "candidate_sku_count": len(unique_skus),
                        "candidate_skus": sorted(unique_skus)[:20],
                    }
                )
        else:
            no_match_rows.append(row)

    duplicate_item_codes = [
        {"item_code": code, "count": count}
        for code, count in code_counts.most_common()
        if count > 1
    ][:100]
    duplicate_leading_codes = [
        {"leading_code": code, "count": count}
        for code, count in leading_counts.most_common()
        if count > 1
    ][:100]
    blank_item_code_rows = [row for row in rows if not row["item_code"]]
    negative_qty_rows = [
        row for row in rows if isinstance(row["cl_qty"], (int, float)) and row["cl_qty"] < 0
    ]
    extreme_positive_qty_rows = sorted(
        [
            row
            for row in rows
            if isinstance(row["cl_qty"], (int, float)) and row["cl_qty"] > 10000
        ],
        key=lambda row: row["cl_qty"],
        reverse=True,
    )

    sample_rows = rows[:10]
    sample_unmatched_busy = []
    by_leading = defaultdict(list)
    for row in rows:
        by_leading[row["leading_code"]].append(row)
    for code in unmatched_busy[:50]:
        sample_unmatched_busy.append(by_leading[code][0])

    payload = {
        "busy_file": str(BUSY_FILE),
        "shopify_file": str(SHOPIFY_FILE),
        "sheets": sheets,
        "primary_sheet": primary["sheet"],
        "primary_header_row": primary["header_row"],
        "primary_headers": [text(header) for header in primary["headers"]],
        "columns": primary["columns"],
        "row_count": len(rows),
        "nonblank_item_code_rows": sum(1 for row in rows if row["item_code"]),
        "unique_item_codes": len(code_counts),
        "unique_leading_codes": len(leading_counts),
        "item_group_count": len(group_counts),
        "top_item_groups": group_counts.most_common(50),
        "cl_qty_numeric_rows": len(qty_numeric),
        "cl_qty_non_numeric_rows": len(qty_non_numeric),
        "cl_qty_blank_rows": sum(1 for row in rows if row["cl_qty"] in (None, "")),
        "cl_qty_total": sum(qty_numeric),
        "cl_qty_positive_rows": sum(1 for qty in qty_numeric if qty > 0),
        "cl_qty_zero_rows": sum(1 for qty in qty_numeric if qty == 0),
        "cl_qty_negative_rows": sum(1 for qty in qty_numeric if qty < 0),
        "cl_qty_min": min(qty_numeric) if qty_numeric else None,
        "cl_qty_max": max(qty_numeric) if qty_numeric else None,
        "duplicate_item_codes": duplicate_item_codes,
        "duplicate_leading_codes": duplicate_leading_codes,
        "blank_item_code_rows": blank_item_code_rows,
        "negative_qty_sample_rows": negative_qty_rows[:100],
        "extreme_positive_qty_rows": extreme_positive_qty_rows[:50],
        "shopify_code_count": len(shopify_codes),
        "matched_code_count": len(matched_codes),
        "busy_codes_not_in_shopify_count": len(unmatched_busy),
        "shopify_codes_not_in_busy_count": len(unmatched_shopify),
        "busy_rows_exact_shopify_identifier_match": len(exact_match_rows),
        "busy_rows_leading_code_unique_match": len(leading_unique_rows),
        "busy_rows_leading_code_ambiguous_match": len(leading_ambiguous_rows),
        "busy_rows_no_shopify_match": len(no_match_rows),
        "sample_leading_code_ambiguous": leading_ambiguous_rows[:50],
        "sample_no_match_rows": no_match_rows[:50],
        "sample_rows": sample_rows,
        "sample_unmatched_busy": sample_unmatched_busy,
        "sample_unmatched_shopify": [
            shopify_by_code[code][0] for code in unmatched_shopify[:50]
        ],
    }
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = analyze_busy()
    print(f"Busy file: {result['busy_file']}")
    print(f"Primary sheet: {result['primary_sheet']} header row {result['primary_header_row']}")
    print(f"Rows: {result['row_count']}; unique item codes: {result['unique_item_codes']}")
    print(f"Cl Qty numeric rows: {result['cl_qty_numeric_rows']}; total: {result['cl_qty_total']}")
    print(
        "Shopify match: "
        f"{result['matched_code_count']} matched codes, "
        f"{result['busy_codes_not_in_shopify_count']} Busy-only, "
        f"{result['shopify_codes_not_in_busy_count']} Shopify-only"
    )
    print("Top groups:")
    for group, count in result["top_item_groups"][:15]:
        print(f"  {group}: {count}")
    print(f"Wrote {OUTPUT_FILE}")

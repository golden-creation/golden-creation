import json
import re
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
TARGET_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock.xlsx")
OUTPUT_JSON = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_3m_20260820\3m_stock_update_plan_corrected.json"
)


def text(value):
    return "" if value is None else str(value).strip()


def norm(value):
    return re.sub(r"[^A-Z0-9]+", " ", text(value).upper()).strip()


def similarity(left, right):
    return SequenceMatcher(None, norm(left), norm(right)).ratio()


def load_busy_by_code():
    workbook = openpyxl.load_workbook(BUSY_FILE, read_only=True, data_only=True)
    sheet = workbook["Sheet1"]
    headers = [cell.value for cell in next(sheet.iter_rows(max_row=1))]
    idx = {header: pos for pos, header in enumerate(headers)}
    by_code = defaultdict(list)
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        code = text(row[idx["ITEM CODE"]])
        if not code:
            continue
        by_code[code].append(
            {
                "busy_row": row_number,
                "item_code": code,
                "item_group": text(row[idx["ITEM GROUP"]]),
                "item_details": text(row[idx["Item Details"]]),
                "cl_qty": row[idx["Cl. Qty"]],
            }
        )
    return by_code


def choose_busy_candidate(candidates, target_brand, target_title):
    if len(candidates) == 1:
        return candidates[0], "single exact ITEM CODE match"

    brand_norm = norm(target_brand)
    brand_matches = [candidate for candidate in candidates if norm(candidate["item_group"]) == brand_norm]
    if len(brand_matches) == 1:
        return brand_matches[0], "duplicate ITEM CODE resolved by ITEM GROUP/Brand"

    pool = brand_matches or candidates
    ranked = sorted(
        pool,
        key=lambda candidate: similarity(candidate["item_details"], target_title),
        reverse=True,
    )
    if len(ranked) == 1 or similarity(ranked[0]["item_details"], target_title) > similarity(ranked[1]["item_details"], target_title):
        return ranked[0], "duplicate ITEM CODE resolved by title/details similarity"

    return None, "ambiguous duplicate ITEM CODE; no safe automatic update"


def main():
    busy_by_code = load_busy_by_code()
    workbook = openpyxl.load_workbook(TARGET_FILE, read_only=True, data_only=True)
    sheet = workbook["Products"]
    headers = [cell.value for cell in next(sheet.iter_rows(max_row=1))]
    idx = {header: pos for pos, header in enumerate(headers)}

    rows = []
    changed = []
    unchanged = []
    missing = []
    ambiguous = []
    duplicate_resolved = []

    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        sku = text(row[idx["Variant SKU"]])
        title = text(row[idx["Title"]])
        brand = text(row[idx["Brand"]])
        old_qty = row[idx["Variant Inventory Qty"]]
        candidates = busy_by_code.get(sku, [])
        chosen, match_reason = (None, "No exact ITEM CODE match found in Busy file")
        status = "No Busy Match"
        if candidates:
            chosen, match_reason = choose_busy_candidate(candidates, brand, title)
            status = "Matched" if chosen else "Ambiguous Duplicate Busy Code"

        new_qty = chosen["cl_qty"] if chosen else None
        if status == "No Busy Match":
            missing.append({"excel_row": row_number, "sku": sku, "title": title})
        elif status == "Ambiguous Duplicate Busy Code":
            ambiguous.append(
                {
                    "excel_row": row_number,
                    "sku": sku,
                    "title": title,
                    "brand": brand,
                    "candidates": candidates,
                }
            )
        else:
            if len(candidates) > 1:
                duplicate_resolved.append(
                    {
                        "excel_row": row_number,
                        "sku": sku,
                        "title": title,
                        "chosen": chosen,
                        "candidates": candidates,
                        "reason": match_reason,
                    }
                )
            if old_qty == new_qty:
                unchanged.append({"excel_row": row_number, "sku": sku, "title": title, "qty": old_qty})
            else:
                changed.append({"excel_row": row_number, "sku": sku, "title": title, "old_qty": old_qty, "new_qty": new_qty})

        rows.append(
            {
                "excel_row": row_number,
                "sku": sku,
                "handle": text(row[idx["Handle"]]),
                "title": title,
                "brand": brand,
                "old_variant_inventory_qty": old_qty,
                "new_variant_inventory_qty": new_qty,
                "chosen_busy_row": chosen["busy_row"] if chosen else "",
                "chosen_busy_item_group": chosen["item_group"] if chosen else "",
                "chosen_busy_item_details": chosen["item_details"] if chosen else "",
                "candidate_count": len(candidates),
                "status": status,
                "match_reason": match_reason,
                "candidate_busy_rows": candidates,
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
        "matched_rows": sum(1 for row in rows if row["status"] == "Matched"),
        "missing_rows": len(missing),
        "ambiguous_rows": len(ambiguous),
        "changed_rows": len(changed),
        "unchanged_rows": len(unchanged),
        "duplicate_resolved_rows": len(duplicate_resolved),
        "negative_new_qty_rows": sum(
            1
            for row in rows
            if isinstance(row["new_variant_inventory_qty"], (int, float)) and row["new_variant_inventory_qty"] < 0
        ),
        "rows": rows,
        "changed": changed,
        "missing": missing,
        "ambiguous": ambiguous,
        "duplicate_resolved": duplicate_resolved,
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")
    print(
        f"Rows {payload['target_rows']}; matched {payload['matched_rows']}; "
        f"missing {payload['missing_rows']}; ambiguous {payload['ambiguous_rows']}; "
        f"changed {payload['changed_rows']}; duplicate resolved {payload['duplicate_resolved_rows']}"
    )
    print("Changed rows:")
    for item in changed:
        print(f"{item['excel_row']} {item['sku']}: {item['old_qty']} -> {item['new_qty']} | {item['title']}")
    print("Duplicate resolutions:")
    for item in duplicate_resolved:
        chosen = item["chosen"]
        all_candidates = "; ".join(
            f"row {candidate['busy_row']} group={candidate['item_group']} qty={candidate['cl_qty']} details={candidate['item_details']}"
            for candidate in item["candidates"]
        )
        print(
            f"{item['excel_row']} {item['sku']} chose row {chosen['busy_row']} qty {chosen['cl_qty']} "
            f"because {item['reason']} | candidates: {all_candidates}"
        )


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import openpyxl


BUSY = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")


def text(value) -> str:
    return "" if value is None else str(value).strip()


def qty(value):
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return None
    value = str(value).strip().replace(",", "")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def header_map(row) -> dict[str, int]:
    return {text(value): index for index, value in enumerate(row)}


def website_rows(path: Path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    ws = wb.active
    headers = header_map(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
    sku_i = headers["Variant SKU"]
    stock_i = headers["Variant Inventory Qty"]
    title_i = headers.get("Title")
    variant_i = headers.get("Variant Option1 Value")
    rows = []
    needed = set()
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        sku = text(row[sku_i] if sku_i < len(row) else "")
        if not sku:
            continue
        base = sku.split("-")[0]
        rows.append(
            {
                "row": row_number,
                "sku": sku,
                "base": base,
                "title": text(row[title_i]) if title_i is not None and title_i < len(row) else "",
                "variant": text(row[variant_i]) if variant_i is not None and variant_i < len(row) else "",
                "old_qty": clean(qty(row[stock_i] if stock_i < len(row) else None)),
            }
        )
        needed.add(sku)
        needed.add(base)
    meta = {
        "website_sheet": ws.title,
        "website_rows": ws.max_row,
        "website_cols": ws.max_column,
        "web_sku_rows": len(rows),
        "variant_sku_col": sku_i + 1,
        "variant_inventory_qty_col": stock_i + 1,
    }
    wb.close()
    return rows, needed, meta


def busy_rows(needed: set[str]):
    wb = openpyxl.load_workbook(BUSY, read_only=True, data_only=True)
    busy_ws = None
    busy_headers = None
    for ws in wb.worksheets:
        headers = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        names = {text(value) for value in headers}
        if "ITEM CODE" in names and "Cl. Qty" in names:
            busy_ws = ws
            busy_headers = headers
            break
    if busy_ws is None or busy_headers is None:
        raise RuntimeError("Busy required headers not found")
    indexes = header_map(busy_headers)
    code_i = indexes["ITEM CODE"]
    group_i = indexes.get("ITEM GROUP")
    name_i = indexes.get("ITEM NAME", indexes.get("ITEM DESCRIPTION"))
    cl_i = indexes["Cl. Qty"]
    mrp_i = indexes.get("MRP")
    busy = defaultdict(list)
    for row_number, row in enumerate(busy_ws.iter_rows(min_row=2, values_only=True), start=2):
        code = text(row[code_i] if code_i < len(row) else "")
        if code not in needed:
            continue
        busy[code].append(
            {
                "busy_row": row_number,
                "item_group": text(row[group_i]) if group_i is not None and group_i < len(row) else "",
                "item_name": text(row[name_i]) if name_i is not None and name_i < len(row) else "",
                "mrp": clean(qty(row[mrp_i] if mrp_i is not None and mrp_i < len(row) else None))
                if mrp_i is not None
                else None,
                "cl_qty": clean(qty(row[cl_i] if cl_i < len(row) else None)),
            }
        )
    sheet_name = busy_ws.title
    wb.close()
    return busy, sheet_name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--changes-limit", type=int, default=25)
    args = parser.parse_args()
    source = Path(args.source)
    web, needed, meta = website_rows(source)
    busy, busy_sheet = busy_rows(needed)

    missing = []
    direct = []
    dup = []
    changed = []
    negative = []
    base_hits = defaultdict(lambda: {"website_rows": [], "busy_rows": []})
    for row in web:
        matches = busy.get(row["sku"], [])
        if not matches:
            missing.append(row)
            if row["base"] != row["sku"] and row["base"] in busy:
                base_hits[row["base"]]["website_rows"].append(row)
                base_hits[row["base"]]["busy_rows"] = busy[row["base"]]
            continue
        total = sum((match["cl_qty"] or 0) for match in matches)
        rec = {**row, "busy_count": len(matches), "busy_total": clean(total), "busy_rows": matches}
        if len(matches) == 1:
            direct.append(rec)
        else:
            dup.append(rec)
        if row["old_qty"] != clean(total):
            changed.append(
                {
                    "row": row["row"],
                    "sku": row["sku"],
                    "old_qty": row["old_qty"],
                    "busy_total": clean(total),
                    "title": row["title"],
                    "variant": row["variant"],
                }
            )
        if total < 0:
            negative.append(rec)

    print(
        json.dumps(
            {
                "website_file": str(source),
                "busy_file": str(BUSY),
                "website_sheet": meta["website_sheet"],
                "busy_sheet": busy_sheet,
                "dimensions": {
                    "website_rows": meta["website_rows"],
                    "website_cols": meta["website_cols"],
                    "web_sku_rows": meta["web_sku_rows"],
                },
                "header_positions_1_based": {
                    "Variant SKU": meta["variant_sku_col"],
                    "Variant Inventory Qty": meta["variant_inventory_qty_col"],
                },
                "brand_groups_seen": sorted(
                    {
                        match["item_group"]
                        for row in web
                        for match in busy.get(row["sku"], [])
                        if match["item_group"]
                    }
                ),
                "counts": {
                    "matched_direct": len(direct),
                    "matched_duplicate_codes": len(dup),
                    "missing_exact": len(missing),
                    "base_code_hits": len(base_hits),
                    "would_change": len(changed),
                    "negative_totals": len(negative),
                },
                "missing_exact": missing,
                "base_code_hits": base_hits,
                "duplicate_code_matches": dup,
                "negative_totals": negative,
                "first_changes": changed[: args.changes_limit],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

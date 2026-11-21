import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


SOURCE_XLSX = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (7).xlsx")
OUTPUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\item_code_grouping_20260817")
OUTPUT_JSON = OUTPUT_DIR / "item_code_groups.json"


def text(value):
    return "" if value is None else str(value).strip()


def item_code_range(code):
    if code is None:
        return "No Numeric Item Code"
    if code < 10000:
        return "00000-09999"
    if code < 20000:
        return "10000-19999"
    start = (code // 1000) * 1000
    return f"{start:05d}-{start + 999:05d}"


def leading_item_code(value):
    match = re.match(r"^(\d+)", value or "")
    return int(match.group(1)) if match else None


def load_products():
    workbook = openpyxl.load_workbook(SOURCE_XLSX, read_only=True, data_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    headers = [cell.value for cell in next(sheet.iter_rows(max_row=1))]
    idx = {name: pos for pos, name in enumerate(headers)}

    rows = []
    for source_row, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
        handle = text(row[idx["Handle"]])
        item_code = leading_item_code(handle)
        variant_sku = text(row[idx["Variant SKU"]])
        title = text(row[idx["Title"]])
        brand = text(row[idx["Brand"]])
        category = text(row[idx["Product Category"]])
        product_type = text(row[idx["Type"]])
        tags = text(row[idx["Tags"]])
        option_values = " / ".join(
            value
            for value in (
                text(row[idx.get("Option1 Value")]) if "Option1 Value" in idx else "",
                text(row[idx.get("Option2 Value")]) if "Option2 Value" in idx else "",
                text(row[idx.get("Option3 Value")]) if "Option3 Value" in idx else "",
            )
            if value
        )
        price = row[idx["Variant Price"]] if "Variant Price" in idx else None
        inventory = row[idx["Variant Inventory Qty"]] if "Variant Inventory Qty" in idx else None
        status = text(row[idx["Status"]]) if "Status" in idx else ""

        rows.append(
            {
                "Item Code Range": item_code_range(item_code),
                "Item Code": item_code if item_code is not None else "",
                "Raw Item Code / Handle": handle,
                "Handle": handle,
                "Variant SKU": variant_sku,
                "Title": title,
                "Brand": brand,
                "Product Category": category,
                "Type": product_type,
                "Option Values": option_values,
                "Variant Price": price if price is not None else "",
                "Variant Inventory Qty": inventory if inventory is not None else "",
                "Status": status,
                "Tags": tags,
                "Source Row": source_row,
            }
        )
    return rows


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = load_products()
    rows.sort(key=lambda r: (str(r["Item Code Range"]), int(r["Item Code"]) if isinstance(r["Item Code"], int) else 10**9, r["Title"]))

    range_counts = Counter(row["Item Code Range"] for row in rows)
    by_range = defaultdict(list)
    for row in rows:
        by_range[row["Item Code Range"]].append(row)

    summary_rows = []
    for range_name, grouped_rows in sorted(
        by_range.items(),
        key=lambda item: (999999 if item[0].startswith("No ") else int(item[0].split("-")[0]), item[0]),
    ):
        numeric_codes = [row["Item Code"] for row in grouped_rows if isinstance(row["Item Code"], int)]
        unique_handles = len(set(row["Handle"] for row in grouped_rows))
        unique_skus = len(set(row["Variant SKU"] for row in grouped_rows if row["Variant SKU"]))
        summary_rows.append(
            {
                "Item Code Range": range_name,
                "Start Code": min(numeric_codes) if numeric_codes else "",
                "End Code": max(numeric_codes) if numeric_codes else "",
                "Product Rows": len(grouped_rows),
                "Unique Handles": unique_handles,
                "Unique Variant SKUs": unique_skus,
                "First Product": grouped_rows[0]["Title"] if grouped_rows else "",
                "Last Product": grouped_rows[-1]["Title"] if grouped_rows else "",
            }
        )

    payload = {
        "source_file": str(SOURCE_XLSX),
        "total_rows": len(rows),
        "numeric_item_code_rows": sum(1 for row in rows if isinstance(row["Item Code"], int)),
        "non_numeric_item_code_rows": sum(1 for row in rows if not isinstance(row["Item Code"], int)),
        "range_count": len(range_counts),
        "summary_rows": summary_rows,
        "all_rows": rows,
        "groups": {key: value for key, value in by_range.items()},
        "range_rule": "Item code = Shopify Handle. Codes below 10000 are grouped as 00000-09999, 10000-19999 is one group, and 20000 onward is grouped in 1000-code buckets.",
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Rows: {payload['total_rows']}; ranges: {payload['range_count']}")
    print(Counter(row["Item Code Range"] for row in rows))


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
from pathlib import Path

import openpyxl

RECON_JSON = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\shop_stock_reconciliation_data.json")
OUT_JSON = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\shopify_shop_stock_upload_data.json")

SOURCE_FILES = {
    "3M": Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Updated Sum Duplicates.xlsx"),
    "Adwell": Path(r"C:\Users\My-PC-Win10\Downloads\adwell products - Updated Website Stock.xlsx"),
    "Artzilla": Path(r"C:\Users\My-PC-Win10\Downloads\artzilla products - Updated Website Stock.xlsx"),
    "Belkin": Path(r"C:\Users\My-PC-Win10\Downloads\belkin products - Updated Website Stock.xlsx"),
    "Brustro": Path(r"C:\Users\My-PC-Win10\Downloads\brustro products - Updated Website Stock.xlsx"),
    "Camlin": Path(r"C:\Users\My-PC-Win10\Downloads\camlin products - Updated Website Stock.xlsx"),
    "Kaweco": Path(r"C:\Users\My-PC-Win10\Downloads\kaweco products - Updated Website Stock.xlsx"),
}
FULL_WEBSITE = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (7).xlsx")
TEMPLATE_FILE = SOURCE_FILES["3M"]


def text(value) -> str:
    return "" if value is None else str(value).strip()


def cell_value(value):
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def read_headers(path: Path) -> list[str]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    ws = wb.active
    headers = [text(cell.value) for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    wb.close()
    return headers


def read_rows_by_sku(path: Path) -> dict[str, list[dict[str, object]]]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    ws = wb.active
    headers = [text(cell.value) for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    try:
        sku_idx = headers.index("Variant SKU")
    except ValueError as exc:
        wb.close()
        raise RuntimeError(f"{path} does not contain Variant SKU") from exc

    rows: dict[str, list[dict[str, object]]] = {}
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        sku = text(row[sku_idx] if sku_idx < len(row) else "")
        if not sku:
            continue
        values = {header: cell_value(row[idx] if idx < len(row) else None) for idx, header in enumerate(headers)}
        values["_source_file"] = path.name
        values["_source_row"] = row_number
        rows.setdefault(sku, []).append(values)
    wb.close()
    return rows


def main() -> None:
    recon = json.loads(RECON_JSON.read_text(encoding="utf-8"))
    template_headers = read_headers(TEMPLATE_FILE)
    required_headers = {"Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"}
    missing = required_headers - set(template_headers)
    if missing:
        raise RuntimeError(f"Template missing required upload headers: {sorted(missing)}")

    source_maps = {brand: read_rows_by_sku(path) for brand, path in SOURCE_FILES.items()}
    full_map = read_rows_by_sku(FULL_WEBSITE)

    upload_rows = []
    excluded = []
    duplicate_source_skus = []

    brand_order = ["3M", "Adwell", "Artzilla", "Beetel Panasonic", "Belkin", "Brustro", "Camlin", "Kaweco"]
    complete_rows = [
        row
        for row in recon["rows"]
        if row["Match Status"] == "Matched"
    ]
    complete_rows.sort(key=lambda row: (brand_order.index(row["Brand"]) if row["Brand"] in brand_order else 99, row["SKU"]))

    for recon_row in complete_rows:
        brand = recon_row["Brand"]
        sku = text(recon_row["SKU"])
        source_brand = "Beetel" if brand == "Beetel Panasonic" else brand
        source_candidates = source_maps.get(source_brand, {}).get(sku) or full_map.get(sku) or []
        if not source_candidates:
            excluded.append({
                "Brand": brand,
                "SKU": sku,
                "Reason": "Matched in reconciliation but source website row was not found during upload build.",
            })
            continue
        if len(source_candidates) > 1:
            duplicate_source_skus.append({
                "Brand": brand,
                "SKU": sku,
                "Source Rows": ", ".join(str(row["_source_row"]) for row in source_candidates),
                "Source File": source_candidates[0]["_source_file"],
            })

        source_row = source_candidates[0]
        upload_row = {header: source_row.get(header, None) for header in template_headers}
        upload_row["Variant SKU"] = sku
        upload_row["Variant Inventory Qty"] = recon_row["Website Stock"]
        upload_row["Shop Stock"] = recon_row["Shop Stock"]
        if "Warehouse Stock" not in source_row:
            upload_row["Warehouse Stock"] = None
        upload_row["_brand"] = brand
        upload_row["_confidence"] = recon_row["Confidence"]
        upload_row["_shop_source"] = f"p{recon_row['Source Page']} {recon_row['Source Row(s)']}"
        upload_rows.append(upload_row)

    for row in recon["rows"]:
        if row["Match Status"] != "Matched":
            excluded.append({
                "Brand": row["Brand"],
                "SKU": row["SKU"],
                "Reason": row["Match Status"],
            })
    for row in recon["needs_review"]:
        excluded.append({
            "Brand": row["brand"],
            "SKU": row["sku"],
            "Reason": row["reason"],
        })

    summary = {
        "upload_row_count": len(upload_rows),
        "excluded_count": len(excluded),
        "duplicate_source_skus": duplicate_source_skus,
        "confidence_counts": {},
        "brand_counts": {},
    }
    for row in upload_rows:
        summary["confidence_counts"][row["_confidence"]] = summary["confidence_counts"].get(row["_confidence"], 0) + 1
        summary["brand_counts"][row["_brand"]] = summary["brand_counts"].get(row["_brand"], 0) + 1

    OUT_JSON.write_text(json.dumps({
        "template_headers": template_headers,
        "upload_rows": upload_rows,
        "excluded": excluded,
        "summary": summary,
        "source_reconciliation": str(RECON_JSON),
    }, indent=2), encoding="utf-8")
    print(OUT_JSON)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

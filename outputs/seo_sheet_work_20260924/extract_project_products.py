import json
import re
from pathlib import Path
from openpyxl import load_workbook

root = Path(r"D:\lekhanmart-backend-frontend-hostinger")
exports = [
    ("Casio Products", root / "outputs/website_stock_update_casio_20260824/casio products - Updated Website Stock.xlsx"),
    ("Cello Products", root / "outputs/website_stock_update_cello_20260824/cello products - Updated Website Stock.xlsx"),
    ("Century Products", root / "outputs/website_stock_update_century_corseca_20260824/century products - Updated Website Stock.xlsx"),
    ("Corseca Products", root / "outputs/website_stock_update_century_corseca_20260824/corseca products - Updated Website Stock.xlsx"),
    ("Cross Products", root / "outputs/website_stock_update_cross_20260824/cross products - Updated Website Stock.xlsx"),
    ("Deli Products", root / "outputs/website_stock_update_deli_20260831/deli products - Updated Website Stock.xlsx"),
    ("Digitek Products", root / "outputs/website_stock_update_digitek_20260831/digitek products - Updated Website Stock.xlsx"),
    ("Duracell Products", root / "outputs/website_stock_update_duracell_20260831/duracell products - Updated Website Stock.xlsx"),
    ("Elephant Products", root / "outputs/website_stock_update_elephant_20260831/elephant products - Updated Website Stock.xlsx"),
    ("Epson Products", root / "outputs/website_stock_update_epson_20260831/epson products - Updated Website Stock.xlsx"),
]


def clean(value):
    if value is None:
        return ""
    text = str(value).replace("\u00a0", " ")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


payload = []
for sheet_name, path in exports:
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    headers = [clean(ws.cell(1, c).value) for c in range(1, ws.max_column + 1)]
    index = {name: i + 1 for i, name in enumerate(headers)}
    rows = []
    seen = set()
    for r in range(2, ws.max_row + 1):
        handle = clean(ws.cell(r, index.get("Handle", 1)).value)
        title = clean(ws.cell(r, index.get("Title", 2)).value)
        if not handle or not title or handle in seen:
            continue
        seen.add(handle)
        rows.append({
            "handle": handle,
            "title": title,
            "body": clean(ws.cell(r, index.get("Body (HTML)", 3)).value),
            "brand": clean(ws.cell(r, index.get("Brand", 5)).value) or sheet_name.replace(" Products", ""),
            "category": clean(ws.cell(r, index.get("Product Category", 6)).value),
            "sourceTags": clean(ws.cell(r, index.get("Tags", 8)).value),
        })
    payload.append({"sheetName": sheet_name, "rows": rows})

Path("project_products_next_10.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps([{"sheetName": item["sheetName"], "rows": len(item["rows"])} for item in payload], indent=2))

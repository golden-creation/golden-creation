from pathlib import Path
from openpyxl import load_workbook

root = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs")
files = [
    root / "website_stock_update_casio_20260824" / "casio products - Updated Website Stock.xlsx",
    root / "website_stock_update_cello_20260824" / "cello products - Updated Website Stock.xlsx",
    root / "website_stock_update_century_corseca_20260824" / "century products - Updated Website Stock.xlsx",
    root / "website_stock_update_century_corseca_20260824" / "corseca products - Updated Website Stock.xlsx",
    root / "website_stock_update_cross_20260824" / "cross products - Updated Website Stock.xlsx",
    root / "website_stock_update_deli_20260831" / "deli products - Updated Website Stock.xlsx",
    root / "website_stock_update_digitek_20260831" / "digitek products - Updated Website Stock.xlsx",
    root / "website_stock_update_duracell_20260831" / "duracell products - Updated Website Stock.xlsx",
    root / "website_stock_update_elephant_20260831" / "elephant products - Updated Website Stock.xlsx",
    root / "website_stock_update_epson_20260831" / "epson products - Updated Website Stock.xlsx",
]

for path in files:
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    headers = [ws.cell(1, c).value for c in range(1, min(ws.max_column, 16) + 1)]
    sample = [[ws.cell(r, c).value for c in range(1, min(ws.max_column, 9) + 1)] for r in range(2, min(ws.max_row, 5) + 1)]
    print(path.name)
    print("  sheet:", ws.title, "rows:", ws.max_row, "cols:", ws.max_column)
    print("  headers:", headers)
    print("  sample:", sample)

from pathlib import Path
from openpyxl import load_workbook

path = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\seo_sheet_work_20260924\source.xlsx")
wb = load_workbook(path, read_only=True, data_only=True)

for ws in wb.worksheets:
    if ws.title == "Research Sources":
        continue
    headers = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]
    row_count = max(ws.max_row - 1, 0)
    missing = {}
    for name in ["Description", "Keywords", "Keyword", "Submissions", "Tags", "Image SEO Status"]:
        if name in headers:
            idx = headers.index(name) + 1
            missing[name] = sum(1 for r in range(2, ws.max_row + 1) if not ws.cell(r, idx).value)
    print(ws.title, "rows", row_count, "headers", headers, "missing", missing)

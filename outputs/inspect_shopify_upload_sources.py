from pathlib import Path

import openpyxl

files = [
    Path(r"C:\Users\My-PC-Win10\Downloads\3M Products for Website Stock - Updated Sum Duplicates.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\adwell products - Updated Website Stock.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\artzilla products - Updated Website Stock.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\belkin products - Updated Website Stock.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\brustro products - Updated Website Stock.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\camlin products - Updated Website Stock.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\kaweco products - Updated Website Stock.xlsx"),
    Path(r"C:\Users\My-PC-Win10\Downloads\website-products (7).xlsx"),
]

for path in files:
    if not path.exists():
        print("MISSING", path)
        continue
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    ws = wb.active
    headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    rows = sum(1 for _ in ws.iter_rows(min_row=2, values_only=True))
    print(f"\nFILE: {path.name}")
    print(f"rows={rows} cols={len(headers)}")
    print(headers)
    wb.close()

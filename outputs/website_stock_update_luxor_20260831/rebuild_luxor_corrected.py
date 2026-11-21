from __future__ import annotations

import json
import shutil
from pathlib import Path

import openpyxl


OUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_luxor_20260831")
AUDIT = OUT_DIR / "luxor_stock_update_audit.json"
PROJECT_OUT = OUT_DIR / "luxor products - Updated Website Stock Corrected.xlsx"
DOWNLOADS_OUT = Path(r"C:\Users\My-PC-Win10\Downloads\luxor products - Updated Website Stock Corrected.xlsx")


def text(value) -> str:
    return "" if value is None else str(value).strip()


def header_map(ws):
    return {text(cell.value): index for index, cell in enumerate(ws[1], start=1)}


def main():
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    source = Path(audit["source_file"])
    wb = openpyxl.load_workbook(source)
    ws = wb.active
    headers = header_map(ws)
    stock_col = headers["Variant Inventory Qty"]

    updated_rows = 0
    for row in audit["rows"]:
        if row["status"] in {"matched_direct", "duplicate_code_summed"}:
            ws.cell(row=row["row"], column=stock_col).value = row["new_qty"]
            updated_rows += 1

    # Shopify helper columns in the source contain deliberate empty-string cells.
    # openpyxl may drop them unless they are reasserted before saving.
    for row_number in range(2, ws.max_row + 1):
        for column in range(10, 15):
            if ws.cell(row=row_number, column=column).value is None:
                ws.cell(row=row_number, column=column).value = ""

    PROJECT_OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(PROJECT_OUT)
    wb.close()
    shutil.copy2(PROJECT_OUT, DOWNLOADS_OUT)

    audit["project_output"] = str(PROJECT_OUT)
    audit["downloads_output"] = str(DOWNLOADS_OUT)
    audit["downloads_status"] = "corrected_copy"
    audit["corrected_rebuild"] = {
        "method": "openpyxl_load_original_and_save",
        "updated_rows": updated_rows,
        "reason": "previous low-level XML patched package did not open in Excel for the user",
    }
    (OUT_DIR / "luxor_stock_update_audit_corrected.json").write_text(
        json.dumps(audit, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(audit["summary"], indent=2))
    print(f"project_output={PROJECT_OUT}")
    print(f"downloads_output={DOWNLOADS_OUT}")
    print(f"audit={OUT_DIR / 'luxor_stock_update_audit_corrected.json'}")


if __name__ == "__main__":
    main()

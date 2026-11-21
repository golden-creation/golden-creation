from __future__ import annotations

import json
import re
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
OUTPUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_faber_finger_hama_20260831")

WORKBOOKS = [
    {
        "brand": "Faber-Castell",
        "source": Path(r"C:\Users\My-PC-Win10\Downloads\website-products (28).xlsx"),
        "output_name": "faber castell products - Updated Website Stock.xlsx",
    },
    {
        "brand": "Finger",
        "source": Path(r"C:\Users\My-PC-Win10\Downloads\website-products (29).xlsx"),
        "output_name": "finger products - Updated Website Stock.xlsx",
    },
    {
        "brand": "Hama",
        "source": Path(r"C:\Users\My-PC-Win10\Downloads\website-products (30).xlsx"),
        "output_name": "hama products - Updated Website Stock.xlsx",
    },
]


def norm(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def to_qty(value):
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        qty = value
    else:
        qty = float(str(value).strip())
    return int(qty) if float(qty).is_integer() else qty


def header_map(ws) -> dict[str, int]:
    return {str(cell.value).strip(): idx for idx, cell in enumerate(ws[1], start=1) if cell.value is not None}


def build_busy_lookup() -> dict[str, list[dict]]:
    wb = openpyxl.load_workbook(BUSY_FILE, data_only=True, read_only=True)
    ws = wb.active
    headers = header_map(ws)
    required = ["ITEM CODE", "Item Details", "ITEM GROUP", "Cl. Qty"]
    missing = [name for name in required if name not in headers]
    if missing:
        raise RuntimeError(f"Busy workbook missing headers: {missing}")

    lookup: dict[str, list[dict]] = defaultdict(list)
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        sku = norm(row[headers["ITEM CODE"] - 1])
        if not sku:
            continue
        lookup[sku].append(
            {
                "busy_row": row_number,
                "item_group": row[headers["ITEM GROUP"] - 1],
                "item_details": row[headers["Item Details"] - 1],
                "cl_qty": to_qty(row[headers["Cl. Qty"] - 1]),
            }
        )
    wb.close()
    return lookup


def update_workbook(spec: dict, busy_lookup: dict[str, list[dict]]) -> dict:
    source = spec["source"]
    output_path = OUTPUT_DIR / spec["output_name"]
    downloads_path = Path(r"C:\Users\My-PC-Win10\Downloads") / spec["output_name"]

    wb = openpyxl.load_workbook(source, data_only=False, read_only=True)
    ws = wb.active
    headers = header_map(ws)
    required = ["Title", "Brand", "Variant SKU", "Variant Inventory Qty", "Warehouse Stock", "Shop Stock"]
    missing = [name for name in required if name not in headers]
    if missing:
        raise RuntimeError(f"{source.name} missing headers: {missing}")

    audit_rows = []
    changed_rows = 0
    status_counts: dict[str, int] = defaultdict(int)

    for row_number in range(2, ws.max_row + 1):
        sku = norm(ws.cell(row_number, headers["Variant SKU"]).value)
        if not sku:
            continue

        title = ws.cell(row_number, headers["Title"]).value
        brand = ws.cell(row_number, headers["Brand"]).value
        old_qty = ws.cell(row_number, headers["Variant Inventory Qty"]).value
        matches = busy_lookup.get(sku, [])

        if matches:
            new_qty = sum(to_qty(match["cl_qty"]) for match in matches)
            new_qty = int(new_qty) if float(new_qty).is_integer() else new_qty
            status = "Matched" if len(matches) == 1 else "Duplicate Busy SKU Summed"
            if old_qty != new_qty:
                changed_rows += 1
        else:
            new_qty = old_qty
            status = "No Busy Match"

        status_counts[status] += 1
        audit_rows.append(
            {
                "source_file": str(source),
                "output_file": str(output_path),
                "downloads_copy": str(downloads_path),
                "brand": brand,
                "row": row_number,
                "sku": sku,
                "title": title,
                "old_qty": old_qty,
                "new_qty": new_qty,
                "status": status,
                "busy_matches": matches,
            }
        )

    wb.close()

    shutil.copy2(source, output_path)
    stock_col_letter = openpyxl.utils.get_column_letter(headers["Variant Inventory Qty"])
    replacements = {
        f"{stock_col_letter}{row['row']}": row["new_qty"]
        for row in audit_rows
        if row["old_qty"] != row["new_qty"]
    }
    if replacements:
        patch_xlsx_cells(output_path, replacements)
    shutil.copy2(output_path, downloads_path)

    return {
        "brand": spec["brand"],
        "source": str(source),
        "output": str(output_path),
        "downloads_copy": str(downloads_path),
        "sku_rows": len(audit_rows),
        "changed_rows": changed_rows,
        "status_counts": dict(status_counts),
        "rows": audit_rows,
    }


def patch_xlsx_cells(path: Path, replacements: dict[str, int | float]) -> None:
    temp_path = path.with_suffix(".tmp.xlsx")
    with zipfile.ZipFile(path, "r") as zin, zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                xml = data.decode("utf-8")
                for cell_ref, value in replacements.items():
                    value_text = str(value)
                    pattern = re.compile(rf'(<c\b[^>]*\br="{re.escape(cell_ref)}"[^>]*>)(.*?)(</c>)', re.S)

                    def replace_cell(match: re.Match) -> str:
                        start, body, end = match.groups()
                        if "<v>" in body:
                            body = re.sub(r"<v>.*?</v>", f"<v>{value_text}</v>", body, count=1, flags=re.S)
                        else:
                            body = body + f"<v>{value_text}</v>"
                        return start + body + end

                    xml, count = pattern.subn(replace_cell, xml, count=1)
                    if count != 1:
                        raise RuntimeError(f"Could not patch cell {cell_ref} in {path}")
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    temp_path.replace(path)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    busy_lookup = build_busy_lookup()
    results = [update_workbook(spec, busy_lookup) for spec in WORKBOOKS]
    audit = {"busy_file": str(BUSY_FILE), "results": results}
    audit_path = OUTPUT_DIR / "faber_finger_hama_stock_update_audit.json"
    audit_path.write_text(json.dumps(audit, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "summary": [
                    {
                        "brand": result["brand"],
                        "sku_rows": result["sku_rows"],
                        "changed_rows": result["changed_rows"],
                        "status_counts": result["status_counts"],
                        "downloads_copy": result["downloads_copy"],
                    }
                    for result in results
                ],
                "audit": str(audit_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

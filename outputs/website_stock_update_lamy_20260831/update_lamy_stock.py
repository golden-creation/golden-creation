from __future__ import annotations

import json
import re
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path

import openpyxl


BUSY_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\GOLDEN CRE_StockStatus of busy for website stock.xlsx")
SOURCE_FILE = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (41).xlsx")
OUTPUT_DIR = Path(r"D:\lekhanmart-backend-frontend-hostinger\outputs\website_stock_update_lamy_20260831")
OUTPUT_FILE = OUTPUT_DIR / "lamy products - Updated Website Stock Corrected.xlsx"
DOWNLOADS_COPY = Path(r"C:\Users\My-PC-Win10\Downloads\lamy products - Updated Website Stock Corrected.xlsx")
AUDIT_FILE = OUTPUT_DIR / "lamy_stock_update_audit.json"

BUSY_CODE_COLLISION_RULES = {
    "12374": {
        "include_terms": ["BLACK"],
        "exclude_terms": ["SEPIA"],
        "reason": "Busy uses SKU 12374 for both T52 Black and T52 Sepia; website row is T52 Black.",
    }
}


def norm(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def to_qty(value):
    if value is None or value == "":
        return 0
    qty = value if isinstance(value, (int, float)) else float(str(value).strip())
    return int(qty) if float(qty).is_integer() else qty


def header_map(ws) -> dict[str, int]:
    return {str(cell.value).strip(): idx for idx, cell in enumerate(ws[1], start=1) if cell.value is not None}


def build_busy_lookup() -> dict[str, list[dict]]:
    wb = openpyxl.load_workbook(BUSY_FILE, data_only=True, read_only=True)
    ws = wb.active
    headers = header_map(ws)
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


def patch_xlsx_cells(path: Path, replacements: dict[str, int | float]) -> None:
    temp_path = path.with_suffix(".tmp.xlsx")
    with zipfile.ZipFile(path, "r") as zin, zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                xml = data.decode("utf-8")
                for cell_ref, value in replacements.items():
                    pattern = re.compile(rf'(<c\b[^>]*\br="{re.escape(cell_ref)}"[^>]*>)(.*?)(</c>)', re.S)

                    def replace_cell(match: re.Match) -> str:
                        start, body, end = match.groups()
                        body = re.sub(r"<v>.*?</v>", f"<v>{value}</v>", body, count=1, flags=re.S)
                        return start + body + end

                    xml, count = pattern.subn(replace_cell, xml, count=1)
                    if count != 1:
                        raise RuntimeError(f"Could not patch cell {cell_ref}")
                data = xml.encode("utf-8")
            zout.writestr(item, data)
    temp_path.replace(path)


def filtered_collision_matches(sku: str, matches: list[dict]) -> tuple[list[dict], str | None]:
    rule = BUSY_CODE_COLLISION_RULES.get(sku)
    if not rule:
        return matches, None
    filtered = []
    for match in matches:
        details = norm(match["item_details"]).upper()
        if all(term in details for term in rule["include_terms"]) and not any(
            term in details for term in rule["exclude_terms"]
        ):
            filtered.append(match)
    if not filtered:
        raise RuntimeError(f"Busy collision rule for SKU {sku} removed every match")
    return filtered, rule["reason"]


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    busy_lookup = build_busy_lookup()
    wb = openpyxl.load_workbook(SOURCE_FILE, data_only=False, read_only=True)
    ws = wb["Products"] if "Products" in wb.sheetnames else wb.active
    headers = header_map(ws)
    stock_col_letter = openpyxl.utils.get_column_letter(headers["Variant Inventory Qty"])
    audit_rows = []
    replacements: dict[str, int | float] = {}
    status_counts: dict[str, int] = defaultdict(int)

    for row_number in range(2, ws.max_row + 1):
        sku = norm(ws.cell(row_number, headers["Variant SKU"]).value)
        if not sku:
            continue
        old_qty = ws.cell(row_number, headers["Variant Inventory Qty"]).value
        matches = busy_lookup.get(sku, [])
        if matches:
            used_matches, collision_reason = filtered_collision_matches(sku, matches)
            new_qty = sum(to_qty(match["cl_qty"]) for match in used_matches)
            new_qty = int(new_qty) if float(new_qty).is_integer() else new_qty
            if collision_reason:
                status = "Busy SKU Collision - Exact Product Match Used"
            else:
                status = "Matched" if len(matches) == 1 else "Duplicate Busy SKU Summed"
            if old_qty != new_qty:
                replacements[f"{stock_col_letter}{row_number}"] = new_qty
        else:
            new_qty = old_qty
            status = "No Busy Match"
            used_matches = []
            collision_reason = None
        status_counts[status] += 1
        audit_rows.append(
            {
                "row": row_number,
                "sku": sku,
                "title": ws.cell(row_number, headers["Title"]).value,
                "brand": ws.cell(row_number, headers["Brand"]).value,
                "old_qty": old_qty,
                "new_qty": new_qty,
                "status": status,
                "busy_matches": matches,
                "busy_matches_used": used_matches,
                "collision_reason": collision_reason,
            }
        )
    wb.close()

    shutil.copy2(SOURCE_FILE, OUTPUT_FILE)
    if replacements:
        patch_xlsx_cells(OUTPUT_FILE, replacements)
    shutil.copy2(OUTPUT_FILE, DOWNLOADS_COPY)
    AUDIT_FILE.write_text(
        json.dumps(
            {
                "busy_file": str(BUSY_FILE),
                "source_file": str(SOURCE_FILE),
                "output_file": str(OUTPUT_FILE),
                "downloads_copy": str(DOWNLOADS_COPY),
                "status_counts": dict(status_counts),
                "changed_rows": len(replacements),
                "rows": audit_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "sku_rows": len(audit_rows),
                "changed_rows": len(replacements),
                "status_counts": dict(status_counts),
                "downloads_copy": str(DOWNLOADS_COPY),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

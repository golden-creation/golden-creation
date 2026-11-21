from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

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


def excel_col(index_1_based: int) -> str:
    label = ""
    while index_1_based:
        index_1_based, rem = divmod(index_1_based - 1, 26)
        label = chr(65 + rem) + label
    return label


def col_to_index(col: str) -> int:
    value = 0
    for char in col:
        value = value * 26 + ord(char.upper()) - 64
    return value


def build_busy_lookup(needed_codes: set[str] | None = None):
    wb = openpyxl.load_workbook(BUSY, read_only=True, data_only=True)
    busy_ws = None
    busy_headers = None
    for ws in wb.worksheets:
        first_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        names = {text(value) for value in first_row}
        if "ITEM CODE" in names and "Cl. Qty" in names:
            busy_ws = ws
            busy_headers = first_row
            break
    if busy_ws is None or busy_headers is None:
        raise RuntimeError("Busy workbook does not contain ITEM CODE and Cl. Qty headers")

    headers = header_map(busy_headers)
    code_i = headers["ITEM CODE"]
    group_i = headers.get("ITEM GROUP")
    name_i = headers.get("ITEM NAME", headers.get("ITEM DESCRIPTION"))
    mrp_i = headers.get("MRP")
    cl_i = headers["Cl. Qty"]

    busy = defaultdict(list)
    for row_number, row in enumerate(busy_ws.iter_rows(min_row=2, values_only=True), start=2):
        code = text(row[code_i] if code_i < len(row) else "")
        if not code or (needed_codes is not None and code not in needed_codes):
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


def read_website_rows(source: Path):
    wb = openpyxl.load_workbook(source, read_only=True, data_only=False)
    ws = wb.active
    first_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
    headers = header_map(first_row)
    sku_i = headers["Variant SKU"]
    stock_i = headers["Variant Inventory Qty"]
    title_i = headers.get("Title")
    variant_i = headers.get("Variant Option1 Value")
    warehouse_i = headers.get("Warehouse Stock")
    shop_i = headers.get("Shop Stock")
    rows = []
    for row_number, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        sku = text(row[sku_i] if sku_i < len(row) else "")
        if not sku:
            continue
        rows.append(
            {
                "row": row_number,
                "sku": sku,
                "base_sku": sku.split("-")[0],
                "title": text(row[title_i]) if title_i is not None and title_i < len(row) else "",
                "variant": text(row[variant_i]) if variant_i is not None and variant_i < len(row) else "",
                "old_qty": clean(qty(row[stock_i] if stock_i < len(row) else None)),
                "warehouse_stock": row[warehouse_i] if warehouse_i is not None and warehouse_i < len(row) else None,
                "shop_stock": row[shop_i] if shop_i is not None and shop_i < len(row) else None,
            }
        )
    meta = {
        "sheet_name": ws.title,
        "max_row": ws.max_row,
        "max_column": ws.max_column,
        "sku_col": sku_i + 1,
        "stock_col": stock_i + 1,
        "warehouse_col": warehouse_i + 1 if warehouse_i is not None else None,
        "shop_col": shop_i + 1 if shop_i is not None else None,
    }
    wb.close()
    return rows, meta


def patch_sheet_values(source: Path, destination: Path, sheet_name: str, stock_col_1_based: int, updates: dict[int, int | float]):
    with zipfile.ZipFile(source, "r") as zin, tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        zin.extractall(tmp)
        ns = {
            "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
            "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        }
        ET.register_namespace("", ns["main"])
        ET.register_namespace("r", ns["rel"])
        workbook = ET.parse(tmp / "xl" / "workbook.xml")
        rel_id = None
        for sheet in workbook.getroot().find("main:sheets", ns):
            if sheet.attrib.get("name") == sheet_name:
                rel_id = sheet.attrib[f"{{{ns['rel']}}}id"]
                break
        if rel_id is None:
            raise RuntimeError(f"Sheet {sheet_name!r} not found")
        rels = ET.parse(tmp / "xl" / "_rels" / "workbook.xml.rels")
        target = next(rel.attrib["Target"] for rel in rels.getroot() if rel.attrib.get("Id") == rel_id)
        sheet_xml = tmp / "xl" / target.lstrip("/")
        if not sheet_xml.exists():
            sheet_xml = tmp / "xl" / "worksheets" / Path(target).name
        tree = ET.parse(sheet_xml)
        root = tree.getroot()
        sheet_data = root.find("main:sheetData", ns)
        rows_by_number = {int(row.attrib["r"]): row for row in sheet_data.findall("main:row", ns)}
        col = excel_col(stock_col_1_based)
        for row_number, new_qty in updates.items():
            row = rows_by_number[row_number]
            cell_ref = f"{col}{row_number}"
            target_cell = None
            insert_at = 0
            for idx, cell in enumerate(row.findall("main:c", ns)):
                ref = cell.attrib.get("r", "")
                ref_col = re.sub(r"\d+", "", ref)
                if ref == cell_ref:
                    target_cell = cell
                    break
                if ref_col and col_to_index(ref_col) < stock_col_1_based:
                    insert_at = idx + 1
            if target_cell is None:
                target_cell = ET.Element(f"{{{ns['main']}}}c", {"r": cell_ref})
                row.insert(insert_at, target_cell)
            for child in list(target_cell):
                target_cell.remove(child)
            target_cell.attrib.pop("t", None)
            target_cell.attrib["r"] = cell_ref
            ET.SubElement(target_cell, f"{{{ns['main']}}}v").text = str(clean(new_qty))
        tree.write(sheet_xml, encoding="utf-8", xml_declaration=True)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for file_path in tmp.rglob("*"):
                if file_path.is_file():
                    zout.write(file_path, file_path.relative_to(tmp).as_posix())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--brand", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--downloads-output", required=True)
    args = parser.parse_args()

    source = Path(args.source)
    out_dir = Path(args.out_dir)
    project_out = out_dir / f"{args.brand} products - Updated Website Stock.xlsx"
    downloads_out = Path(args.downloads_output)
    audit_out = out_dir / f"{args.brand.lower()}_stock_update_audit.json"

    website_rows, meta = read_website_rows(source)
    needed_codes = {row["sku"] for row in website_rows} | {row["base_sku"] for row in website_rows}
    busy, busy_sheet = build_busy_lookup(needed_codes)
    updates = {}
    audit_rows = []
    missing = []
    base_code_available = []
    duplicate_summed = []
    negative = []
    fractional = []
    for row in website_rows:
        matches = busy.get(row["sku"], [])
        if not matches:
            base_matches = busy.get(row["base_sku"], []) if row["base_sku"] != row["sku"] else []
            status = "base_code_available_no_exact_sku" if base_matches else "missing_in_busy"
            if base_matches:
                base_code_available.append({**row, "base_busy_rows": base_matches})
            missing.append(row)
            audit_rows.append({**row, "status": status, "new_qty": row["old_qty"], "busy_rows": [], "base_busy_rows": base_matches})
            continue
        new_qty = clean(sum((entry["cl_qty"] or 0) for entry in matches))
        updates[row["row"]] = new_qty
        status = "matched_direct" if len(matches) == 1 else "duplicate_code_summed"
        audit_record = {**row, "status": status, "new_qty": new_qty, "busy_rows": matches, "base_busy_rows": []}
        audit_rows.append(audit_record)
        if len(matches) > 1:
            duplicate_summed.append(audit_record)
        if isinstance(new_qty, (int, float)) and new_qty < 0:
            negative.append(audit_record)
        if isinstance(new_qty, float) and not new_qty.is_integer():
            fractional.append(audit_record)

    patch_sheet_values(source, project_out, meta["sheet_name"], meta["stock_col"], updates)
    try:
        shutil.copy2(project_out, downloads_out)
        final_download = downloads_out
        downloads_status = "copied"
    except PermissionError:
        final_download = downloads_out.with_name(downloads_out.stem + " Copy.xlsx")
        shutil.copy2(project_out, final_download)
        downloads_status = "locked_used_fallback"

    changed = [row for row in audit_rows if row["old_qty"] != row["new_qty"]]
    audit = {
        "source_file": str(source),
        "busy_file": str(BUSY),
        "busy_sheet": busy_sheet,
        "project_output": str(project_out),
        "downloads_output": str(final_download),
        "downloads_status": downloads_status,
        "meta": meta,
        "summary": {
            "website_sku_rows": len(website_rows),
            "matched_direct": sum(1 for row in audit_rows if row["status"] == "matched_direct"),
            "duplicate_code_summed": len(duplicate_summed),
            "missing_in_busy": len(missing),
            "base_code_available_no_exact_sku": len(base_code_available),
            "changed": len(changed),
            "negative_new_qty": len(negative),
            "fractional_new_qty": len(fractional),
        },
        "missing_in_busy": missing,
        "base_code_available_no_exact_sku": base_code_available,
        "duplicate_code_summed": duplicate_summed,
        "negative_new_qty": negative,
        "fractional_new_qty": fractional,
        "changed_rows": changed,
        "rows": audit_rows,
    }
    audit_out.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(audit["summary"], indent=2))
    print(f"project_output={project_out}")
    print(f"downloads_output={final_download}")
    print(f"audit={audit_out}")


if __name__ == "__main__":
    main()

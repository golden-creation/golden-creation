import copy
import hashlib
import json
from lxml import etree as ET
from collections import Counter
from pathlib import Path
from zipfile import ZipFile
import openpyxl

root = Path(__file__).parent
data = json.loads((root/'matches.json').read_text())
source = Path(data['source'])
dest = Path(r'C:\Users\My-PC-Win10\Downloads\SHEAFFER LIST - MRP Rechecked.xlsx')
changes = {f"C{x['row']}": x for x in data['rows'] if x['status']=='Updated'}
ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

# Transfer only Artifact-authored price values into the original package.
# This preserves all Busy formatting and metadata despite import/export differences.
with ZipFile(source) as original, ZipFile(root/'authored.xlsx') as authored:
    part = 'xl/worksheets/sheet1.xml'
    target_xml = ET.fromstring(original.read(part))
    authored_xml = ET.fromstring(authored.read(part))
    target_cells = {c.attrib['r']:c for c in target_xml.findall('.//s:c',ns)}
    authored_cells = {c.attrib['r']:c for c in authored_xml.findall('.//s:c',ns)}
    for address,change in changes.items():
        out = target_cells[address]
        incoming = authored_cells[address]
        value = incoming.find('s:v',ns)
        assert incoming.get('t','n') == 'n', address
        assert value is not None and float(value.text)==change['new'], address
        for child in list(out):
            if child.tag in {f"{{{ns['s']}}}{n}" for n in ('v','f','is')}:
                out.remove(child)
        out.set('t','n')
        out.append(copy.deepcopy(value))
    with ZipFile(dest,'w') as output:
        for info in original.infolist():
            output.writestr(info, ET.tostring(target_xml,encoding='UTF-8',xml_declaration=True,standalone=True) if info.filename==part else original.read(info.filename))

before = openpyxl.load_workbook(source)
after = openpyxl.load_workbook(dest)
assert before.sheetnames == after.sheetnames
differences = []
for a,b in zip(before,after):
    assert a.max_row==b.max_row and a.max_column==b.max_column
    for row in a:
        for cell in row:
            updated = b[cell.coordinate]
            assert cell._style==updated._style, cell.coordinate
            if cell.value != updated.value:
                differences.append(cell.coordinate)
                assert cell.coordinate in changes
                assert updated.value==changes[cell.coordinate]['new']
assert set(differences)==set(changes)
for x in data['rows']:
    actual = after.active.cell(x['row'],3).value
    assert float(str(actual).replace(',',''))==x['new']
previous = openpyxl.load_workbook(r'C:\Users\My-PC-Win10\Downloads\SHEAFFER LIST - Updated MRP - Repaired.xlsx').active
changed_since_previous = []
for x in data['rows']:
    prev = float(str(previous.cell(x['row'],3).value).replace(',',''))
    if prev != x['new']:
        changed_since_previous.append(dict(row=x['row'],sku=x['sku'],previous=prev,new=x['new']))
assert {x['row'] for x in changed_since_previous}=={121,188}
assert [float(str(after.active.cell(r,3).value).replace(',','')) for r in (124,125,126)] == [5295,6995,5995]
with ZipFile(source) as a,ZipFile(dest) as b:
    assert a.namelist()==b.namelist()
    assert b.testzip() is None
    for name in b.namelist():
        if name.endswith('.xml'):
            tree = ET.fromstring(b.read(name))
            for node in tree.iter():
                ignorable = node.get('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable', '')
                for prefix in ignorable.split():
                    assert prefix in node.nsmap, (name, 'Undeclared compatibility prefix', prefix)
    for name in a.namelist():
        if name!=part: assert a.read(name)==b.read(name),name
    original_cells = {c.attrib['r']:c for c in ET.fromstring(a.read(part)).findall('.//s:c',ns)}
    final_cells = {c.attrib['r']:c for c in ET.fromstring(b.read(part)).findall('.//s:c',ns)}
    for address,c in original_cells.items():
        if address not in changes: assert ET.tostring(c)==ET.tostring(final_cells[address]),address
summary = dict(output=str(dest),product_rows=len(data['rows']),status_counts=dict(Counter(x['status'] for x in data['rows'])),
               changes_since_previous=changed_since_previous,
               changed_cells=len(differences),only_mrp_cells_changed=True,all_cell_styles_preserved=True,
               other_package_parts_byte_identical=True,zip_valid=True,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
(root/'verification.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))

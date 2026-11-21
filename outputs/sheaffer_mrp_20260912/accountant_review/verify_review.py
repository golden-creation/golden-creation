import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
import openpyxl

root=Path(__file__).parent
data=json.loads((root/'review_data.json').read_text())
path=root/'SHEAFFER MRP - Accountant Match and Review.xlsx'
w=openpyxl.load_workbook(path)
assert w.sheetnames==['Manual Review','All Matches']
manual,all_matches=w.worksheets
assert manual.max_row==123 and all_matches.max_row==225
assert len(manual.tables)==1 and len(all_matches.tables)==1
assert len(manual.data_validations.dataValidation)==1
for i,r in enumerate(data['manual'],9):
    expected=[r['row'],r['sku'] or None,r['name'],r['new'],r['issue'],r['review_reason'],r['action'],None,None,r['source_pages'] or None,r['single_prices'] or None,r['old']]
    actual=[manual.cell(i,c).value for c in range(1,13)]
    assert expected==actual,(i,expected,actual)
for i,r in enumerate(data['records'],9):
    expected=[r['row'],r['sku'] or None,r['name'],r['old'],r['new'],r['status'],r['issue'],r['model'] or None,r['kind'] or None,r['source_pages'] or None,r['review_reason'],r['action']]
    actual=[all_matches.cell(i,c).value for c in range(1,13)]
    assert expected==actual,(i,expected,actual)
for p,h in data['source_hashes'].items():
    assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
with ZipFile(path) as z:
    assert z.testzip() is None
    for name in z.namelist():
        if name.endswith('.xml'):
            for node in etree.fromstring(z.read(name)).iter():
                for prefix in node.get('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable','').split():
                    assert prefix in node.nsmap,(name,prefix)
print('Verified all 115 review rows and 217 complete-log rows, blank accountant inputs, XML namespaces, and unchanged source workbooks.')

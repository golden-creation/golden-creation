import collections
import csv
import json
import re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).parent
SOURCE = Path(r'C:\Users\My-PC-Win10\Downloads\SHEAFFER LIST.xlsx')
sheet = openpyxl.load_workbook(SOURCE).active
website_source = Path(r'C:\Users\My-PC-Win10\Downloads\sheaffer products - Updated Website Stock.xlsx')
website_rows = list(openpyxl.load_workbook(website_source).active.values)
website_header = website_rows[0]
website_sku_col = website_header.index('Variant SKU')
website_title_col = website_header.index('Title')
website_by_sku = collections.defaultdict(list)
for record in website_rows[1:]:
    website_by_sku[str(record[website_sku_col] or '').strip()].append(record[website_title_col] or '')

# Visually transcribed exact single-pen prices, in FP/RB/BP order.
groups = [
    (1, '9066', 24000, 15000, 13000),
    (1, '9065', 21500, 12000, 11000),
    (1, '9064', 17995, 11995, 10995),
    (2, '9108 9110 9111', 10500, 9495, 7995),
    (2, '9475 9471', 7500, 6995, 6495),
    (3, '9017 9019 9018', None, None, 4395),
    (3, '9347', 6995, 5995, 5295),
    (3, '9341', 4495, 3995, 3000),
    (3, '9325', 5995, 5295, 4595),
    (3, '9342', 5995, 5295, 4895),
    (4, '9345 9343 9346', 5200, 4395, 3995),
    (4, '9314 9312', 4495, 3995, 3000),
    (4, '9376', 4995, 3795, 3195),
    (4, '9375', 6995, 5695, 3895),
    (4, '9374', 6495, 5495, 3895),
    (4, '9370', 6595, 5200, 3495),
    (5, '9372', 8695, 6995, 5695),
    (5, '9371', 6595, 5200, 3495),
    (5, '9322', 5695, 4995, 3000),
    (5, '9338 9339 9306 9313', 4395, 3795, 2595),
    (5, '9340', 5695, 5200, 3795),
    (5, '9317', 4395, 3795, 2250),
    (6, '9430 9424 9426', 2695, 2495, 2295),
    (6, '9429', 2995, 2495, 2395),
    (6, '9428', 3495, 3195, 2995),
    (6, '9427', 3195, 3095, 2995),
    (6, '9422', 3195, 3100, 2995),
    (6, '9405', 2050, 1895, 1595),
    (7, '9400 9401 9403', 2050, 1895, 1595),
    (7, '9421', 2795, 2595, 2295),
    (7, '32151 32125 32172 32173 32111', None, None, 950),
    (8, '330 331 332', None, None, 1050),
    (8, '333 334 335', None, None, 1250),
    (8, '336 337 338', None, None, 1995),
]
catalog = {}
for page, codes, fp, rb, bp in groups:
    for code in codes.split():
        for kind, price in zip(('FP','RB','BP'), (fp,rb,bp)):
            if price is not None:
                assert (code,kind) not in catalog
                catalog[code,kind] = dict(page=page, price=price)

sentinel = {5:'32111',6:'32111',7:'32173',8:'32125',9:'32172',10:'32125',11:'32151',12:'32151'}
exceptions = {
    153: 'Busy model 9403 conflicts with PURPLE; catalog 9403 is red. Confirm model/colour.',
    157: 'Busy model 9403 conflicts with VIOLET; catalog 9403 is red. Confirm model/colour.',
    187: 'Busy 9475 says BLACK CT; catalog 9475 has chrome cap and GOLD trim. Confirm finish.',
}
resolved_types = {121:('11638','9346'),188:('11521','9475')}
duplicates = collections.Counter(str(sheet.cell(r,1).value or '').strip() for r in range(2,219))
rows = []
for r in range(2,219):
    values = [sheet.cell(r,c).value for c in range(1,11)]
    sku = str(values[0] or '').strip()
    name = values[1]
    old = float(str(values[2]).replace(',',''))
    match = re.search(r'^SH\s+(\d+)\b', name)
    code = match.group(1) if match else ''
    kinds = set(re.findall(r'\b(FP|RB|BP)(?=\b|\d)',name))
    if 'BALL PEN' in name: kinds.add('BP')
    kind = next(iter(kinds)) if len(kinds)==1 else ''
    price = None
    page = ''
    reason = ''
    supporting_title = ''
    bundle = bool(re.search(r'\+|\bSET\b|\b(?:TC|BCH|CCH|NB|NOTEBOOK|WALLET|POUCH|COVER)\b|& BP|3 INK',name))
    if r in exceptions:
        reason = exceptions[r]
    elif r in resolved_types:
        expected_sku, expected_model = resolved_types[r]
        assert (sku,code)==(expected_sku,expected_model)
        titles = website_by_sku[sku]
        assert len(titles)==1 and 'BALL PEN' in titles[0] and code in titles[0], (r,titles)
        assert not re.search(r'\b(?:NB|CCH|BCH|TC|NOTEBOOK|HOLDER|POUCH|COVER|SET)\b',titles[0])
        supporting_title = titles[0]
        kind='BP'
        hit=catalog[code,kind]
        price,page=hit['price'],hit['page']
        reason='Pen type resolved using exact SKU and model in existing website export: '+supporting_title
        if r==121:
            reason += '. Other Busy row with same item code also explicitly identifies 9346 BP; both now have MRP 3995.'
        else:
            reason += '. Original Busy MRP was zero; new price is the catalog single-ballpoint MRP.'
    elif name.startswith('PENNLINE'):
        reason = 'Pennline product; absent from Sheaffer catalog.'
    elif bundle and code in {k[0] for k in catalog}:
        reason = 'Bundle/gift set retained for manual review per user instruction. NB=notebook; CCH=credit card holder; BCH=business card holder; TC=table clock. No single-pen price applied to a bundle.'
        if code in {k[0] for k in catalog}: page = '9-11'
    elif bundle and re.search(r'\b(?:FP|RB|BP)(?=\b|\d)',name):
        reason = 'Bundle not priced exactly in catalog; original MRP retained for manual discussion.'
    elif r in sentinel:
        code = sentinel[r]
        kind = 'BP'
        hit = catalog[code,kind]
        price,page=hit['price'],hit['page']
        reason = 'Sentinel 321 model family and colour matched to full catalog reference; packaging name retained.'
    elif (code,kind) in catalog:
        hit = catalog[code,kind]
        price,page=hit['price'],hit['page']
        reason = 'Exact model reference and pen type; finish checked against catalog.'
        if r == 135: reason += ' Large decrease: Busy has 15995; catalog 9372 RB is 6995 (same product also appears on row 136).'
    elif code in {k[0] for k in catalog} and not kind:
        reason = 'Model found, but pen type or gift-set contents are not specified.'
    else:
        reason = 'No matching exact product price in supplied catalog.'
    warning = ''
    if sku and duplicates[sku] > 1:
        warning = 'Item code reused in Busy rows: ' + ', '.join(str(i) for i in range(2,219) if str(sheet.cell(i,1).value or '').strip()==sku)
    if not sku: warning = 'Missing Item Code; display stand.'
    status = 'Unresolved - original MRP retained' if price is None else ('Updated' if old != price else 'Already current')
    category = ('Catalog confirmed' if price is not None else
                'Description conflict' if r in exceptions else
                'Deferred pen bundle' if bundle and (kinds or 'GIFT SET' in name) else
                'Not priced in catalog')
    rows.append(dict(row=r,sku=sku,name=name,old=old,new=price if price is not None else old,
                     status=status,category=category,model=code,kind=kind,page=page,reason=reason,warning=warning,
                     supporting_title=supporting_title))

data = dict(source=str(SOURCE),website_reference=str(website_source),sheet=sheet.title,rows=rows,catalog=[dict(model=k[0],kind=k[1],**v) for k,v in catalog.items()])
(ROOT/'matches.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
review = Path(r'C:\Users\My-PC-Win10\Downloads\SHEAFFER MRP - Rechecked Review Report.csv')
with review.open('w',newline='',encoding='utf-8-sig') as f:
    writer = csv.writer(f)
    writer.writerow(['Excel Row','Item Code','Busy Name (unchanged)','Original MRP','Final MRP','Status','Category','Catalog Model','Pen Type','PDF Page','Match or Review Reason','Item Code Warning'])
    for x in rows: writer.writerow([x[k] for k in ('row','sku','name','old','new','status','category','model','kind','page','reason','warning')])
print(json.dumps(dict(counts=dict(collections.Counter(x['status'] for x in rows)),categories=dict(collections.Counter(x['category'] for x in rows)),products=len(rows)),indent=2))

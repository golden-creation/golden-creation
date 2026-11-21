import json
import re
import hashlib
from collections import Counter
from pathlib import Path
import openpyxl

ROOT=Path(__file__).parent
data=json.loads((ROOT.parent/'matches.json').read_text())
current_path=Path(r'C:\Users\My-PC-Win10\Downloads\SHEAFFER LIST - MRP Rechecked.xlsx')
original_path=Path(data['source'])
current=openpyxl.load_workbook(current_path).active
original=openpyxl.load_workbook(original_path).active
catalog={(x['model'],x['kind']):x for x in data['catalog']}
records=[]

for x in data['rows']:
    r=x['row']; name=x['name']; sku=x['sku']; model=x['model']
    assert current.cell(r,2).value==name==original.cell(r,2).value
    assert float(str(current.cell(r,3).value).replace(',',''))==x['new']
    assert float(str(original.cell(r,3).value).replace(',',''))==x['old']
    issue=x['category']; reason=x['reason']; action='No price action required.'
    page=str(x['page']) if x['page'] else ''
    detail=[]
    for kind in ('FP','RB','BP'):
        if (model,kind) in catalog:
            entry=catalog[model,kind]
            detail.append(f"{kind} {entry['price']:,}")
    single='; '.join(detail)
    if single: single += ' (single pens only)'
    priority=5
    is_review=x['status'].startswith('Unresolved')

    if model in ('9108','9110','9111'):
        composition=('fountain pen + ink bottle' if 'INK' in name else
                     'fountain pen + ballpoint' if 'FP' in name else 'rollerball + ballpoint')
        issue='ICON bundle vs single pen'
        reason=f'Model {model} matches. Busy and website name describe {composition}. Catalog page 2 prices FP, RB and BP individually; it gives no exact price for this bundle.'
        action='Confirm physical contents and whether the name is correct. Obtain the exact bundle MRP. Do not use one pen price or sum pen MRPs.'
        page='2'; priority=0
    elif x['category']=='Description conflict':
        issue='Colour/trim conflict'; priority=1
        if r in (153,157):
            colour='purple' if r==153 else 'violet'
            reason=f'Busy says model 9403, {colour}. Catalog page 7 identifies 9403 as metallic red. The website also says {colour}; it does not resolve the conflict.'
            action='Check the physical pen/model reference. Obtain the correct colour MRP; do not apply red pricing solely from code 9403.'
            page='7'
        else:
            reason='Busy and website say 9475 BLACK CT (chrome trim). Catalog 9475 has a black body, chrome cap and gold-tone trim. Existing 7500 equals catalog FP price, but finish is not confirmed.'
            action='Confirm whether CT means chrome cap or chrome trim. Match the actual pen finish before approving the MRP.'
            page='2'
    elif x['category']=='Deferred pen bundle':
        issue='Bundle deferred'; priority=2
        if re.search(r'(?:FP|RB)\s*&\s*BP',name):
            composition='fountain pen + ballpoint' if 'FP' in name else 'rollerball + ballpoint'
            p=next((v['page'] for (m,k),v in catalog.items() if m==model),'')
            page=str(p)
            reason=f'Busy describes {composition}. Catalog lists model {model} as individual pens, with no exact two-pen set MRP.'
            action='Verify both pen contents and request the brand set MRP. Do not use or add the individual pen prices.'
        elif r in (84,88):
            page='4; 9-10'
            reason=f'Busy says GIFT SET for {model} but omits its contents and pen type. Website specifies a ballpoint yet still calls it a gift set. Catalog single-BP price cannot establish unknown set pricing.'
            action='Confirm single gift-boxed pen versus a pen/accessory bundle. Use the exact corresponding product price after confirmation.'
        elif 'NB' in name:
            page='9-10' if r not in (191,192) else '7; 9-10'
            if r==171:
                reason='Busy is 9428 coffee ballpoint + notebook. Page 10 shows this model with a small notebook, starting at 3495. Notebook size/material and exact gift-set reference need confirmation; pages 9-11 are deferred.'
            elif r==192:
                reason='Busy is EIP 321 matte pink ballpoint + notebook. The catalog has standard Sentinel colours and other pen/notebook sets, not this EIP combination.'
            else:
                reason=f'Busy includes NB (notebook) with model {model}. Pages 9-10 describe several notebook sizes and pen variants with starting prices; they do not establish this exact bundle MRP.'
            action='Match pen model/type plus notebook size and cover. Confirm the exact gift-set reference and MRP during the deferred manual discussion.'
        elif 'CCH' in name:
            page='9-10'
            if r==169:
                reason='Busy is 9428 coffee ballpoint + CCH (credit card holder). Page 10 shows 9428 with a genuine-leather credit card holder, starting at 4995. Exact set reference/material must be confirmed; pages 9-11 are deferred.'
            else:
                reason=f'Busy includes CCH (credit card holder) with model {model or "EIP 321"}. Catalog pages 9-10 show selected models/accessories and starting prices, not a confirmed exact MRP for this entry.'
            action='Check the pen model and credit-card-holder material/reference. Request exact set pricing during manual review.'
        elif 'BCH' in name:
            page='9'
            reason=f'Busy includes BCH (business card holder), model {model}. Page 9 illustrates a 9317 set starting at 2895 and mentions other variants. That is not an exact price for model {model}.'
            action='Match the actual pen and business-card-holder set reference; obtain exact set MRP.'
        elif 'TC' in name:
            page='9'
            reason=('Busy is 9322 ballpoint + TC (table clock). Page 9 shows 9322 with a clock, starting at 3895; this is not an unqualified exact MRP. Pages 9-11 are deferred.' if r==97 else
                    'Busy is 9342 ballpoint + TC (table clock). Page 9 illustrates 9322 with a clock and mentions other variants. The illustrated starting price is not an exact 9342 set MRP.')
            action='Confirm clock/set reference and brand MRP during the deferred manual discussion.'
        elif '3 INK' in name:
            page='6; 11'
            reason='Busy is 9428 fountain pen + 3 inks. Page 11 shows a 9374 fountain pen with 3 ink vials, which is a different model. Page 6 prices the 9428 pen alone.'
            action='Obtain the exact 9428 three-ink set reference and MRP; do not use the pictured 9374 set price.'
        elif 'INK' in name:
            page='11'
            reason='Busy is 9374 fountain pen + ink. Page 11 shows 9374 with coffee-scented ink, starting at 7295. Busy does not specify the ink type/size. Existing 7295 is retained; pages 9-11 are deferred.'
            action='Confirm bottle type/size and the exact gift-set reference before approving price.'
        elif 'WL' in name:
            page='4; 9-11'
            reason='Busy is 9376 ballpoint + WL accessory. The WL abbreviation and accessory reference are not defined; catalog page 4 prices the single pen, and no exact 9376 + WL set price is shown.'
            action='Confirm what WL means and the physical accessory. Obtain the exact bundle reference and MRP.'
        else:
            page='1-11'
            reason=f'Busy describes a pen bundle ({model or "EIP edition"}); no exact matching bundle price is supplied in the catalog.'
            action='Verify all set contents and obtain the exact brand MRP.'
    elif x['category']=='Not priced in catalog':
        priority=3; page='1-11'; issue='Not priced in catalog'
        if name.startswith('PENNLINE'):
            reason='This is a Pennline item. The supplied catalog is Sheaffer and has no Pennline price.'
            action='Use the current Pennline price list.'
        elif 'CALLIGRAP' in name:
            reason=f'Calligraphy reference {model} is not listed with a price in this catalog.'
            action='Request the current calligraphy pen/kit price for this exact reference.'
        elif 'NB' in name or 'JRNL' in name:
            reason='This is a standalone notebook/journal or display stand. The catalog shows notebooks as pen-set accessories, not individual pricing for this item.'
            action='Request the standalone notebook/journal price list.'
        elif 'POP' in name:
            reason=f'POP model {model} and its pen type are not priced in this catalog.'
            action='Request the latest POP model/type MRP.'
        elif name.startswith('SH EIP'):
            reason='The EIP edition/finish is not priced in the supplied catalog. Standard Sentinel/100 pricing does not confirm EIP pricing.'
            action='Request the EIP edition price list and match the exact finish and pen type.'
        elif 'REFILL' in name or 'INK' in name or 'CONVERTER' in name:
            reason='The catalog contains no standalone MRP for this refill, ink or converter. A pen gift-set price is not an accessory price.'
            action='Use the current accessory price list; match refill type, colour, size and pack quantity.'
        elif 'SUPERBOOK' in name:
            reason='Superbook/power-bank products are not listed with prices in this catalog.'
            action='Obtain the Superbook model/capacity MRP.'
        else:
            reason=f'Model {model} is absent from the supplied catalog price entries.'
            action='Request the exact model price or corrected product reference.'
        if r==70:
            issue='Reference ambiguity'; priority=1; page='2; 7'
            reason='Busy begins with ICON model 9112, absent from page 2, but also contains 32111. Page 7 uses 32111 for a different Sentinel pen. Matching this embedded number would select the wrong model family.'
            action='Confirm the full ICON reference from the pen/box and obtain its MRP. Do not assign Sentinel pricing.'
        if r==218:
            issue='Missing item code'; priority=1
            reason='Notebook display stand has a blank Item Code and zero MRP; no catalog selling price is provided.'
            action='Confirm whether this is a non-sale display item and assign/verify its Busy code before any import.'
    else:
        issue='Matched'; priority=5
        reason=x['reason']
        if x['row'] in (124,125,126):
            reason=f'9347 {x["kind"]} matches page 3. Mrp column is {x["new"]:,}. Old price text in the Busy name is intentionally unchanged.'
        if x['status']=='Updated': action='Catalog MRP already written to the rechecked import file.'
    if r in (184,189):
        issue='Item-code collision'; is_review=True; priority=1; page='2'
        reason='Item code 30965 is reused for two different pens: row 184 = 9471 rollerball (6995), row 189 = 9475 fountain pen (7500). Both MRPs match the catalog, but the shared code can update the wrong product.'
        action='Correct/confirm separate Busy identifiers before importing. Match by product name/alias as well as code. Do not merge these pens.'
    if r==135:
        issue='Large price reduction'; is_review=True; priority=1; page='5'
        reason='9372 rollerball was 15995 in Busy; catalog page 5 explicitly gives 6995. Rechecked file already uses 6995. Row 136, code 12607, has the same model/type and already had 6995.'
        action='Confirm physical model and why two item codes exist. The 9000 reduction has already been applied; no further change in this review.'
    if r in (120,121):
        issue='Matched; repeated code'
        reason='Code 11638 occurs twice for 9346. The website exact-SKU title and explicit BP row identify the ballpoint. Both current MRPs are 3995. Names retained.'
        action='Price aligned; preserve separate rows until accountant confirms whether both Busy records are required.'
    records.append(dict(**x,issue=issue,review_reason=reason,action=action,source_pages=page,single_prices=single,
                        priority=priority,is_review=is_review))

manual=sorted((x for x in records if x['is_review']),key=lambda x:(x['priority'],x['row']))
assert len(records)==217 and len(manual)==115
assert len([r for r in manual if r['issue']=='ICON bundle vs single pen'])==7
assert all(r['source_pages']=='2' for r in manual if r['issue']=='ICON bundle vs single pen')
for r in records:
    if r['is_review']: assert r['review_reason'] and r['action']
output=dict(records=records,manual=manual,counts=dict(Counter(x['issue'] for x in manual)),
            source_hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in (original_path,current_path)})
(ROOT/'review_data.json').write_text(json.dumps(output,indent=2),encoding='utf-8')
print(json.dumps(dict(products=len(records),manual_review=len(manual),issues=output['counts']),indent=2))

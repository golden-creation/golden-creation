import json
import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parent
INPUT_JSON = ROOT / "shop_stock_data.json"
OUTPUT_JSON = ROOT / "shop_stock_matched.json"
WEBSITE_XLSX = Path(r"C:\Users\My-PC-Win10\Downloads\website-products (7).xlsx")
WAREHOUSE_JSON = Path(
    r"D:\lekhanmart-backend-frontend-hostinger\outputs\warehouse_stock_reconciliation_20260816\reconciliation_data.json"
)


BRAND_ALIASES = {
    "PF": ["PLANFIX"],
    "PLANFIX": ["PLANFIX"],
    "SCHNEIDER": ["SCHNEIDER"],
    "SC": ["SCHNEIDER"],
    "SCH": ["SCHOLAR", "SCHNEIDER"],
    "SCHOLAR": ["SCHOLAR"],
    "ST": ["STAEDTLER"],
    "STAEDTLER": ["STAEDTLER"],
    "CML": ["CAMEL", "CAMLIN"],
    "CAMEL": ["CAMEL", "CAMLIN"],
    "CAMLIN": ["CAMEL", "CAMLIN"],
    "FC": ["FABER", "FABER-CASTELL", "FEVICRYL"],
    "FABER": ["FABER", "FABER-CASTELL"],
    "FEVICRYL": ["FEVICRYL"],
    "LU": ["LUXOR"],
    "LV": ["LUXOR"],
    "LUXOR": ["LUXOR"],
    "NG": ["NEELGAGAN"],
    "NEELGAGAN": ["NEELGAGAN"],
    "SOLO": ["SOLO"],
    "KORE": ["KORES"],
    "KORES": ["KORES"],
    "DELI": ["DELI"],
    "DOMS": ["DOMS"],
    "APSARA": ["APSARA"],
    "PENTONIC": ["PENTONIC"],
    "LINC": ["LINC"],
    "UNOMAX": ["UNOMAX"],
    "RANGEELA": ["RANGEELA"],
    "RG": ["RANGEELA"],
    "SHIPRA": ["SHIPRA"],
    "NATARAJ": ["NATARAJ"],
    "AEROTIX": ["AEROTIX"],
    "NIKITA": ["NIKITA"],
    "DURO": ["DURO"],
    "DURACELL": ["DURACELL"],
    "TRIO": ["TRIO"],
    "ADDNET": ["ADDNET"],
}

COLOR_ALIASES = {
    "BK": "BLACK",
    "BLC": "BLACK",
    "BLACK": "BLACK",
    "BLK": "BLACK",
    "BLUE": "BLUE",
    "BL": "BLUE",
    "RD": "RED",
    "RED": "RED",
    "RUS": "RED",
    "GN": "GREEN",
    "GRN": "GREEN",
    "GREEN": "GREEN",
    "GM": "GREEN",
    "PINK": "PINK",
    "PNK": "PINK",
    "ORG": "ORANGE",
    "ORANGE": "ORANGE",
    "YELLOW": "YELLOW",
    "YLW": "YELLOW",
    "CYAN": "CYAN",
    "VIOLET": "VIOLET",
    "PURPLE": "PURPLE",
    "TAN": "TAN",
    "GREY": "GREY",
    "GRAY": "GREY",
    "WHITE": "WHITE",
    "SILVER": "SILVER",
    "GOLD": "GOLD",
}

GENERIC_WORDS = {
    "PC",
    "PCS",
    "PCE",
    "PICT",
    "PKT",
    "BOX",
    "BOXS",
    "BOTTLE",
    "SET",
    "SHD",
    "SHADE",
    "SHADES",
    "MRP",
    "PRICE",
    "N",
    "ML",
    "GM",
    "GSM",
    "MM",
    "A4",
    "A3",
    "A5",
    "A6",
    "B4",
    "B5",
    "B6",
    "BIG",
    "SMALL",
    "MEDIUM",
    "JUNIOR",
}

PAPER_SIZE_CODES = {"A3", "A4", "A5", "A6", "B4", "B5", "B6", "FS"}


def norm(value):
    value = "" if value is None else str(value)
    value = value.upper().replace("&", " AND ")
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def tokens(value):
    return [token for token in norm(value).split() if token]


def code_tokens(value):
    output = []
    value = "" if value is None else str(value).upper()
    value = re.sub(r"[^A-Z0-9-]+", " ", value)
    candidates = re.findall(r"\b[A-Z]{1,8}\d+[A-Z0-9]*(?:-[A-Z0-9]+)?\b|\b\d+[A-Z]{1,8}[A-Z0-9]*(?:-[A-Z0-9]+)?\b|\b\d{3,6}(?:-[A-Z0-9]+)?\b", value)
    for token in candidates:
        token = token.strip("-")
        if token in GENERIC_WORDS:
            continue
        if token in PAPER_SIZE_CODES:
            continue
        if re.fullmatch(r"\d{1,3}(N|SHD|ML|GM|GSM|MM|PC|PCS|PAGE|PG|PAGES)", token):
            continue
        if re.fullmatch(r"[ABC]\d", token):
            continue
        if re.fullmatch(r"\d{1,2}[A-Z]", token):
            continue
        has_digit = any(ch.isdigit() for ch in token)
        has_alpha = any(ch.isalpha() for ch in token)
        if has_digit and (len(token) >= 3 or has_alpha):
            output.append(token)
    return output


def color_terms(value):
    found = []
    for token in tokens(value):
        color = COLOR_ALIASES.get(token)
        if color and color not in found:
            found.append(color)
    return found


def strong_code(code):
    digit_count = sum(ch.isdigit() for ch in code)
    if "-" in code:
        return True
    if digit_count >= 3:
        return True
    if re.fullmatch(r"(TB|SB|WP|C|M|G|HB)\d+[A-Z]?", code):
        return False
    if re.fullmatch(r"[A-Z]{2,}\d+[A-Z0-9]*", code):
        return True
    return False


def detected_aliases(value):
    found = []
    toks = tokens(value)
    for token in toks:
        if token in BRAND_ALIASES and token not in found:
            found.append(token)
    if "SCHNEIDER" in toks and "SCH" in found:
        found.remove("SCH")
    return found


def website_rows():
    wb = openpyxl.load_workbook(WEBSITE_XLSX, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    headers = [cell.value for cell in next(ws.iter_rows(max_row=1))]
    idx = {name: pos for pos, name in enumerate(headers)}
    rows = []
    for excel_row, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        handle = str(row[idx.get("Handle")] or "").strip()
        title = str(row[idx.get("Title")] or "").strip()
        variant_sku = str(row[idx.get("Variant SKU")] or "").strip()
        sku = variant_sku or handle
        if not title and not sku:
            continue
        brand = str(row[idx.get("Brand")] or "").strip()
        category = str(row[idx.get("Product Category")] or row[idx.get("Type")] or "").strip()
        option_values = " ".join(
            str(row[idx[name]] or "").strip()
            for name in ("Option1 Value", "Option2 Value", "Option3 Value")
            if name in idx
        )
        price = row[idx.get("Variant Price")] if "Variant Price" in idx else ""
        searchable = " ".join([sku, handle, title, brand, category, option_values])
        rows.append(
            {
                "row": excel_row,
                "sku": sku,
                "handle": handle,
                "title": title,
                "brand": brand,
                "category": category,
                "price": "" if price is None else str(price),
                "options": option_values,
                "norm": norm(searchable),
                "title_norm": norm(title),
                "tokens": set(tokens(searchable)),
                "codes": set(code_tokens(" ".join([sku, handle, title, option_values]))),
                "colors": set(color_terms(" ".join([title, option_values]))),
            }
        )
    return rows


def alias_compatible(alias, candidate):
    wanted = BRAND_ALIASES.get(alias, [])
    candidate_text = norm(" ".join([candidate["brand"], candidate["title"], candidate["category"]]))
    return any(brand in candidate_text for brand in wanted)


def candidate_score(row, candidate):
    name = row.get("Transcribed Product Name") or row.get("Raw Handwritten Text") or ""
    row_norm = norm(name)
    row_tokens = set(tokens(name))
    row_codes = set(code_tokens(name))
    aliases = detected_aliases(name)
    row_colors = set(color_terms(name))
    score = 0.0

    if row_tokens and candidate["tokens"]:
        score += 25 * (len(row_tokens & candidate["tokens"]) / len(row_tokens | candidate["tokens"]))
    score += 25 * SequenceMatcher(None, row_norm, candidate["title_norm"]).ratio()

    brand_hit = False
    for alias in aliases:
        if alias_compatible(alias, candidate):
            brand_hit = True
            score += 24
            break
    if aliases and not brand_hit:
        score -= 12

    code_hits = row_codes & candidate["codes"]
    numeric_hits = {
        code
        for code in row_codes
        if code.isdigit() and re.search(rf"(?<!\d){re.escape(code)}(?!\d)", candidate["norm"])
    }
    code_hits |= numeric_hits
    if code_hits:
        score += min(36, 18 + 8 * len(code_hits))
    elif row_codes:
        score -= min(10, 2 * len(row_codes))

    if row_colors:
        if row_colors & candidate["colors"]:
            score += 10
        elif candidate["colors"]:
            score -= 3

    row_price = str(row.get("Read MRP/Price") or "").strip()
    if row_price and row_price.replace(".", "", 1).isdigit():
        cand_price = str(candidate.get("price") or "").strip()
        if cand_price and cand_price.replace(".", "", 1).isdigit():
            try:
                if abs(float(row_price) - float(cand_price)) < 0.01:
                    score += 8
            except ValueError:
                pass

    return round(score, 1), sorted(code_hits), brand_hit


def classify(row, top, second):
    name = row.get("Transcribed Product Name") or row.get("Raw Handwritten Text") or ""
    confidence = str(row.get("Transcription Confidence") or "").lower()
    row_codes = set(code_tokens(name))
    aliases = detected_aliases(name)
    row_colors = set(color_terms(name))
    score = top["score"] if top else 0
    gap = round(score - (second["score"] if second else 0), 1)
    code_hit = bool(top and top["code_hits"])
    strong_code_hit = bool(top and any(strong_code(code) for code in top["code_hits"]))
    brand_hit = bool(top and top["brand_hit"])

    if not top:
        return "Needs Review", "", "No website candidate", "", gap

    listing_issue = ""
    if row_colors and not (row_colors & set(top["record"]["colors"])):
        listing_issue = "Yes - physical colour/variant not explicit in website listing"
    unmatched_codes = row_codes - set(top["code_hits"])
    if code_hit and unmatched_codes:
        issue = f"Yes - handwritten model/pack code not exact on website listing: {', '.join(sorted(unmatched_codes))}"
        listing_issue = f"{listing_issue}; {issue}" if listing_issue else issue

    if confidence == "low":
        return "Needs Review", listing_issue, "Low transcription confidence", "", gap

    if aliases and row_codes and code_hit and strong_code_hit and brand_hit and score >= 55:
        status = "Matched - Variant Review" if listing_issue else "Matched"
        return status, listing_issue, "Exact brand/code match", top["record"]["sku"], gap

    if row_codes and code_hit and strong_code_hit and score >= 68 and gap >= 5:
        status = "Matched - Variant Review" if listing_issue else "Matched"
        return status, listing_issue, "Exact code match", top["record"]["sku"], gap

    if score >= 78 and gap >= 10:
        status = "Matched - Variant Review" if listing_issue else "Matched"
        return status, listing_issue, "Strong fuzzy match", top["record"]["sku"], gap

    if score >= 55:
        return "Needs Review", listing_issue, "Possible website match, verify manually", "", gap

    return "Needs Review", listing_issue, "No confident website match", "", gap


def improve():
    source = json.loads(INPUT_JSON.read_text(encoding="utf-8"))
    web = website_rows()
    improved = []

    for row in source["all_rows"]:
        name = row.get("Transcribed Product Name") or row.get("Raw Handwritten Text") or ""
        aliases = detected_aliases(name)
        candidates = []
        pool = web
        if aliases:
            narrowed = [record for record in web if any(alias_compatible(alias, record) for alias in aliases)]
            if narrowed:
                pool = narrowed
        for record in pool:
            score, code_hits, brand_hit = candidate_score(row, record)
            if score >= 20:
                candidates.append(
                    {
                        "score": score,
                        "code_hits": code_hits,
                        "brand_hit": brand_hit,
                        "record": record,
                    }
                )
        candidates.sort(key=lambda item: item["score"], reverse=True)
        top = candidates[0] if candidates else None
        second = candidates[1] if len(candidates) > 1 else None
        status, listing_issue, reason, sku, gap = classify(row, top, second)

        row_out = dict(row)
        row_out["Corrected Website Product Name"] = top["record"]["title"] if sku and top else ""
        row_out["SKU"] = sku
        row_out["Suggested SKU"] = top["record"]["sku"] if top else ""
        row_out["Suggested Website Product Name"] = top["record"]["title"] if top else ""
        row_out["Suggested Brand"] = top["record"]["brand"] if top else ""
        row_out["Suggested Category"] = top["record"]["category"] if top else ""
        row_out["Suggested Website Price"] = top["record"]["price"] if top else ""
        row_out["Match Status"] = status
        row_out["Listing Issue Flag"] = listing_issue
        row_out["Variant Terms"] = ", ".join(color_terms(name))
        row_out["Match Score"] = top["score"] if top else 0
        row_out["Score Gap"] = gap
        row_out["Match Reason"] = reason
        row_out["Matched Code Tokens"] = ", ".join(top["code_hits"]) if top else ""
        row_out["Candidates"] = " || ".join(
            f"{item['score']} | {item['record']['sku']} | {item['record']['title']} | MRP {item['record']['price']}"
            for item in candidates[:5]
        )
        improved.append(row_out)

    status_counts = Counter(row["Match Status"] for row in improved)
    confidence_counts = Counter(row["Transcription Confidence"] for row in improved)
    image_counts = Counter(row["Source Image"] for row in improved)
    summary = [
        ["Source images", len(image_counts)],
        ["Transcribed rows", len(improved)],
        ["Matched rows with SKU", status_counts.get("Matched", 0)],
        ["Matched rows requiring variant/listing review", status_counts.get("Matched - Variant Review", 0)],
        ["Needs review rows", status_counts.get("Needs Review", 0)],
        ["Rows with high confidence transcription", confidence_counts.get("high", 0)],
        ["Rows with medium confidence transcription", confidence_counts.get("medium", 0)],
        ["Rows with low confidence transcription", confidence_counts.get("low", 0)],
        ["Website reference file", str(WEBSITE_XLSX)],
        ["Prior warehouse reconciliation reference", str(WAREHOUSE_JSON)],
        [
            "Rule",
            "SKU is populated only for defensible matches. Rows with physical colour/variant not explicit on the website are flagged as Matched - Variant Review.",
        ],
        [
            "Quantity rule",
            "Original handwritten count is preserved. Normalized Shop Qty calculates simple additions and clear multipliers like Box x10.",
        ],
    ]
    for status, count in status_counts.most_common():
        summary.append([f"Status: {status}", count])

    image_summary = [
        {
            "Source Image": image,
            "Rows Transcribed": count,
            "Matched": sum(1 for row in improved if row["Source Image"] == image and row["Match Status"] == "Matched"),
            "Variant Review": sum(
                1 for row in improved if row["Source Image"] == image and row["Match Status"] == "Matched - Variant Review"
            ),
            "Needs Review": sum(1 for row in improved if row["Source Image"] == image and row["Match Status"] == "Needs Review"),
        }
        for image, count in sorted(image_counts.items())
    ]

    payload = {
        "summary": summary,
        "all_rows": improved,
        "matched": [row for row in improved if row["Match Status"] == "Matched"],
        "variant_review": [row for row in improved if row["Match Status"] == "Matched - Variant Review"],
        "review": [row for row in improved if row["Match Status"] == "Needs Review"],
        "image_summary": image_summary,
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")
    print(dict(status_counts))


if __name__ == "__main__":
    improve()

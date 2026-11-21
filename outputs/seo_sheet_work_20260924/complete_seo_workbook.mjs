import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("source.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);
const projectSheets = JSON.parse(await fs.readFile("project_products_next_10.json", "utf8"));

const existingSheetsThroughCamlin = [
  "3M Products",
  "Addgel Products",
  "Adnet Products",
  "Adwell Products",
  "Artzilla Products",
  "Baoke Products",
  "Belkin Products",
  "Bell Products",
  "Boya Products",
  "Brustro Products",
  "Camlin Products",
];

const sourceRows = [
  ["SEO guidance", "Unique, clear product titles and concise product-page summaries.", "https://developers.google.com/search/docs/fundamentals/seo-starter-guide"],
  ["SEO guidance", "Product pages can use product structured data for richer Search results.", "https://developers.google.com/search/docs/appearance/structured-data/product"],
  ["SEO guidance", "Product snippet documentation confirms description, SKU, brand, review and offer fields matter for product results.", "https://developers.google.com/search/docs/appearance/structured-data/product-snippet"],
  ["Store context", "Golden Creation / Lekhanmart stationery and product-category context.", "https://lekhanmart.com/"],
  ["3M / Post-it", "Adhesive hooks, tapes, page markers and sticky notes terminology.", "https://www.post-it.com/"],
  ["Casio", "Calculator and clock terminology for Casio India products.", "https://www.casio.com/in/products/"],
  ["Kokuyo Camlin", "Camlin/Camel art, stationery, colour pencil, marker and drawing material terminology.", "https://www.kokuyocamlin.com/camel/drawing-materials"],
  ["Brustro", "Art supplies, brush pens, watercolour pencil and creative-material terminology.", "https://brustro.in/"],
  ["Cello", "Cello consumer products and writing-instrument context.", "https://celloworld.com/"],
  ["Cross", "Ballpoint, rollerball, fountain pen and premium writing instrument terminology.", "https://cross.com/collections/writing-instruments"],
  ["Deli", "Office stationery, school stationery, writing instruments and markers terminology.", "https://www.deliworld.com/product/"],
  ["Duracell", "Battery, coin cell and rechargeable battery terminology.", "https://www.duracell.in/"],
  ["Epson", "Epson ink bottle and printer terminology.", "https://www.epson.co.in/"],
  ["Project exports", "Next 10 category product titles, brands, categories and source tags extracted from Golden Creation project product export workbooks.", "Golden Creation project product exports"],
];

const colorWords = new Set([
  "BLACK", "BLUE", "GREEN", "RED", "PINK", "YELLOW", "ORANGE", "LIME", "GREY", "GRAY",
  "WHITE", "CREAM", "GOLD", "SILVER", "CHROME", "BROWN", "NEON", "MULTI", "MULTICOLOR",
  "MAGENTA", "CYAN", "VIOLET", "PURPLE", "ASSORTED", "TRANSPARENT", "METALLIC",
]);

const acronyms = new Set([
  "USB", "LED", "BT", "TWS", "AA", "AAA", "A3", "A4", "A5", "A6", "A7", "B5", "B6",
  "GSM", "ML", "MM", "PCS", "PC", "LCD", "HDMI", "UPS", "CR2016", "CR2025", "CR2032",
  "FX", "EX", "MS", "MJ", "MZ", "IQ", "VC", "PL", "SA", "DF", "DFX", "XL", "SD", "TF", "MAH", "WIFI", "WI-FI", "INK",
]);

function normalizeTitle(raw) {
  return String(raw ?? "")
    .replace(/\bCOLOUM\b/gi, "COLOR")
    .replace(/\bCOLOUR\b/gi, "COLOR")
    .replace(/\bBOTTEL\b/gi, "BOTTLE")
    .replace(/\bADAPTOR\b/gi, "ADAPTER")
    .replace(/\bWITH OUT\b/gi, "WITHOUT")
    .replace(/\bNOTE BOOK\b/gi, "NOTEBOOK")
    .replace(/\bBALL POINT\b/gi, "BALLPOINT")
    .replace(/\bHI-LITER\b/gi, "HIGHLIGHTER")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(raw) {
  const small = new Set(["and", "or", "for", "with", "without", "in", "on", "of", "to"]);
  return normalizeTitle(raw)
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      const compact = word.replace(/[^a-z0-9]/gi, "").toUpperCase();
      if (/^\d/.test(word) || acronyms.has(compact)) return word.toUpperCase();
      if (index > 0 && small.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\bUsb\b/g, "USB")
    .replace(/\bGsm\b/g, "GSM")
    .replace(/\bMah\b/g, "mAh");
}

function extractAttributes(title) {
  const t = normalizeTitle(title).toUpperCase();
  const attrs = [];
  const matches = t.match(/\b(A[0-7]|B[0-7]|\d+(?:\.\d+)?\s?X\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?MM|\d+(?:\.\d+)?ML|\d+GSM|\d+PCS|\d+N|\d+SHEETS?|\d+MAH|\d+W|\d+FT|CR20\d{2})\b/g) || [];
  attrs.push(...matches.map((x) => x.replace(/\s+/g, "")));
  for (const word of t.split(/[^A-Z0-9.-]+/)) {
    if (colorWords.has(word)) attrs.push(word);
  }
  return [...new Set(attrs)].slice(0, 5);
}

function detectType(title, category = "") {
  const t = normalizeTitle(title).toUpperCase();
  const c = String(category).toUpperCase();
  if (t.includes("HOOK")) return "adhesive hook";
  if (t.includes("DOUBLE TAPE")) return "double sided tape";
  if (t.includes("SCOTCH") || t.includes("TAPE")) return "tape";
  if (t.includes("PAGE MARKER") || t.includes("FILM INDEX")) return "page marker";
  if (t.includes("POST-IT") || t.includes("POST IT") || t.includes("STICKY NOTE")) return t.includes("FLAGS") || t.includes("INDEX") ? "sticky flag" : "sticky note";
  if (t.includes("HIGHLIGHTER")) return "highlighter";
  if (t.includes("WHITEBOARD")) return "whiteboard marker";
  if (t.includes("PERMANENT MARKER")) return "permanent marker";
  if (t.includes("BRUSH MARKER") || t.includes("BRUSH PEN")) return "brush marker";
  if (t.includes("SKETCH PEN") || t.includes("SKETCH MARKER")) return "sketch marker";
  if (t.includes("MARKER")) return "marker";
  if (t.includes("REFILL") || t.includes("CARTRIDGE")) return "refill";
  if (t.includes("CALLIGRAPHY")) return "calligraphy set";
  if (t.includes("ROLLER")) return "rollerball pen";
  if (t.includes("FOUNTAIN")) return "fountain pen";
  if (t.includes("GEL") && t.includes("PEN")) return "gel pen";
  if (t.includes("BALLPOINT") || t.includes("BALL PEN")) return "ball pen";
  if (t.includes("PENCIL COLOUR") || t.includes("PENCIL COLOR") || t.includes("COLORED PENCIL") || t.includes("COLOURED PENCIL")) return "colour pencil";
  if (t.includes("PENCIL")) return "pencil";
  if (t.includes("CRAYON")) return "crayon";
  if (t.includes("PASTEL")) return "pastel";
  if (t.includes("WATER COLOUR") || t.includes("WATER COLOR") || t.includes("WATERCOLOUR") || t.includes("WATERCOLOR")) return "watercolour";
  if (t.includes("ACRYLIC")) return "acrylic colour";
  if (t.includes("PAINT")) return "paint";
  if (t.includes("INK BOTTLE") || t.includes("INK BOTTLE")) return "ink bottle";
  if (t.includes("SKETCH NOTEBOOK")) return "sketch notebook";
  if (t.includes("NOTEBOOK")) return "notebook";
  if (t.includes("ENVELOPE")) return "envelope";
  if (t.includes("LETTER PAPER") || t.includes("PAPER REAM") || c.includes("PAPER")) return "paper";
  if (t.includes("BOARD")) return "art board";
  if (t.includes("CLEAN & SHINE")) return "screen cleaning gel";
  if (t.includes("MOUSE PAD")) return "mouse pad";
  if (t.includes("WIRELESS MOUSE")) return "wireless mouse";
  if (t.includes("OPTICAL MOUSE")) return "optical mouse";
  if (t.includes("SOCKET")) return "socket extension";
  if (t.includes("SPEAKER")) return "speaker";
  if (t.includes("HEADPHONE")) return "headphone";
  if (t.includes("EARBUD") || t.includes("POWERBUD")) return "wireless earbuds";
  if (t.includes("NECKBAND")) return "Bluetooth neckband";
  if (t.includes("RING LIGHT")) return "ring light";
  if (t.includes("LIGHT STAND")) return "light stand";
  if (t.includes("CALCULATOR")) return "calculator";
  if (t.includes("CLOCK")) return "wall clock";
  if (t.includes("BATTERY") || t.includes("CELL") || t.includes("POWER CELL")) return "battery";
  if (t.includes("PRINTER")) return "printer";
  if (t.includes("FLASK") || t.includes("BOTTLE")) return "bottle";
  if (t.includes("WALLET")) return "gift set";
  if (t.includes("ERASER")) return "eraser";
  if (t.includes("SHARPENER")) return "sharpener";
  if (t.includes("RULER")) return "ruler";
  if (t.includes("CLIP") || t.includes("BINDER")) return "office clip";
  if (c.includes("ROLLERBALL")) return "rollerball pen";
  if (c.includes("FOUNTAIN")) return "fountain pen";
  if (c.includes("HIGHLIGHTER")) return "highlighter";
  if (c.includes("BATTER")) return "battery";
  if (c.includes("COMPUTER")) return "computer accessory";
  if (c.includes("ART")) return "art supply";
  return String(category || "stationery product").toLowerCase();
}

function useCase(type, category = "") {
  const c = String(category).toLowerCase();
  if (["adhesive hook", "double sided tape", "tape"].includes(type)) return "office, home, school, packing, and craft use";
  if (["sticky note", "sticky flag", "page marker"].includes(type)) return "notes, reminders, document marking, and planning";
  if (["highlighter", "whiteboard marker", "permanent marker", "brush marker", "sketch marker", "marker"].includes(type)) return "school, office, classroom, labeling, and creative work";
  if (["gel pen", "ball pen", "rollerball pen", "fountain pen", "pencil", "refill", "eraser", "sharpener", "ruler"].includes(type)) return "school, office, exam, journaling, and everyday writing";
  if (["colour pencil", "crayon", "pastel", "watercolour", "acrylic colour", "paint", "art board", "art supply"].includes(type)) return "drawing, colouring, school projects, hobby art, and creative work";
  if (["calculator", "wall clock"].includes(type)) return "school, office, desk, classroom, and business use";
  if (["battery", "ink bottle", "printer"].includes(type)) return "office, home, study, device, and business use";
  if (["headphone", "wireless earbuds", "Bluetooth neckband", "speaker", "ring light", "light stand", "computer accessory"].includes(type)) return "work, study, content creation, desk setups, and travel";
  if (["notebook", "sketch notebook", "paper", "envelope"].includes(type)) return "notes, journaling, printing, invitations, study, and creative projects";
  if (c.includes("gift")) return "gifting, executive use, office rewards, and personal writing";
  return "school, office, home, and creative use";
}

function article(type) {
  return /^[aeiou]/i.test(type) ? "an" : "a";
}

function shorten(text, max = 165) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const last = cut.lastIndexOf(" ");
  return `${cut.slice(0, last > 80 ? last : max - 1).trimEnd()}.`;
}

function firstUsefulSentence(body) {
  const text = String(body || "")
    .replace(/\bDescription\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  if (sentence.length > 95) return "";
  return sentence.replace(/[.!?]$/, "");
}

function compactProductTitle(title, max = 54) {
  const clean = titleCase(title);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const last = cut.lastIndexOf(" ");
  return `${cut.slice(0, last > 28 ? last : max - 1).trimEnd()}...`;
}

function seoTitle(row) {
  return `Buy ${compactProductTitle(row.title, 46)} Online | Golden Creation`;
}

function makeDescription(row) {
  const product = titleCase(row.title);
  const type = detectType(row.title, row.category);
  const use = useCase(type, row.category);
  const feature = firstUsefulSentence(row.body);
  let base = `${product} is ${article(type)} ${type} for ${use}.`;
  if (feature && !base.toLowerCase().includes(feature.toLowerCase().slice(0, 25))) {
    base = `${product} ${type} for ${use}. ${feature}.`;
  }
  return shorten(`${base} Buy online from Golden Creation.`, 165);
}

function makeKeywords(row) {
  const title = titleCase(row.title).toLowerCase();
  const brand = titleCase(row.brand || "").toLowerCase();
  const category = String(row.category || "").toLowerCase();
  const type = detectType(row.title, row.category);
  const attrs = extractAttributes(row.title).map((x) => x.toLowerCase());
  const sourceTags = String(row.sourceTags || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const keywords = [
    title,
    `${brand} ${type}`.trim(),
    `${type} online`,
    `buy ${type} online`,
    category ? `${category} online` : "",
    `${brand} products online`.trim(),
    "stationery online India",
    "Golden Creation stationery",
    ...attrs.map((attr) => `${type} ${attr}`),
    ...sourceTags.slice(0, 3),
  ];
  return [...new Set(keywords.filter(Boolean))].slice(0, 12).join(", ");
}

function makeTags(row) {
  const type = detectType(row.title, row.category);
  const attrs = extractAttributes(row.title).map(titleCase);
  const sourceTags = String(row.sourceTags || "")
    .split(",")
    .map((x) => titleCase(x.trim()))
    .filter(Boolean);
  return [...new Set([
    titleCase(row.brand || ""),
    titleCase(row.category || ""),
    titleCase(type),
    ...attrs,
    ...sourceTags.slice(0, 4),
    "Online Stationery",
  ].filter(Boolean))].join(", ");
}

function makeImageStatus(row) {
  const product = titleCase(row.title);
  const type = detectType(row.title, row.category);
  return shorten(`Alt text ready: ${product} - ${type} for ${useCase(type, row.category)}.`, 150);
}

function rowFromExisting(values, idx) {
  const row = values[idx];
  return {
    handle: row[0],
    title: row[1],
    body: row[2],
    brand: row[6],
    category: row[7],
    sourceTags: row[5],
  };
}

function applySheetFormatting(sheet, rowCount) {
  sheet.getRange("A1:I1").format = {
    fill: "#174EA6",
    font: { bold: true, color: "#FFFFFF", name: "Arial", size: 10 },
    verticalAlignment: "center",
    horizontalAlignment: "center",
  };
  sheet.getRange("A1:I1").format.rowHeightPx = 28;
  sheet.getRangeByIndexes(1, 0, Math.max(rowCount, 1), 9).format = {
    font: { name: "Arial", size: 10 },
    wrapText: true,
    verticalAlignment: "top",
  };
  sheet.getRangeByIndexes(1, 0, Math.max(rowCount, 1), 9).format.rowHeightPx = 82;
  sheet.getRange("A:A").format.columnWidthPx = 86;
  sheet.getRange("B:B").format.columnWidthPx = 260;
  sheet.getRange("C:C").format.columnWidthPx = 400;
  sheet.getRange("D:D").format.columnWidthPx = 360;
  sheet.getRange("E:E").format.columnWidthPx = 280;
  sheet.getRange("F:F").format.columnWidthPx = 280;
  sheet.getRange("G:G").format.columnWidthPx = 120;
  sheet.getRange("H:H").format.columnWidthPx = 210;
  sheet.getRange("I:I").format.columnWidthPx = 380;
  sheet.freezePanes.freezeRows(1);
}

for (const sheetName of existingSheetsThroughCamlin) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getUsedRange(true).values;
  sheet.getRange("D1").values = [["Keywords"]];
  sheet.getRange("E1").values = [["Submissions"]];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i]?.[0] && values[i]?.[1]) rows.push(rowFromExisting(values, i));
  }
  const seo = rows.map((row) => [
    makeDescription(row),
    makeKeywords(row),
    seoTitle(row),
    makeTags(row),
  ]);
  const image = rows.map((row) => [makeImageStatus(row)]);
  sheet.getRangeByIndexes(1, 2, rows.length, 4).values = seo;
  sheet.getRangeByIndexes(1, 8, rows.length, 1).values = image;
  applySheetFormatting(sheet, rows.length);
}

for (const item of projectSheets) {
  const sheet = workbook.worksheets.add(item.sheetName);
  const headers = [["Handle", "Title", "Description", "Keywords", "Submissions", "Tags", "Brand", "Product Category", "Image SEO Status"]];
  const rows = item.rows.map((row) => [
    row.handle,
    row.title,
    makeDescription(row),
    makeKeywords(row),
    seoTitle(row),
    makeTags(row),
    row.brand,
    row.category,
    makeImageStatus(row),
  ]);
  sheet.getRange("A1:I1").values = headers;
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, 9).values = rows;
  applySheetFormatting(sheet, rows.length);
  try {
    sheet.tables.add(`A1:I${rows.length + 1}`, true, item.sheetName.replace(/[^A-Za-z0-9]/g, "").slice(0, 24) + "Table");
  } catch {
    // Keep the worksheet usable even if table creation is not supported for this imported workbook.
  }
}

let sources;
try {
  sources = workbook.worksheets.getItem("Research Sources");
} catch {
  sources = workbook.worksheets.add("Research Sources");
}
sources.getRange("A1:C1").values = [["Area", "How it was used", "Source URL"]];
sources.getRangeByIndexes(1, 0, sourceRows.length, 3).values = sourceRows;
sources.getRange("A1:C1").format = {
  fill: "#174EA6",
  font: { bold: true, color: "#FFFFFF", name: "Arial", size: 10 },
  verticalAlignment: "center",
};
sources.getRange("A:C").format = {
  font: { name: "Arial", size: 10 },
  wrapText: true,
  verticalAlignment: "top",
};
sources.getRange("A:A").format.columnWidthPx = 190;
sources.getRange("B:B").format.columnWidthPx = 540;
sources.getRange("C:C").format.columnWidthPx = 560;
sources.getRange("A1:C1").format.rowHeightPx = 28;
sources.getRangeByIndexes(1, 0, sourceRows.length, 3).format.rowHeightPx = 52;
sources.freezePanes.freezeRows(1);

workbook.recalculate();

await fs.mkdir("verified", { recursive: true });
for (const sheetName of ["3M Products", "Camlin Products", "Casio Products", "Cello Products", "Cross Products", "Deli Products", "Epson Products"]) {
  const preview = await workbook.render({
    sheetName,
    range: "A1:I12",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(`verified/${sheetName.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_final.png`, new Uint8Array(await preview.arrayBuffer()));
}

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

for (const sheetName of ["3M Products", "Camlin Products", "Casio Products", "Cross Products"]) {
  const check = await workbook.inspect({
    kind: "table",
    sheetId: sheetName,
    range: "A1:I6",
    include: "values,formulas",
    tableMaxRows: 6,
    tableMaxCols: 9,
    tableMaxCellChars: 120,
    maxChars: 6000,
  });
  console.log(check.ndjson);
}

await fs.mkdir("final", { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("final/Lekhanmart SEO - Completed Through Epson.xlsx");

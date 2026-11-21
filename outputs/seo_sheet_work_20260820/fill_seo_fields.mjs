import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("source.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

const targetSheets = [
  "3M Products",
  "Addgel Products",
  "Adnet Products",
  "Adwell Products",
  "Artzilla Products",
  "Baoke Products",
];

const sourceUrls = [
  ["SEO guidance", "Meta descriptions should be short, relevant summaries written for users.", "https://developers.google.com/search/docs/appearance/snippet"],
  ["SEO guidance", "Page titles should be unique, clear, concise, and accurately describe the page.", "https://developers.google.com/search/docs/fundamentals/seo-starter-guide"],
  ["Store context", "Lekhanmart visible categories and retail positioning.", "https://lekhanmart.com/"],
  ["3M hooks", "Command/3M adhesive hooks and damage-free hanging terminology.", "https://www.command.in/3M/en_IN/command-in/"],
  ["3M Post-it", "Post-it sticky notes and page marker product terminology.", "https://www.post-it.com/3M/en_US/p/"],
  ["Addgel", "Addgel writing instruments, markers, and refillable marker terminology.", "https://shop.addpens.com/"],
  ["ADNet", "Mouse pad terms such as smooth surface, control, durable surface, and non-slip backing.", "https://www.flipkart.com/adnet-mouse-pad-01-mousepad/p/itmexnygcz7rgekh"],
  ["Baoke", "Baoke product families include gel pens, ballpoint pens, markers, highlighters, mechanical pencils, and art pens.", "https://m.baokepen.com/en/"],
  ["Notebook/sketchbook", "Sketchbook keyword patterns around A3/A4 size, pages, drawing, sketching, and art practice.", "https://www.matrikas.co.in/drawing-note-book-pad.php"],
  ["Paper/envelopes", "Letter paper and envelope keyword patterns around color paper, printable paper, and stationery paper.", "https://peters-art.de/en/Equipment/Writing-Paper-Envelopes/"],
];

const colorWords = new Set([
  "BLACK", "BLUE", "GREEN", "RED", "PINK", "YELLOW", "ORANGE", "LIME", "PEACE",
  "GREY", "WHITE", "CREAM", "GOLD", "METALLIC", "NEON", "MULTICOLOR", "MULTI",
]);

const stopWords = new Set(["THE", "WITH", "WITHOUT", "AND", "FOR", "IN", "ON", "OF"]);

function normalizeTitle(raw) {
  return String(raw ?? "")
    .replace(/\bCOLOUM\b/g, "COLOR")
    .replace(/\bCOLOUR\b/g, "COLOR")
    .replace(/\bWITH OUT\b/g, "WITHOUT")
    .replace(/\bNOTE BOOK\b/g, "NOTEBOOK")
    .replace(/\bADAPTOR\b/g, "ADAPTER")
    .replace(/\b07\.MM\b/g, "0.7MM")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(raw) {
  const small = new Set(["and", "or", "for", "with", "without", "in", "on", "of", "to"]);
  return normalizeTitle(raw)
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (/^\d/.test(word) || /^[a-z]{1,3}-?\d/.test(word)) return word.toUpperCase();
      if (index > 0 && small.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\bUsb\b/g, "USB")
    .replace(/\bA3\b/g, "A3")
    .replace(/\bA4\b/g, "A4")
    .replace(/\bA5\b/g, "A5")
    .replace(/\bA6\b/g, "A6")
    .replace(/\bA7\b/g, "A7")
    .replace(/\b2b\b/gi, "2B")
    .replace(/\bGsm\b/g, "GSM");
}

function detectProductType(title, category) {
  const t = normalizeTitle(title);
  if (t.includes("HOOK")) return "adhesive hook";
  if (t.includes("DOUBLE TAPE")) return "double sided tape";
  if (t.includes("SCOTCH TAPE")) return "Scotch tape";
  if (t.includes("PAGE MARKER")) return "page markers";
  if (t.includes("POST-IT") || t.includes("POST IT")) return t.includes("FLAGS") ? "sticky flags" : "sticky notes";
  if (t.includes("HI-LITER") || t.includes("HIGHLIGHTER")) return "highlighter marker";
  if (t.includes("WHITEBOARD") || t.includes("WHITE BOARD")) return "whiteboard marker";
  if (t.includes("PERMANENT")) return "permanent marker";
  if (t.includes("MARKER")) return "marker";
  if (t.includes("REFILL")) return "pen refill";
  if (t.includes("CALLIGRAPHY")) return "calligraphy set";
  if (t.includes("ROLLER")) return "roller ball pen";
  if (t.includes("BALL PEN") || t.includes("BALL POINT")) return "ball pen";
  if (t.includes("BRUSH MARKER") || t.includes("BRUSH PEN")) return "brush marker";
  if (t.includes("LEAD")) return "pencil lead";
  if (t.includes("ERASER")) return "eraser";
  if (t.includes("PEN")) return "pen";
  if (t.includes("SKETCH NOTEBOOK")) return "sketch notebook";
  if (t.includes("NOTEBOOK")) return "notebook";
  if (t.includes("ENVELOPE")) return "color envelope";
  if (t.includes("LETTER PAPER")) return "letter paper";
  if (t.includes("WATERCOLOR")) return "watercolor board";
  if (t.includes("CLEAN & SHINE")) return "screen cleaning gel";
  if (t.includes("MOUSE PAD")) return "mouse pad";
  if (t.includes("WIRELESS MOUSE")) return "wireless mouse";
  if (t.includes("OPTICAL MOUSE")) return "optical mouse";
  if (t.includes("SOCKET")) return "socket extension";
  if (t.includes("SPEAKER")) return "multimedia speaker";
  return String(category || "stationery product").toLowerCase();
}

function detectUse(type, category) {
  if (["adhesive hook", "double sided tape", "Scotch tape"].includes(type)) return "office, home, school, and craft use";
  if (["sticky notes", "sticky flags", "page markers"].includes(type)) return "notes, reminders, planning, and document marking";
  if (type.includes("marker")) return "school, office, classroom, labeling, and presentation use";
  if (type.includes("pen") || type.includes("refill") || type.includes("lead") || type === "eraser") return "school, office, exam, and everyday writing use";
  if (type.includes("notebook")) return "notes, journaling, study, planning, and sketching";
  if (type.includes("letter paper") || type.includes("envelope") || type.includes("watercolor")) return "letters, invitations, crafts, printing, and creative projects";
  if (String(category).includes("Computer")) return "desk setups, office work, study, and computer accessories";
  return "school, office, and creative use";
}

function compactTitle(productTitle, max = 46) {
  const cleaned = titleCase(productTitle);
  if (cleaned.length <= max) return cleaned;
  const withoutBrand = cleaned.replace(/^(3M|Addgel|Adnet|Adwell|Artzilla|Baoke)\s+/i, "");
  if (withoutBrand.length <= max) return withoutBrand;
  return withoutBrand.slice(0, max - 1).trimEnd() + "…";
}

function seoTitle(row) {
  const title = compactTitle(row.title, 44);
  return `Buy ${title} Online | Lekhanmart`;
}

function extractAttributes(title) {
  const t = normalizeTitle(title);
  const attrs = [];
  const sizeMatches = t.match(/\b(A[0-7]|B[0-7]|\d+(?:\.\d+)?\s?X\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?MM|\d+(?:\.\d+)?ML|\d+GSM|\d+PCS|\d+N|\d+SHEETS?)\b/g) || [];
  attrs.push(...sizeMatches.map((x) => x.replace(/\s+/g, "")));
  for (const word of t.split(/[^A-Z0-9.]+/)) {
    if (colorWords.has(word)) attrs.push(word);
  }
  return [...new Set(attrs)].slice(0, 4);
}

function makeDescription(row) {
  const product = titleCase(row.title);
  const type = detectProductType(row.title, row.category);
  const use = detectUse(type, row.category);
  const attrs = extractAttributes(row.title);
  const attrText = attrs.length ? ` with ${attrs.map((a) => titleCase(a)).join(", ")} details` : "";
  const brand = row.brand && !product.toLowerCase().startsWith(String(row.brand).toLowerCase()) ? `${row.brand} ` : "";
  const article = /^[aeiou]/i.test(type) ? "an" : "a";
  let description = `${brand}${product} is ${article} ${type}${attrText} for ${use}. Buy online from Lekhanmart for reliable ${String(row.category || "stationery").toLowerCase()} supplies.`;
  if (description.length > 170) {
    description = `${brand}${product} ${type} for ${use}. Buy online from Lekhanmart for reliable ${String(row.category || "stationery").toLowerCase()} supplies.`;
  }
  if (description.length > 170) {
    description = `${brand}${product} ${type} for ${use}. Order online from Lekhanmart.`;
  }
  return description;
}

function makeKeywords(row) {
  const title = titleCase(row.title);
  const brand = titleCase(row.brand || "");
  const category = String(row.category || "").toLowerCase();
  const type = detectProductType(row.title, row.category);
  const attrs = extractAttributes(row.title).map((a) => a.toLowerCase());
  const base = [
    title.toLowerCase(),
    `${brand} ${type}`.trim().toLowerCase(),
    `${type} online`,
    `buy ${type} online`,
    `${category} online`,
    "stationery online India",
    "Lekhanmart stationery",
  ];
  for (const attr of attrs) base.push(`${type} ${attr}`);
  return [...new Set(base.filter(Boolean))].slice(0, 10).join(", ");
}

function makeTags(row) {
  const type = detectProductType(row.title, row.category);
  const attrs = extractAttributes(row.title).map((a) => titleCase(a));
  const tags = [
    titleCase(row.brand || ""),
    titleCase(row.category || ""),
    titleCase(type),
    ...attrs,
    "Online Stationery",
    type.includes("pen") || type.includes("marker") ? "Writing Supplies" : null,
    String(row.category || "").includes("Computer") ? "Computer Accessories" : null,
    String(row.category || "").includes("Art") ? "Art Supplies" : null,
  ];
  return [...new Set(tags.filter(Boolean))].join(", ");
}

function makeImageStatus(row) {
  const product = titleCase(row.title);
  const type = detectProductType(row.title, row.category);
  return `Alt text ready: ${product} - ${type} for ${detectUse(type, row.category)}.`;
}

function rowsFromSheet(sheet) {
  const used = sheet.getUsedRange(true);
  const values = used.values;
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (!row?.[0] || !row?.[1]) continue;
    rows.push({
      index: r,
      handle: row[0],
      title: row[1],
      brand: row[6],
      category: row[7],
    });
  }
  return { values, rows };
}

for (const sheetName of targetSheets) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const { rows } = rowsFromSheet(sheet);

  const cToF = rows.map((row) => [
    makeDescription(row),
    makeKeywords(row),
    seoTitle(row),
    makeTags(row),
  ]);
  const imageStatus = rows.map((row) => [makeImageStatus(row)]);

  sheet.getRangeByIndexes(1, 2, rows.length, 4).values = cToF;
  sheet.getRangeByIndexes(1, 8, rows.length, 1).values = imageStatus;

  sheet.getRange("A1:I1").format = {
    fill: "#174EA6",
    font: { bold: true, color: "#FFFFFF" },
    verticalAlignment: "center",
  };
  sheet.getRange("A1:I1").format.rowHeightPx = 28;
  sheet.getRangeByIndexes(1, 0, rows.length, 9).format = {
    wrapText: true,
    verticalAlignment: "top",
  };
  sheet.getRangeByIndexes(1, 0, rows.length, 9).format.rowHeightPx = 74;
  sheet.getRange("C:C").format.columnWidthPx = 360;
  sheet.getRange("D:D").format.columnWidthPx = 320;
  sheet.getRange("E:E").format.columnWidthPx = 260;
  sheet.getRange("F:F").format.columnWidthPx = 250;
  sheet.getRange("I:I").format.columnWidthPx = 360;
  sheet.freezePanes.freezeRows(1);
}

const sources = workbook.worksheets.add("Research Sources");
sources.showGridLines = false;
sources.getRange("A1:C1").values = [["Area", "How it was used", "Source URL"]];
sources.getRangeByIndexes(1, 0, sourceUrls.length, 3).values = sourceUrls;
sources.getRange("A1:C1").format = {
  fill: "#174EA6",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
sources.getRange("A:C").format.wrapText = true;
sources.getRange("A1:C1").format.rowHeightPx = 28;
sources.getRangeByIndexes(1, 0, sourceUrls.length, 3).format = {
  wrapText: true,
  verticalAlignment: "top",
};
sources.getRangeByIndexes(1, 0, sourceUrls.length, 3).format.rowHeightPx = 48;
sources.getRange("A:A").format.columnWidthPx = 180;
sources.getRange("B:B").format.columnWidthPx = 480;
sources.getRange("C:C").format.columnWidthPx = 520;
sources.freezePanes.freezeRows(1);

await fs.mkdir("verified", { recursive: true });
for (const sheetName of targetSheets) {
  const preview = await workbook.render({
    sheetName,
    range: "A1:I12",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(`verified/${sheetName.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

const spotCheck = await workbook.inspect({
  kind: "table",
  sheetId: "3M Products",
  range: "A1:I6",
  tableMaxRows: 6,
  tableMaxCols: 9,
  tableMaxCellChars: 140,
  maxChars: 5000,
});
console.log(spotCheck.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save("lekhanmart_seo_filled_6_category_sheets.xlsx");

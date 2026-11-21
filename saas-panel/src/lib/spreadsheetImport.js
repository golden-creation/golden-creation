function normalizeCell(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    if (value.hyperlink) return value.hyperlink;
    if (value.text) return value.text;
    if (value.result !== undefined) return normalizeCell(value.result);
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || "").join("");
    }
  }

  return String(value).trim();
}

function rowsFromMatrix(matrix) {
  const [headerRow = [], ...dataRows] = matrix;
  const headers = headerRow.map((header) => normalizeCell(header));

  return dataRows
    .filter((row) => row.some((value) => normalizeCell(value) !== ""))
    .map((row) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, normalizeCell(row[index])])
          .filter(([header]) => header)
      )
    );
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rowsFromMatrix(rows);
}

function parseHtmlTable(text) {
  const tableText = text
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  return rowsFromMatrix(
    tableText
      .split(/\r?\n/)
      .map((line) => line.split("\t"))
      .filter((row) => row.some((cell) => cell.trim()))
  );
}

function xmlDocument(xml, fileName) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error(`Unable to read ${fileName} from XLSX workbook`);
  }
  return document;
}

function xmlElements(document, localName) {
  return Array.from(document.getElementsByTagNameNS("*", localName));
}

function resolveZipPath(basePath, target) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const segments = `${basePath}/${target}`.split("/");
  const resolved = [];

  segments.forEach((segment) => {
    if (!segment || segment === ".") return;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  });

  return resolved.join("/");
}

async function unzipText(zip, fileName) {
  const file = zip.file(fileName);
  return file ? file.async("string") : "";
}

function sharedStringValues(document) {
  return xmlElements(document, "si").map((entry) =>
    xmlElements(entry, "t")
      .map((node) => node.textContent || "")
      .join("")
  );
}

async function parseNamespacedXlsx(buffer) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await unzipText(zip, "xl/workbook.xml");
  const workbookRelsXml = await unzipText(zip, "xl/_rels/workbook.xml.rels");

  if (!workbookXml || !workbookRelsXml) {
    throw new Error("XLSX workbook metadata is missing");
  }

  const workbook = xmlDocument(workbookXml, "workbook.xml");
  const workbookRels = xmlDocument(workbookRelsXml, "workbook relationships");
  const firstSheet = xmlElements(workbook, "sheet")[0];
  const relationshipId = firstSheet?.getAttributeNS(
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "id"
  ) || firstSheet?.getAttribute("r:id");
  const relationship = xmlElements(workbookRels, "Relationship").find(
    (item) => item.getAttribute("Id") === relationshipId
  );
  const sheetPath = resolveZipPath("xl", relationship?.getAttribute("Target") || "");
  const sheetXml = await unzipText(zip, sheetPath);

  if (!sheetXml) {
    throw new Error("The first XLSX worksheet could not be found");
  }

  const sharedStringsXml = await unzipText(zip, "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? sharedStringValues(xmlDocument(sharedStringsXml, "sharedStrings.xml"))
    : [];
  const sheet = xmlDocument(sheetXml, "worksheet");
  const matrix = xmlElements(sheet, "row").map((row) => {
    const cells = [];

    xmlElements(row, "c").forEach((cell) => {
      const reference = cell.getAttribute("r") || "";
      const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
      const column = [...letters].reduce(
        (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
        0
      ) - 1;
      const type = cell.getAttribute("t");
      const rawValue = xmlElements(cell, "v")[0]?.textContent || "";
      const inlineValue = xmlElements(cell, "t")
        .map((node) => node.textContent || "")
        .join("");

      cells[column] =
        type === "s"
          ? sharedStrings[Number(rawValue)] || ""
          : type === "inlineStr"
            ? inlineValue
            : type === "b"
              ? rawValue === "1"
              : rawValue;
    });

    return cells;
  });

  return rowsFromMatrix(matrix);
}

async function parseExcelJsXlsx(buffer) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) throw new Error("No worksheet found in XLSX file");

  const headers = worksheet.getRow(1).values.slice(1).map(normalizeCell);
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const item = Object.fromEntries(
      headers
        .map((header, index) => [header, normalizeCell(row.getCell(index + 1).value)])
        .filter(([header]) => header)
    );
    if (Object.values(item).some(Boolean)) rows.push(item);
  });
  return rows;
}

export async function readSpreadsheetRows(file) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".xlsx")) {
    const buffer = await file.arrayBuffer();
    try {
      return await parseExcelJsXlsx(buffer);
    } catch {
      return parseNamespacedXlsx(buffer);
    }
  }

  const text = await file.text();
  return fileName.endsWith(".csv") ? parseCsv(text) : parseHtmlTable(text);
}

export function groupedImportBatches(rows, maximumRows = 100) {
  const groups = [];
  const byKey = new Map();

  rows.forEach((row, index) => {
    const key = String(row.ID || row.id || row["Product ID"] || row.product_id || row.Handle || row.handle || row.SKU || row.sku || `row-${index}`).trim().toLowerCase();
    if (!byKey.has(key)) {
      const group = [];
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).push(row);
  });

  const batches = [];
  let batch = [];
  groups.forEach((group) => {
    if (batch.length && batch.length + group.length > maximumRows) {
      batches.push(batch);
      batch = [];
    }
    batch.push(...group);
  });
  if (batch.length) batches.push(batch);
  return batches;
}

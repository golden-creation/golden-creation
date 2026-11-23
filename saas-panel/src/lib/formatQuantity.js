// Display-only. Does not round fractional quantities and must not be used
// for stock math, imports, exports, or API payloads.
export function formatQuantity(value) {
  if (value === null || value === undefined) return "";

  const text = String(value).trim().replace(/,/g, "");
  if (text === "") return "";
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return "";

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return "";
  if (Object.is(parsed, -0)) return "0";
  return String(parsed);
}

// Input display. Strips stored trailing zeros such as 1.0000, and leaves an
// in-progress value like "1." or "1.0" unchanged so a fraction can still be typed.
export function quantityFieldValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const trimmed = text.trim();
  const match = trimmed.match(/^[+-]?\d+\.(\d+)$/);
  if (!match) return text;
  const fraction = match[1];
  if ((/^0+$/.test(fraction) && fraction.length >= 2) || /00$/.test(fraction)) {
    return formatQuantity(trimmed);
  }
  return text;
}

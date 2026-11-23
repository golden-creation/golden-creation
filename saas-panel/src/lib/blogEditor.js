export function sanitizeBlogHtml(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
}

export function formatBlockValue(tag) {
  const name = String(tag || "").replace(/[<>]/g, "").toLowerCase();
  if (!["h1", "h2", "h3", "p", "blockquote"].includes(name)) return "";
  return `<${name}>`;
}

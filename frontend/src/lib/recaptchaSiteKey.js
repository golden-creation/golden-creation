function clean(value) {
  return String(value || "").trim();
}

function isPlaceholder(value) {
  return /your_google|changeme|placeholder|example/i.test(value);
}

export function resolveRecaptchaSiteKey({ configured = "", fallback = "" } = {}) {
  const configuredKey = clean(configured);
  if (configuredKey && !isPlaceholder(configuredKey)) {
    return configuredKey;
  }

  const fallbackKey = clean(fallback);
  if (fallbackKey && !isPlaceholder(fallbackKey)) {
    return fallbackKey;
  }

  return "";
}

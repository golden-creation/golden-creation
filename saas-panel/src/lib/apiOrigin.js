function isLoopbackUrl(value) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(String(value || ""));
}

export function resolveProductionApiBase({ configured = "" } = {}) {
  const value = String(configured || "").trim();
  if (value && !isLoopbackUrl(value)) {
    return value.replace(/\/$/, "");
  }
  return "/api";
}

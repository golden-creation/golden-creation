export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return function limitRequests(req, res, next) {
    const now = Date.now();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const recent = (hits.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ message: "Too many requests. Please wait and try again." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [entry, timestamps] of hits) {
        if (!timestamps.some((timestamp) => now - timestamp < windowMs)) hits.delete(entry);
      }
    }
    next();
  };
}

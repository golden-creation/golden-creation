import { createHash } from "node:crypto";
import { APPROVED_DISTANCE_METERS, SHOP_ADDRESS, SHOP_LATITUDE, SHOP_LONGITUDE, acceptedRoadMeters } from "./payment-policy.js";

export const GEOCODE_SEARCH_URL = "https://api.heigit.org/pelias/v1/search";
export const DRIVING_DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson";

export function configuredShopLocation(env = process.env) {
  const latitude = Number(env.GOLDEN_CREATION_SHOP_LATITUDE);
  const longitude = Number(env.GOLDEN_CREATION_SHOP_LONGITUDE);
  return {
    address: SHOP_ADDRESS,
    latitude: latitude >= 6 && latitude <= 37 ? latitude : SHOP_LATITUDE,
    longitude: longitude >= 68 && longitude <= 98 ? longitude : SHOP_LONGITUDE,
  };
}

export const SHOP_LOCATION = configuredShopLocation();

const MIN_CONFIDENCE = 0.8;
const PRECISE_LAYERS = new Set(["address", "venue"]);
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_LIMIT = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

function unavailable(reason) {
  return { verified: false, meters: null, kilometers: null, withinLimit: false, reason };
}

function displayKilometers(meters) {
  return Number((meters / 1000).toFixed(2));
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function withinIndia(longitude, latitude) {
  return latitude >= 6 && latitude <= 37 && longitude >= 68 && longitude <= 98;
}

function separationMeters(left, right) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function deliveryAddressParts({ address = "", street = "", city = "", state = "", pin = "" } = {}) {
  const streetLine = String(street || "").trim();
  const pinDigits = String(pin || "").replace(/\D/g, "");
  const text = String(address || "").trim();
  const pinMatch = text.match(/\b([1-9][0-9]{5})\b/);
  const resolvedPin = /^[1-9][0-9]{5}$/.test(pinDigits) ? pinDigits : (pinMatch?.[1] || "");
  const resolvedStreet = streetLine || text.replace(/\b[1-9][0-9]{5}\b/g, " ").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return {
    street: resolvedStreet,
    city: String(city || "").trim(),
    state: String(state || "").trim(),
    pin: resolvedPin,
    query: [resolvedStreet, city, state, resolvedPin].map((part) => String(part || "").trim()).filter(Boolean).join(", "),
  };
}

export function addressIsPrecise(parts) {
  const street = normalizeText(parts?.street);
  const words = street.split(" ").filter(Boolean);
  const detailed = /\d/.test(street) || words.length >= 2;
  return detailed && street.length >= 3 && /^[1-9][0-9]{5}$/.test(parts?.pin || "");
}

function postalCode(properties) {
  return String(properties.postalcode || properties.postal_code || properties.postalCode || "").replace(/\D/g, "");
}

function streetAgrees(street, properties) {
  const customer = normalizeText(street);
  if (customer.length < 3) return false;
  const fields = [properties.street, properties.name, properties.label]
    .map(normalizeText)
    .filter((item) => item.length >= 3);
  return fields.some((item) => (
    (customer.includes(item) || item.includes(customer))
    && (/\d/.test(item) || item.split(" ").length >= 2)
  ));
}

export function selectDeliveryCoordinate(features = [], { pin = "", street = "" } = {}) {
  if (!/^[1-9][0-9]{5}$/.test(pin) || normalizeText(street).length < 3) return null;
  const candidates = [];
  for (const feature of features) {
    const coordinates = feature?.geometry?.coordinates;
    const properties = feature?.properties || {};
    const longitude = Number(coordinates?.[0]);
    const latitude = Number(coordinates?.[1]);
    const confidence = Number(properties.confidence);
    const layer = String(properties.layer || "").toLowerCase();
    const matchType = String(properties.match_type || properties.matchType || "").toLowerCase();
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !withinIndia(longitude, latitude)) continue;
    if (!PRECISE_LAYERS.has(layer) || matchType === "fallback") continue;
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) continue;
    if (postalCode(properties) !== pin) continue;
    if (!streetAgrees(street, properties)) continue;
    candidates.push({ longitude, latitude, confidence });
  }
  candidates.sort((left, right) => right.confidence - left.confidence);
  const best = candidates[0];
  if (!best) return null;
  const rival = candidates[1];
  if (rival && best.confidence - rival.confidence < 0.05 && separationMeters(best, rival) > 500) return null;
  return best;
}

async function requestJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const untilTimeout = (promise) => new Promise((resolve, reject) => {
    const fail = () => reject(new Error("timeout"));
    if (timedOut || controller.signal.aborted) {
      fail();
      return;
    }
    const onAbort = () => fail();
    controller.signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        controller.signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        controller.signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
  try {
    const response = await untilTimeout(fetchImpl(url, { ...options, signal: controller.signal }));
    if (!response?.ok || typeof response.json !== "function") return response;
    const body = await untilTimeout(response.json());
    return { ok: true, json: async () => body };
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(parts, shop) {
  return createHash("sha256").update(JSON.stringify({
    street: normalizeText(parts.street),
    city: normalizeText(parts.city),
    state: normalizeText(parts.state),
    pin: parts.pin,
    latitude: shop.latitude,
    longitude: shop.longitude,
  })).digest("hex");
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return { ...hit.value };
}

function remember(key, value) {
  if (!value?.verified) return;
  const stored = {
    verified: true,
    meters: value.meters,
    kilometers: value.kilometers,
    withinLimit: value.withinLimit,
    reason: "",
  };
  cache.delete(key);
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: stored });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

export function clearRoadDistanceCache() {
  cache.clear();
  inflight.clear();
}

export function roadDistanceCacheSnapshot() {
  return [...cache.entries()].map(([key, entry]) => ({ key, value: { ...entry.value } }));
}

async function measureUncached({ apiKey, fetchImpl, shop, timeoutMs, parts }) {
  const geocode = await requestJson(
    fetchImpl,
    `${GEOCODE_SEARCH_URL}?size=5&boundary.country=IN&text=${encodeURIComponent(parts.query)}`,
    { headers: { Accept: "application/json", Authorization: apiKey } },
    timeoutMs
  );
  if (!geocode?.ok) return unavailable("The delivery address could not be located.");
  const geocodeBody = await geocode.json();
  const point = selectDeliveryCoordinate(geocodeBody?.features, { pin: parts.pin, street: parts.street });
  if (!point) return unavailable("The delivery address could not be verified with enough confidence.");
  const route = await requestJson(
    fetchImpl,
    DRIVING_DIRECTIONS_URL,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [shop.longitude, shop.latitude],
          [point.longitude, point.latitude],
        ],
      }),
    },
    timeoutMs
  );
  if (!route?.ok) return unavailable("The road distance could not be verified.");
  const routeBody = await route.json();
  const meters = acceptedRoadMeters(routeBody?.features?.[0]?.properties?.summary?.distance);
  if (meters == null) return unavailable("The road distance could not be verified.");
  return {
    verified: true,
    meters,
    kilometers: displayKilometers(meters),
    withinLimit: meters <= APPROVED_DISTANCE_METERS,
    reason: "",
  };
}

export async function measureRoadDistance({
  address = "",
  street = "",
  city = "",
  state = "",
  pin = "",
  apiKey = process.env.OPENROUTESERVICE_API_KEY || "",
  fetchImpl = globalThis.fetch,
  shop = configuredShopLocation(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  bypassCache = false,
} = {}) {
  const parts = deliveryAddressParts({ address, street, city, state, pin });
  if (!addressIsPrecise(parts)) return unavailable("A street address and PIN code are required to verify road distance.");
  if (!apiKey) return unavailable("Road-distance verification is not configured.");
  if (typeof fetchImpl !== "function") return unavailable("Road-distance verification is unavailable.");
  const key = cacheKey(parts, shop);
  if (!bypassCache) {
    const cached = readCache(key);
    if (cached) return cached;
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const task = measureUncached({ apiKey, fetchImpl, shop, timeoutMs, parts })
    .then((result) => {
      if (!bypassCache) remember(key, result);
      return result;
    })
    .catch(() => unavailable("The road distance could not be verified."))
    .finally(() => inflight.delete(key));
  if (!bypassCache) inflight.set(key, task);
  return task;
}

import { APPROVED_DISTANCE_METERS, SHOP_ADDRESS, SHOP_LATITUDE, SHOP_LONGITUDE } from "./payment-policy.js";

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
const ACCEPTED_LAYERS = new Set(["address", "venue", "street", "locality"]);
const REQUEST_TIMEOUT_MS = 8000;

function unavailable(reason) {
  return { verified: false, meters: null, kilometers: null, reason };
}

function displayKilometers(meters) {
  return Number((Number(meters) / 1000).toFixed(2));
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

export function selectDeliveryCoordinate(features = []) {
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
    if (!ACCEPTED_LAYERS.has(layer) || matchType === "fallback") continue;
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) continue;
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function measureRoadDistance({
  address = "",
  apiKey = process.env.OPENROUTESERVICE_API_KEY || "",
  fetchImpl = globalThis.fetch,
  shop = configuredShopLocation(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const destination = String(address || "").trim();
  if (!destination) return unavailable("A delivery address is required to measure road distance.");
  if (!apiKey) return unavailable("Road-distance verification is not configured.");
  if (typeof fetchImpl !== "function") return unavailable("Road-distance verification is unavailable.");
  try {
    const geocode = await requestJson(
      fetchImpl,
      `${GEOCODE_SEARCH_URL}?size=5&boundary.country=IN&text=${encodeURIComponent(destination)}`,
      { headers: { Accept: "application/json", Authorization: apiKey } },
      timeoutMs
    );
    if (!geocode?.ok) return unavailable("The delivery address could not be located.");
    const geocodeBody = await geocode.json();
    const point = selectDeliveryCoordinate(geocodeBody?.features);
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
    const meters = Number(routeBody?.features?.[0]?.properties?.summary?.distance);
    if (!Number.isFinite(meters) || meters < 0) return unavailable("The road distance could not be verified.");
    return {
      verified: true,
      meters,
      kilometers: displayKilometers(meters),
      withinLimit: meters <= APPROVED_DISTANCE_METERS,
      reason: "",
    };
  } catch {
    return unavailable("The road distance could not be verified.");
  }
}

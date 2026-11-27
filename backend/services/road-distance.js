import { SHOP_ADDRESS, SHOP_LATITUDE, SHOP_LONGITUDE } from "./payment-policy.js";

export const SHOP_LOCATION = {
  address: SHOP_ADDRESS,
  latitude: SHOP_LATITUDE,
  longitude: SHOP_LONGITUDE,
};

function unavailable(reason) {
  return { verified: false, kilometers: null, reason };
}

export async function measureRoadDistance({
  address = "",
  apiKey = process.env.OPENROUTESERVICE_API_KEY || "",
  fetchImpl = globalThis.fetch,
  shop = SHOP_LOCATION,
} = {}) {
  const destination = String(address || "").trim();
  if (!destination) return unavailable("A delivery address is required to measure road distance.");
  if (!apiKey) return unavailable("Road-distance verification is not configured.");
  if (typeof fetchImpl !== "function") return unavailable("Road-distance verification is unavailable.");
  try {
    const geocode = await fetchImpl(
      `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(apiKey)}&size=1&boundary.country=IN&text=${encodeURIComponent(destination)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!geocode.ok) return unavailable("The delivery address could not be located.");
    const geocodeBody = await geocode.json();
    const point = geocodeBody?.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(point) || point.length < 2) return unavailable("The delivery address could not be located.");
    const route = await fetchImpl("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [shop.longitude, shop.latitude],
          [Number(point[0]), Number(point[1])],
        ],
      }),
    });
    if (!route.ok) return unavailable("The road distance could not be verified.");
    const routeBody = await route.json();
    const meters = Number(routeBody?.features?.[0]?.properties?.summary?.distance);
    if (!Number.isFinite(meters) || meters < 0) return unavailable("The road distance could not be verified.");
    return { verified: true, kilometers: Number((meters / 1000).toFixed(2)), reason: "" };
  } catch {
    return unavailable("The road distance could not be verified.");
  }
}

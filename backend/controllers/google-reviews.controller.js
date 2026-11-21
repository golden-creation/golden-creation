const GOOGLE_REVIEWS_CACHE_MS = 1000 * 60 * 30;
const DEFAULT_PLACE_ID = "ChIJgwoNMiEhDTkRN-NsJU1d-Rs";
const DEFAULT_GOOGLE_MAPS_URL = "https://maps.app.goo.gl/HDgwXAjE3oawJnWQ6";

let cachedPayload = null;
let cachedAt = 0;

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeReview(review = {}) {
  return {
    authorName: cleanString(review.author_name) || "Google user",
    authorUrl: cleanString(review.author_url),
    profilePhotoUrl: cleanString(review.profile_photo_url),
    rating: Number(review.rating || 0),
    text: cleanString(review.text),
    relativeTime: cleanString(review.relative_time_description),
    time: Number(review.time || 0),
  };
}

function fallbackPayload() {
  return {
    source: "fallback",
    placeName: "Golden Creation",
    rating: 0,
    reviewCount: 0,
    googleMapsUrl: DEFAULT_GOOGLE_MAPS_URL,
    reviews: [],
  };
}

export async function getGoogleReviews(_req, res) {
  const now = Date.now();

  if (cachedPayload && now - cachedAt < GOOGLE_REVIEWS_CACHE_MS) {
    return res.json(cachedPayload);
  }

  const apiKey = cleanString(process.env.GOOGLE_PLACES_API_KEY);
  const placeId = cleanString(process.env.GOOGLE_PLACE_ID) || DEFAULT_PLACE_ID;

  if (!apiKey) {
    console.warn("Google reviews are not configured: GOOGLE_PLACES_API_KEY is missing.");
    return res.json(fallbackPayload());
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "place_id,name,rating,user_ratings_total,url,reviews",
    reviews_sort: "most_relevant",
    key: apiKey,
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
    );
    const payload = await response.json();

    if (payload.status !== "OK") {
      console.warn("Google reviews fetch failed:", payload.status, payload.error_message || "");
      return res.json({
        ...fallbackPayload(),
        source: "google_error",
        status: payload.status,
      });
    }

    const result = payload.result || {};
    const normalizedPayload = {
      source: "google_places",
      placeId: result.place_id || placeId,
      placeName: result.name || "Golden Creation",
      rating: Number(result.rating || 0),
      reviewCount: Number(result.user_ratings_total || 0),
      googleMapsUrl:
        cleanString(result.url) ||
        `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`,
      reviews: Array.isArray(result.reviews)
        ? result.reviews.map(normalizeReview).filter((review) => review.rating === 5).slice(0, 5)
        : [],
    };

    cachedPayload = normalizedPayload;
    cachedAt = now;

    res.json(normalizedPayload);
  } catch (error) {
    console.warn("Google reviews fetch error:", error.message);
    res.json({
      ...fallbackPayload(),
      source: "google_error",
    });
  }
}

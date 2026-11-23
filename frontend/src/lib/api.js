import { appendUniqueBrands, hasAnotherBrandPage } from "./brandCatalog.js";

const BROWSER_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin.replace(/\/$/, "")
    : "";

/* FIXED BACKEND URL */

const DEFAULT_SITE_BASE_URL =
  "http://localhost:5000";

const DEFAULT_API_BASE_URL =
  "http://localhost:5000/api";

function isLoopbackUrl(value) {
  return /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(
    String(value || "")
  );
}

function resolveSiteBaseUrl() {
  const configuredSiteUrl =
    String(
      import.meta.env
        .VITE_SITE_BASE_URL || ""
    ).trim();

  const configuredApiUrl =
    String(
      import.meta.env
        .VITE_API_BASE_URL || ""
    ).trim();

  if (
    BROWSER_ORIGIN &&
    isLoopbackUrl(
      configuredSiteUrl
    ) &&
    !/localhost|127\.0\.0\.1/i.test(
      BROWSER_ORIGIN
    )
  ) {
    return BROWSER_ORIGIN;
  }

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(
      /\/$/,
      ""
    );
  }

  if (
    BROWSER_ORIGIN &&
    isLoopbackUrl(
      configuredApiUrl
    ) &&
    !/localhost|127\.0\.0\.1/i.test(
      BROWSER_ORIGIN
    )
  ) {
    return BROWSER_ORIGIN;
  }

  if (configuredApiUrl) {
    return configuredApiUrl
      .replace(/\/api$/, "")
      .replace(/\/$/, "");
  }

  return DEFAULT_SITE_BASE_URL;
}

function resolveApiBaseUrl(
  siteBaseUrl
) {
  const configuredApiUrl =
    String(
      import.meta.env
        .VITE_API_BASE_URL || ""
    ).trim();

  if (
    BROWSER_ORIGIN &&
    isLoopbackUrl(
      configuredApiUrl
    ) &&
    !/localhost|127\.0\.0\.1/i.test(
      BROWSER_ORIGIN
    )
  ) {
    return `${siteBaseUrl}/api`;
  }

  if (configuredApiUrl) {
    return configuredApiUrl.replace(
      /\/$/,
      ""
    );
  }

  return DEFAULT_API_BASE_URL;
}

export const SITE_BASE_URL =
  resolveSiteBaseUrl();

export const API_BASE_URL =
  resolveApiBaseUrl(
    SITE_BASE_URL
  );

const RECAPTCHA_SITE_KEY =
  String(
    import.meta.env
      .VITE_RECAPTCHA_SITE_KEY || ""
  ).trim();

let recaptchaScriptPromise = null;

function loadRecaptchaScript() {
  if (!RECAPTCHA_SITE_KEY || typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.grecaptcha?.execute) {
    return Promise.resolve(true);
  }

  if (!recaptchaScriptPromise) {
    recaptchaScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(
        `script[src*="recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}"]`
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(true), { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(
        RECAPTCHA_SITE_KEY
      )}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Unable to load reCAPTCHA"));
      document.head.appendChild(script);
    });
  }

  return recaptchaScriptPromise;
}

export async function getRecaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY || typeof window === "undefined") {
    return "";
  }

  await loadRecaptchaScript();

  return new Promise((resolve, reject) => {
    window.grecaptcha.ready(() => {
      window.grecaptcha
        .execute(RECAPTCHA_SITE_KEY, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}

export async function initializeRecaptcha(action = "page_view") {
  if (!RECAPTCHA_SITE_KEY || typeof window === "undefined") {
    return "";
  }

  try {
    return await getRecaptchaToken(action);
  } catch (error) {
    console.warn("reCAPTCHA initialization failed", error);
    return "";
  }
}

const CUSTOMER_SESSION_KEY = "goldencreation.customer.session";
const REFERRAL_ATTRIBUTION_KEY = "goldencreation.referral.attribution";
const REFERRAL_VISITOR_KEY = "goldencreation.referral.visitor";

function readCustomerSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(CUSTOMER_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveCustomerSession(payload) {
  if (typeof window === "undefined" || !payload?.session) return;
  window.localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(payload.session));
}

export function clearCustomerSession() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CUSTOMER_SESSION_KEY);
  }
}

async function refreshCustomerSession() {
  const session = readCustomerSession();
  if (!session?.refreshToken) return false;
  const response = await fetch(`${API_BASE_URL}/customer/session/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!response.ok) {
    clearCustomerSession();
    return false;
  }
  saveCustomerSession(await response.json());
  return true;
}

async function request(
  path,
  options = {},
  retried = false
) {
  const { authenticated = false, headers: extraHeaders = {}, ...fetchOptions } = options;
  const session = readCustomerSession();
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      headers: {
        "Content-Type":
          "application/json",
        ...(authenticated && session?.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {}),
        ...extraHeaders,
      },
      ...fetchOptions,
    }
  );

  if (authenticated && response.status === 401 && !retried) {
    if (await refreshCustomerSession()) {
      return request(path, options, true);
    }
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  const payload =
    contentType.includes(
      "application/json"
    )
      ? await response.json()
      : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message ||
          "Something went wrong";

    throw new Error(message);
  }

  return payload;
}

function getReferralVisitorKey() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(REFERRAL_VISITOR_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(REFERRAL_VISITOR_KEY, next);
  return next;
}

export function getStoredReferralAttribution() {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(REFERRAL_ATTRIBUTION_KEY) || "null");
    if (!value?.code) return null;
    if (value.expiresAt && Date.now() > Number(value.expiresAt)) {
      window.localStorage.removeItem(REFERRAL_ATTRIBUTION_KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function saveReferralAttribution(referral, source, landingUrl) {
  if (typeof window === "undefined" || !referral?.code) return null;
  const days = Number(referral.attributionWindowDays || 30) || 30;
  const payload = {
    code: String(referral.code).toUpperCase(),
    ownerType: referral.ownerType || "",
    ownerId: referral.ownerId || "",
    ownerName: referral.ownerName || "",
    source: source || referral.ownerType || "website",
    capturedAt: new Date().toISOString(),
    landingUrl,
    visitorKey: getReferralVisitorKey(),
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
  };
  window.localStorage.setItem(REFERRAL_ATTRIBUTION_KEY, JSON.stringify(payload));
  return payload;
}

export async function captureReferralFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const rawCode = params.get("aff") || params.get("ref") || params.get("utm_ref");
  const code = String(rawCode || "").trim();
  if (!code) return getStoredReferralAttribution();

  const source = params.get("aff") ? "affiliate" : params.get("ref") ? "customer_referral" : "utm_ref";
  try {
    const resolved = await request(`/referrals/resolve/${encodeURIComponent(code)}`);
    const attribution = saveReferralAttribution(resolved.referral, source, window.location.href);
    if (attribution) {
      await request("/referrals/click", {
        method: "POST",
        body: JSON.stringify({
          code: attribution.code,
          source,
          landingUrl: window.location.href,
          visitorKey: attribution.visitorKey,
        }),
      }).catch(() => undefined);
    }
    return attribution;
  } catch {
    return getStoredReferralAttribution();
  }
}

export function buildReferralLink(path = "/", code = "", type = "ref") {
  const targetPath = String(path || "/");
  const separator = targetPath.includes("?") ? "&" : "?";
  return `${SITE_BASE_URL}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}${separator}${type}=${encodeURIComponent(code)}`;
}

export function buildImageUrl(
  imagePath
) {
  if (!imagePath) {
    return `${SITE_BASE_URL}/images/product-placeholder.png`;
  }

  if (
    /^https?:\/\//i.test(
      imagePath
    ) ||
    /^data:image\//i.test(imagePath) ||
    /^blob:/i.test(imagePath)
  ) {
    return imagePath;
  }

  const normalizedPath =
    imagePath.startsWith("/")
      ? imagePath
      : `/images/${imagePath}`;

  return `${SITE_BASE_URL}${normalizedPath}`;
}

function clampRating(value) {
  const numericValue =
    Number(value);

  if (
    !Number.isFinite(
      numericValue
    )
  ) {
    return null;
  }

  return Math.max(
    1,
    Math.min(
      5,
      Number(
        numericValue.toFixed(1)
      )
    )
  );
}

function inferBrand(product) {
  const explicitBrand =
    product.brand ||
    product.brandName ||
    product.brand_name ||
    product.manufacturer ||
    product.vendor ||
    "";

  if (
    String(explicitBrand).trim()
  ) {
    return String(
      explicitBrand
    ).trim();
  }

  const name = String(
    product.name || ""
  ).trim();

  const firstWord =
    name.split(/\s+/)[0];

  if (firstWord) {
    return firstWord;
  }

  return "Golden Creation";
}

function inferRating(product) {
  const explicitRating =
    clampRating(
      product.rating ??
        product.customerRating ??
        product.averageRating ??
        product.average_rating
    );

  if (
    explicitRating != null
  ) {
    return explicitRating;
  }

  return 0;
}

function parseMaybeJson(value, fallbackValue = null) {
  if (!value) return fallbackValue;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

export function normaliseProduct(
  product
) {
  if (!product) {
    return null;
  }

  const imageDetails = Array.isArray(product.imagesDetailed || product.images_detailed)
    ? (product.imagesDetailed || product.images_detailed)
        .map((image, index) => ({
          ...image,
          id: image.id ? Number(image.id) : null,
          url: buildImageUrl(image.url || image.image_url || image.image || ""),
          altText: image.altText || image.alt_text || image.alt || "",
          titleText: image.titleText || image.title_text || "",
          caption: image.caption || "",
          description: image.description || "",
          sortOrder: Number(image.sortOrder || image.sort_order || index + 1) || index + 1,
        }))
        .filter((image) => image.url)
    : [];

  const rawImages =
    Array.isArray(product.images)
      ? product.images
      : typeof product.images ===
        "string"
      ? product.images.split(",")
      : [];

  const imageCandidates = [
    product.image,
    product.image_url,
    product.imageUrl,
    product.photo,
    product.thumbnail,
    ...rawImages,
  ]
    .map((item) =>
      typeof item === "string"
        ? item.trim()
        : ""
    )
    .filter(Boolean);

  const images = [
    ...new Set(
      imageCandidates.map(
        buildImageUrl
      )
    ),
  ];

  const tagNames = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === "string"
    ? product.tags.split(",")
    : [];
  const tagSlugs = Array.isArray(product.tagSlugs)
    ? product.tagSlugs
    : typeof product.tag_slugs === "string"
    ? product.tag_slugs.split(",")
    : [];
  const variants = Array.isArray(product.variants)
    ? product.variants.map((variant) => ({
        ...variant,
        id: Number(variant.id),
        productId: Number(variant.productId || variant.product_id || product.id),
        sku: variant.sku || "",
        barcode: variant.barcode || "",
        price: Number(variant.price) || 0,
        comparePrice:
          variant.comparePrice === null || variant.compare_price === null
            ? null
            : Number(variant.comparePrice ?? variant.compare_price ?? 0) || null,
        stock: Number(variant.stock) || 0,
        weight: variant.weight === null || variant.weight === undefined ? null : Number(variant.weight) || null,
        weightUnit: variant.weightUnit || variant.weight_unit || "",
        dimensions: parseMaybeJson(variant.dimensions, variant.dimensions || null),
        specifications: parseMaybeJson(variant.specifications, variant.specifications || null),
        image: variant.image ? buildImageUrl(variant.image) : "",
        status: variant.status || "Active",
        visibility: variant.visibility || "Visible",
        isDefault: Boolean(variant.isDefault || variant.is_default),
        options: Array.isArray(variant.options) ? variant.options : [],
        optionSummary:
          variant.optionSummary ||
          (Array.isArray(variant.options)
            ? variant.options.map((option) => `${option.optionName}: ${option.value}`).join(" / ")
            : ""),
      }))
    : [];
  const variantOptions = Array.isArray(product.variantOptions || product.variant_options)
    ? (product.variantOptions || product.variant_options).map((option) => ({
        ...option,
        id: Number(option.id),
        name: option.name,
        values: Array.isArray(option.values)
          ? option.values.map((value) => ({
              ...value,
              id: Number(value.id),
              value: value.value,
            }))
          : [],
      }))
    : [];
  const defaultVariant =
    variants.find((variant) => variant.isDefault && variant.status === "Active" && variant.visibility !== "Hidden") ||
    variants.find((variant) => variant.status === "Active" && variant.visibility !== "Hidden") ||
    variants[0] ||
    null;

  return {
    ...product,

    id: Number(product.id),

    slug:
      product.slug ||
      product.product_slug ||
      product.productSlug ||
      "",

    categoryId: Number(
      product.category_id ??
        product.categoryId ??
        0
    ),

    categoryName:
      product.category_name ||
      product.categoryName ||
      product.category ||
      product.category_title ||
      "Stationery",

    brandId:
      Number(product.brand_id ?? product.brandId ?? 0) || null,

    brandName:
      product.brand_name ||
      product.brandName ||
      product.brand ||
      "",

    brandSlug:
      product.brand_slug ||
      product.brandSlug ||
      "",

    brandLogo:
      product.brand_logo
        ? buildImageUrl(product.brand_logo)
        : product.brandLogo
        ? buildImageUrl(product.brandLogo)
        : "",

    brand: inferBrand(
      product
    ),

    price:
      Number(defaultVariant?.price ?? product.price) ||
      0,

    comparePrice:
      defaultVariant?.comparePrice ||
      Number(product.default_compare_price || product.compare_price) ||
      null,

    discountPercent:
      Number(parseMaybeJson(product.specifications, {})?.__product_offer?.percent) || 0,

    mrp:
      Number(parseMaybeJson(product.specifications, {})?.__product_offer?.mrp) || null,

    gstInclusive:
      product.gst_inclusive === undefined && product.gstInclusive === undefined
        ? true
        : Boolean(Number(product.gst_inclusive ?? product.gstInclusive)),

    basePrice:
      Number(product.price) ||
      0,

    stock:
      Number(product.stock ?? product.stock_quantity ?? product.stockQuantity ?? 0) || 0,

    rating: inferRating(
      product
    ),

    averageRating:
      Number(product.average_rating ?? product.averageRating ?? product.rating ?? 0) ||
      0,

    reviewCount:
      Number(product.review_count ?? product.reviewCount ?? 0) || 0,

    description:
      product.description ||
      "A premium stationery product selected for everyday creativity.",

    imageUrl: defaultVariant?.image || images[0] || "",

    images,

    imagesDetailed: imageDetails.length
      ? imageDetails
      : images.map((url, index) => ({
          id: null,
          url,
          altText: product.name || "Golden Creation product image",
          titleText: product.name || "",
          caption: "",
          description: "",
          sortOrder: index + 1,
        })),

    hasVariants:
      Boolean(product.hasVariants || product.has_variants) || variants.length > 0,

    variants,

    variantOptions,

    defaultVariant,

    barcode:
      product.barcode || "",

    weight:
      product.weight === null || product.weight === undefined
        ? null
        : Number(product.weight) || null,

    weightUnit:
      product.weightUnit || product.weight_unit || "",

    dimensions:
      parseMaybeJson(product.dimensions, product.dimensions || null),

    specifications:
      parseMaybeJson(product.specifications, product.specifications || null),

    tags: tagNames.map((item) => String(item || "").trim()).filter(Boolean),

    tagSlugs: tagSlugs.map((item) => String(item || "").trim()).filter(Boolean),
  };
}

export function slugifyPath(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export function productPath(product) {
  const slug = product?.slug || product?.productSlug || product?.product_slug;
  const suffix = slug || [slugifyPath(product?.name), product?.id].filter(Boolean).join("-");
  return `/product/${encodeURIComponent(suffix || product?.id || "")}`;
}

export function pushDataLayer(event, payload = {}) {
  if (typeof window === "undefined" || !event) {
    return;
  }

  const eventId = payload.event_id || window.crypto?.randomUUID?.() || `${event}-${Date.now()}`;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event, event_id: eventId, ...payload });
}

export function analyticsItem(product, quantity = 1) {
  return {
    item_id: String(product?.sku || product?.id || ""),
    item_name: product?.name || "",
    item_brand: product?.brandName || product?.brand || "",
    item_category: product?.categoryName || "",
    price: Number(product?.price || 0),
    quantity: Number(quantity || 1),
  };
}

export function sanitiseUser(
  user
) {
  if (!user) {
    return null;
  }

  const safeUser = { ...user };
  delete safeUser.otp;
  delete safeUser.password;

  return safeUser;
}

export function formatCurrency(
  amount
) {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }
  ).format(Number(amount) || 0);
}

export function formatDate(value) {
  const date = value
    ? new Date(value)
    : new Date();

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

export async function getProducts(
  options
) {
  const params = new URLSearchParams();

  if (typeof options === "number" || typeof options === "string") {
    if (options) {
      params.set("category", options);
    }
  } else if (options && typeof options === "object") {
    Object.entries(options).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length) {
        params.set(key, value.join(","));
      } else if (value !== undefined && value !== null && value !== "") {
        params.set(key, value);
      }
    });
  }

  const query = params.toString() ? `?${params.toString()}` : "";

  const payload =
    await request(
      `/products${query}`
    );

  return Array.isArray(payload)
    ? payload.map(
        normaliseProduct
      )
    : [];
}

export async function getProductById(
  productId
) {
  let payload;

  try {
    payload = await request(`/products/${productId}`);
  } catch (error) {
    const identifier = String(productId || "").trim();
    const trailingNumber = identifier.match(/-(\d+)$/)?.[1];
    const candidates = [trailingNumber].filter(Boolean);

    for (const candidate of candidates) {
      try {
        payload = await request(`/products/${candidate}`);
        break;
      } catch {
        // Try the next fallback before surfacing the original error.
      }
    }

    if (!payload) {
      const searchTerm = identifier.replace(/-\d+$/, "").replace(/-/g, " ");
      const matches = searchTerm ? await getProducts({ q: searchTerm, limit: 12 }).catch(() => []) : [];
      const normalizedIdentifier = slugifyPath(identifier);
      const matchedProduct = matches.find((item) => {
        const values = [
          item.id,
          item.slug,
          item.sku,
          item.variantSku,
          item.name,
        ].map((value) => slugifyPath(value));
        return values.includes(normalizedIdentifier) || values.some((value) => value && normalizedIdentifier.endsWith(value));
      });

      if (matchedProduct) {
        return getProductById(matchedProduct.id);
      }

      throw error;
    }
  }

  return normaliseProduct(
    payload
  );
}

export async function getVariantFilters() {
  const payload = await request("/products/variant-filters");
  return Array.isArray(payload?.filters) ? payload.filters : [];
}

export async function getCategories() {
  const payload =
    await request(
      "/categories"
    );

  return Array.isArray(payload)
    ? payload.map((item) => ({
        ...item,

        id: Number(item.id),

        name:
          item.name ||
          item.category_name ||
          item.categoryName ||
          item.title ||
          "Uncategorized",
      }))
    : [];
}

function mapBrandRecords(brands) {
  return (brands || []).map((brand) => ({
    ...brand,
    logo: brand.logo ? buildImageUrl(brand.logo) : "",
    banner: brand.banner ? buildImageUrl(brand.banner) : "",
  }));
}

export async function getBrands(options = {}) {
  const params = new URLSearchParams();
  const explicitPage = options.page !== undefined && options.page !== null && options.page !== "";

  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  if (!params.has("limit")) {
    params.set("limit", "500");
  }

  if (!explicitPage) {
    params.set("page", "1");
  }

  const payload = await request(`/brands?${params.toString()}`);
  let brands = mapBrandRecords(payload?.brands);
  let pagination = payload?.pagination;
  let page = Number(pagination?.page || params.get("page") || 1);

  if (!explicitPage) {
    while (hasAnotherBrandPage(pagination, brands.length) && page < 20) {
      page += 1;
      params.set("page", String(page));

      try {
        const nextPayload = await request(`/brands?${params.toString()}`);
        const merged = appendUniqueBrands(brands, mapBrandRecords(nextPayload?.brands));
        if (!merged.added) break;
        brands = merged.brands;
        pagination = nextPayload?.pagination || pagination;
      } catch {
        break;
      }
    }
  }

  return brands;
}

export async function getFeaturedBrands(limit = 8) {
  const payload = await request(`/brands/featured?limit=${limit}`);
  return (payload?.brands || []).map((brand) => ({
    ...brand,
    logo: brand.logo ? buildImageUrl(brand.logo) : "",
    banner: brand.banner ? buildImageUrl(brand.banner) : "",
  }));
}

export async function getBrandBySlug(slug) {
  const payload = await request(`/brands/${encodeURIComponent(slug)}`);
  return {
    brand: payload?.brand
      ? {
          ...payload.brand,
          logo: payload.brand.logo ? buildImageUrl(payload.brand.logo) : "",
          banner: payload.brand.banner ? buildImageUrl(payload.brand.banner) : "",
        }
      : null,
    products: Array.isArray(payload?.products) ? payload.products.map(normaliseProduct) : [],
  };
}

export async function getTags(options = {}) {
  const params = new URLSearchParams();

  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const payload = await request(`/tags${params.toString() ? `?${params.toString()}` : ""}`);
  return payload?.tags || [];
}

export async function getCollections(options = {}) {
  const params = new URLSearchParams();

  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const payload = await request(`/collections${params.toString() ? `?${params.toString()}` : ""}`);
  return (payload?.collections || []).map((collection) => ({
    ...collection,
    banner: collection.banner ? buildImageUrl(collection.banner) : "",
  }));
}

export async function getCollectionBySlug(slug, options = {}) {
  const params = new URLSearchParams();

  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const payload = await request(`/collections/${encodeURIComponent(slug)}${params.toString() ? `?${params.toString()}` : ""}`);
  return {
    collection: payload?.collection
      ? {
          ...payload.collection,
          banner: payload.collection.banner ? buildImageUrl(payload.collection.banner) : "",
        }
      : null,
    products: Array.isArray(payload?.products) ? payload.products.map(normaliseProduct) : [],
  };
}

export async function getNavbarMenu() {
  const payload = await request("/menus/navbar");
  return Array.isArray(payload?.menus) ? payload.menus : [];
}

export async function getGoogleReviews() {
  const payload = await request("/google-reviews");

  return {
    source: payload?.source || "fallback",
    placeName: payload?.placeName || "Golden Creation",
    rating: Number(payload?.rating || 0),
    reviewCount: Number(payload?.reviewCount || 0),
    googleMapsUrl:
      payload?.googleMapsUrl ||
      "https://www.google.com/maps/search/?api=1&query=Golden%20Creation%20Gurugram",
    reviews: Array.isArray(payload?.reviews) ? payload.reviews : [],
  };
}

export async function getBundles(options = {}) {
  const params = new URLSearchParams();

  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  });

  const payload = await request(`/bundles${params.toString() ? `?${params.toString()}` : ""}`);
  return (payload?.bundles || []).map((bundle) => ({
    ...bundle,
    image: bundle.image ? buildImageUrl(bundle.image) : "",
    imageUrl: bundle.image ? buildImageUrl(bundle.image) : "",
    items: Array.isArray(bundle.items)
      ? bundle.items.map((item) => ({
          ...item,
          imageUrl: item.imageUrl ? buildImageUrl(item.imageUrl) : "",
        }))
      : [],
  }));
}

export async function getBundleBySlug(slug) {
  const payload = await request(`/bundles/${encodeURIComponent(slug)}`);
  const bundle = payload?.bundle || null;

  if (!bundle) return null;

  return {
    ...bundle,
    image: bundle.image ? buildImageUrl(bundle.image) : "",
    imageUrl: bundle.image ? buildImageUrl(bundle.image) : "",
    items: Array.isArray(bundle.items)
      ? bundle.items.map((item) => ({
          ...item,
          imageUrl: item.imageUrl ? buildImageUrl(item.imageUrl) : "",
        }))
      : [],
  };
}

export async function submitCorporateEnquiry(enquiry) {
  const recaptchaToken =
    await getRecaptchaToken(
      "corporate_enquiry"
    );

  return request("/corporate/enquiries", {
    method: "POST",
    body: JSON.stringify({
      ...enquiry,
      recaptchaToken,
    }),
  });
}

export async function getStoreTaxRules() {
  const payload =
    await request(
      "/store/tax-rules"
    );

  return Array.isArray(payload?.rules)
    ? payload.rules
    : [];
}

export async function sendEmailOtp(
  email
) {
  const recaptchaToken =
    await getRecaptchaToken(
      "otp_request"
    );

  return request(
    "/auth/send-otp",
    {
      method: "POST",

      body: JSON.stringify({
        email,
        recaptchaToken,
      }),
    }
  );
}

export function verifyEmailOtp(
  email,
  otp
) {
  return request(
    "/auth/verify-otp",
    {
      method: "POST",

      body: JSON.stringify({
        email,
        otp,
      }),
    }
  );
}

export async function sendMobileOtp(
  phone
) {
  const recaptchaToken =
    await getRecaptchaToken(
      "otp_request"
    );

  return request(
    "/auth/send-otp-mobile",
    {
      method: "POST",

      body: JSON.stringify({
        phone,
        recaptchaToken,
      }),
    }
  ).then((payload) => {
    saveCustomerSession(payload);
    return payload;
  });
}

export function verifyMobileOtp(
  phone,
  otp
) {
  return request(
    "/auth/verify-otp-mobile",
    {
      method: "POST",

      body: JSON.stringify({
        phone,
        otp,
      }),
    }
  ).then((payload) => {
    saveCustomerSession(payload);
    return payload;
  });
}

export function startGoogleLogin(redirectTo = "/") {
  const params = new URLSearchParams({
    redirectTo,
  });

  window.location.href = `${API_BASE_URL}/auth/google?${params.toString()}`;
}

export async function completeGoogleLogin(token) {
  const payload =
    await request(
      "/auth/google/session",
      {
        method: "POST",
        body: JSON.stringify({
          token,
        }),
      }
    );

  saveCustomerSession(payload);
  return sanitiseUser(payload?.user || null);
}

export function getCustomerState() {
  return request("/customer/state", { authenticated: true });
}

export function upsertCustomerCartItem(cartKey, item) {
  return request(`/customer/cart/items/${encodeURIComponent(cartKey)}`, {
    method: "PUT",
    authenticated: true,
    body: JSON.stringify(item),
  });
}

export function removeCustomerCartItem(cartKey) {
  return request(`/customer/cart/items/${encodeURIComponent(cartKey)}`, {
    method: "DELETE",
    authenticated: true,
  });
}

export function clearCustomerCart() {
  return request("/customer/cart", {
    method: "DELETE",
    authenticated: true,
  });
}

export function addCustomerWishlistItem(productId) {
  return request(`/customer/wishlist/${productId}`, {
    method: "PUT",
    authenticated: true,
    body: "{}",
  });
}

export function removeCustomerWishlistItem(productId) {
  return request(`/customer/wishlist/${productId}`, {
    method: "DELETE",
    authenticated: true,
  });
}

export function createCustomerAddress(address) {
  return request("/customer/addresses", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify(address),
  });
}

export function updateCustomerAddress(id, address) {
  return request(`/customer/addresses/${id}`, {
    method: "PUT",
    authenticated: true,
    body: JSON.stringify(address),
  });
}

export function removeCustomerAddress(id) {
  return request(`/customer/addresses/${id}`, {
    method: "DELETE",
    authenticated: true,
  });
}

export function setDefaultCustomerAddress(id) {
  return request(`/customer/addresses/${id}/default`, {
    method: "PUT",
    authenticated: true,
    body: "{}",
  });
}

export async function logoutCustomerSession() {
  const session = readCustomerSession();
  try {
    await request("/customer/session/logout", {
      method: "POST",
      authenticated: true,
      body: JSON.stringify({ refreshToken: session?.refreshToken || "" }),
    });
  } finally {
    clearCustomerSession();
  }
}

export async function uploadMedia(file, folder = "customer") {
  if (!file) {
    throw new Error("File is required");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  formData.append(
    "recaptchaToken",
    await getRecaptchaToken(
      "media_upload"
    )
  );

  const response = await fetch(
    `${API_BASE_URL}/media/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || "Unable to upload file");
  }

  return payload.media;
}

export async function submitContactEnquiry(enquiry) {
  const recaptchaToken =
    await getRecaptchaToken(
      "contact_enquiry"
    );

  return request("/contact/enquiries", {
    method: "POST",
    body: JSON.stringify({
      ...enquiry,
      recaptchaToken,
    }),
  });
}

export async function getUserProfile() {
  const payload = await request("/auth/me", {
    authenticated: true,
  });

  return sanitiseUser(
    payload?.user || null
  );
}

export async function updateUserProfile({
  name,
  email,
  phone,
  profileImage,
}) {
  const body = {
    name,
    email: email || null,
    phone: phone || null,
  };
  if (profileImage !== undefined) {
    body.profileImage = profileImage;
  }
  const payload =
    await request(
      "/auth/me",
      {
        method: "PUT",
        authenticated: true,
        body: JSON.stringify(body),
      }
    );

  return sanitiseUser(
    payload?.user || null
  );
}

/* ORDERS */

export async function createOrder(order) {
  const authenticated = Boolean(readCustomerSession()?.accessToken);
  const referralAttribution = order?.referralAttribution || getStoredReferralAttribution();
  const payload =
    await request(
      authenticated ? "/customer/orders" : "/orders",
      {
        method: "POST",
        authenticated,
        headers: order.idempotencyKey ? { "Idempotency-Key": order.idempotencyKey } : {},
        body: JSON.stringify(
          {
            ...order,
            referralAttribution,
          }
        ),
      }
    );

  return payload?.order || null;
}

export async function getCustomerOrders() {
  const payload = await request("/customer/orders", {
    authenticated: true,
  });

  return payload?.orders || [];
}

export async function removeUserProfileImage() {
  const payload = await request("/auth/me/image", {
    method: "DELETE",
    authenticated: true,
  });
  return sanitiseUser(payload?.user || null);
}

export async function getCheckoutQuote(payload) {
  const response = await request("/customer/checkout/quote", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify({
      ...payload,
      referralAttribution: payload?.referralAttribution || getStoredReferralAttribution(),
    }),
  });
  return response.quote;
}

export async function createRazorpayCheckoutOrder(payload) {
  const response = await request("/customer/checkout/payments/razorpay/order", {
    method: "POST",
    authenticated: true,
    headers: payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {},
    body: JSON.stringify({
      ...payload,
      referralAttribution: payload?.referralAttribution || getStoredReferralAttribution(),
    }),
  });
  return response.order;
}

export async function getCustomerReferralSummary() {
  return request("/customer/referrals/summary", {
    authenticated: true,
  });
}

export async function getCustomerReferralLedger(limit = 100) {
  return request(`/customer/referrals/ledger?limit=${encodeURIComponent(limit)}`, {
    authenticated: true,
  });
}

export async function getCustomerPayoutMethods() {
  const payload = await request("/customer/wallet/payout-methods", {
    authenticated: true,
  });
  return payload?.methods || [];
}

export async function saveCustomerPayoutMethod(method) {
  return request("/customer/wallet/payout-methods", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify(method),
  });
}

export async function deleteCustomerPayoutMethod(id) {
  return request(`/customer/wallet/payout-methods/${encodeURIComponent(id)}`, {
    method: "DELETE",
    authenticated: true,
  });
}

export async function requestCustomerWithdrawal(amount) {
  return request("/customer/wallet/withdrawals", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify({ amount }),
  });
}

export async function getCustomerWithdrawals() {
  const payload = await request("/customer/wallet/withdrawals", {
    authenticated: true,
  });
  return payload?.withdrawals || [];
}

export async function submitAffiliateApplication(application) {
  return request("/affiliate/applications", {
    method: "POST",
    body: JSON.stringify(application),
  });
}

export async function verifyRazorpayCheckoutPayment(payload) {
  const response = await request("/customer/checkout/payments/razorpay/verify", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify(payload),
  });
  return response.order;
}

export async function subscribeNewsletter(email, source = "website") {
  return request("/newsletter/subscribe", {
    method: "POST",
    body: JSON.stringify({ email, source }),
  });
}

export async function getBlogPosts(filters = {}) {
  const params = new URLSearchParams(filters);
  const payload = await request(`/blog${params.toString() ? `?${params.toString()}` : ""}`);
  return payload || { posts: [], featured: null, pagination: {} };
}

export async function getBlogPost(slug) {
  const payload = await request(`/blog/${encodeURIComponent(slug)}`);
  return payload?.post || null;
}

export async function createReturnRequest(payload) {
  return request("/customer/returns", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify(payload),
  });
}

export async function getCustomerReturns() {
  const payload = await request("/customer/returns", {
    authenticated: true,
  });
  return payload?.requests || [];
}

export async function validateCartDiscount(payload) {
  return request(
    "/discounts/validate",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getProductReviews(productId) {
  const payload =
    await request(
      `/products/${productId}/reviews`
    );

  return {
    averageRating:
      Number(payload?.averageRating || 0),
    reviewCount:
      Number(payload?.reviewCount || 0),
    reviews:
      Array.isArray(payload?.reviews)
        ? payload.reviews
        : [],
  };
}

export async function submitProductReview(productId, review) {
  return request(
    `/customer/products/${productId}/reviews`,
    {
      method: "POST",
      authenticated: true,
      body: JSON.stringify(review),
    }
  );
}

export async function downloadOrderInvoice(orderNumber) {
  async function download(retried = false) {
    const session = readCustomerSession();
    const response = await fetch(
      `${API_BASE_URL}/customer/orders/${encodeURIComponent(orderNumber)}/invoice`,
      {
        headers: session?.accessToken
          ? { Authorization: `Bearer ${session.accessToken}` }
          : {},
      }
    );
    if (response.status === 401 && !retried && await refreshCustomerSession()) {
      return download(true);
    }
    return response;
  }

  const response = await download();

  if (!response.ok) {
    let message = "Failed to download invoice";

    try {
      const payload = await response.json();
      message = payload?.message || message;
    } catch {
      // Keep the generic message for non-JSON error responses.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${orderNumber}-invoice.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ADMIN ORDERS */

export async function getAdminOrders() {
  const token =
    localStorage.getItem(
      "admin_token"
    );

  return request(
    "/admin/orders",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

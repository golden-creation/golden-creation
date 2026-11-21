const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

function isLoopbackApiUrl(value) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api\/?$/i.test(
    String(value || "")
  );
}

export const API_BASE_URL = (
  typeof window !== "undefined" &&
  configuredBaseUrl &&
  isLoopbackApiUrl(configuredBaseUrl) &&
  !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(window.location.origin)
    ? "/api"
    : configuredBaseUrl || "/api"
).replace(/\/$/, "");

export const ADMIN_TOKEN_KEY = "lekhanmart_admin_token";
export const ADMIN_USER_KEY = "lekhanmart_admin_user";

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getStoredAdmin() {
  const value = localStorage.getItem(ADMIN_USER_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function storeAdminSession(token, admin) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(admin));
  window.dispatchEvent(new CustomEvent("admin-session-updated", { detail: admin }));
}

export function updateStoredAdmin(adminPatch) {
  const current = getStoredAdmin() || {};
  const next = { ...current, ...adminPatch };

  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("admin-session-updated", { detail: next }));

  return next;
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getAdminToken();
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  const text = await response.text();

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message:
          response.status === 404
            ? "Backend API route not found. Make sure the backend is running on port 5000."
            : text.slice(0, 160),
      };
    }
  }

  if (!response.ok) {
    const publicAdminAuthPath = [
      "/admin/login",
      "/admin/login/verify-otp",
      "/admin/password-reset/request",
      "/admin/password-reset/verify",
      "/affiliate/login",
    ].includes(path);

    if (response.status === 401 && !publicAdminAuthPath) {
      clearAdminSession();
      window.location.href = `${import.meta.env.BASE_URL}login`;
    }

    throw new Error(data?.message || "Request failed");
  }

  return data;
}

export function getAssetUrl(imageName) {
  if (!imageName) {
    return "";
  }

  if (/^https?:\/\//i.test(imageName) || imageName.startsWith("blob:")) {
    return imageName;
  }

  const normalizedImageName = String(imageName)
    .replace(/^\/?images\//i, "")
    .replace(/^\/+/, "");

  return `${API_BASE_URL.replace(/\/api$/, "")}/images/${normalizedImageName}`;
}

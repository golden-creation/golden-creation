import { verifyRecaptchaToken } from "../services/recaptcha.service.js";
import { verifyMobileIntegrity } from "../services/play-integrity.service.js";

const mobileOtpAttempts = new Map();

function cleanString(value) {
  return String(value || "").trim();
}

function getBoolEnv(name, fallback = false) {
  const value = cleanString(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || "";
}

function getMobileAppKey(req) {
  return cleanString(
    req.headers["x-gc-mobile-app-key"] ||
      req.headers["x-mobile-app-key"] ||
      req.body?.mobileAppKey ||
      req.query?.mobileAppKey
  );
}

function isTrustedMobileClient(req) {
  const configuredKey = cleanString(process.env.MOBILE_APP_API_KEY);
  if (!configuredKey) return false;
  return getMobileAppKey(req) === configuredKey;
}

function checkMobileOtpRateLimit(req, action) {
  const windowMs = Number(process.env.MOBILE_OTP_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000);
  const maxAttempts = Number(process.env.MOBILE_OTP_RATE_LIMIT_MAX || 5);
  const now = Date.now();
  const identity = cleanString(req.body?.phone || req.body?.email || getClientIp(req));
  const key = `${action}:${identity}`;
  const attempts = (mobileOtpAttempts.get(key) || []).filter((time) => now - time < windowMs);

  if (attempts.length >= maxAttempts) {
    mobileOtpAttempts.set(key, attempts);
    return false;
  }

  attempts.push(now);
  mobileOtpAttempts.set(key, attempts);
  return true;
}

export function requireRecaptcha(action, options = {}) {
  const minScore = Number(options.minScore ?? process.env.RECAPTCHA_MIN_SCORE ?? 0.5);
  const allowMobileApp =
    Boolean(options.allowMobileApp) ||
    getBoolEnv("ALLOW_MOBILE_APP_OTP_WITH_KEY", true);

  return async (req, res, next) => {
    try {
      const isMobileRequest =
        cleanString(req.headers["x-gc-client"]).toLowerCase() === "mobile";

      if (allowMobileApp && isMobileRequest) {
        if (!checkMobileOtpRateLimit(req, action)) {
          return res.status(429).json({
            message: "Too many OTP requests. Please try again later.",
          });
        }

        const integrity = await verifyMobileIntegrity(req);
        if (!integrity.ok) {
          return res.status(403).json({ message: integrity.reason });
        }
        req.mobileIntegrity = integrity;
        next();
        return;
      }

      if (allowMobileApp && isTrustedMobileClient(req) && process.env.NODE_ENV !== "production") {
        next();
        return;
      }

      const token =
        req.body?.recaptchaToken ||
        req.body?.recaptcha_token ||
        req.query?.recaptchaToken ||
        req.headers["x-recaptcha-token"];

      const result = await verifyRecaptchaToken({
        token,
        action,
        minScore,
        remoteIp: getClientIp(req),
      });

      req.recaptcha = result;

      if (!result.ok) {
        return res.status(403).json({
          message: result.reason || "reCAPTCHA verification failed",
        });
      }

      next();
    } catch (error) {
      res.status(403).json({
        message: error.message || "reCAPTCHA verification failed",
      });
    }
  };
}

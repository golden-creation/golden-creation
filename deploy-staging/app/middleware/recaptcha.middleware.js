import { verifyRecaptchaToken } from "../services/recaptcha.service.js";

function getClientIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || "";
}

export function requireRecaptcha(action, options = {}) {
  const minScore = Number(options.minScore ?? process.env.RECAPTCHA_MIN_SCORE ?? 0.5);

  return async (req, res, next) => {
    try {
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

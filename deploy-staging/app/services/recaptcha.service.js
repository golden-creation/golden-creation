function cleanString(value) {
  return String(value || "").trim();
}

export function isRecaptchaConfigured() {
  return Boolean(cleanString(process.env.RECAPTCHA_SECRET_KEY));
}

export async function verifyRecaptchaToken({
  token,
  action,
  remoteIp,
  minScore = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5),
}) {
  const secret = cleanString(process.env.RECAPTCHA_SECRET_KEY);

  if (!secret) {
    return {
      ok: true,
      skipped: true,
      reason: "reCAPTCHA is not configured",
    };
  }

  if (!token) {
    return {
      ok: false,
      reason: "reCAPTCHA token is required",
    };
  }

  const params = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    params.set("remoteip", remoteIp);
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = await response.json();
  const score = Number(payload.score ?? 0);
  const tokenAction = cleanString(payload.action);

  if (!payload.success) {
    return {
      ok: false,
      score,
      action: tokenAction,
      reason: "reCAPTCHA verification failed",
      errors: payload["error-codes"] || [],
    };
  }

  if (action && tokenAction && tokenAction !== action) {
    return {
      ok: false,
      score,
      action: tokenAction,
      reason: "reCAPTCHA action mismatch",
    };
  }

  if (Number.isFinite(minScore) && score < minScore) {
    return {
      ok: false,
      score,
      action: tokenAction,
      reason: "Suspicious activity detected",
    };
  }

  return {
    ok: true,
    score,
    action: tokenAction,
  };
}

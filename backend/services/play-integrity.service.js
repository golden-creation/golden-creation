import crypto from "crypto";
import { GoogleAuth } from "google-auth-library";

function cleanString(value) {
  return String(value || "").trim();
}

function boolEnv(name, fallback = false) {
  const value = cleanString(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(cleanString(left));
  const rightBuffer = Buffer.from(cleanString(right));
  return (
    leftBuffer.length > 0 &&
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function canonicalOtpRequest(body = {}) {
  return JSON.stringify({
    action: "otp_request",
    phone: cleanString(body.phone),
    nonce: cleanString(body.integrityNonce),
  });
}

export function normalizeCertificateDigest(value) {
  const digest = cleanString(value);
  if (!digest) return "";
  const hex = digest.replaceAll(":", "");
  if (/^[a-f0-9]{64}$/i.test(hex)) {
    return Buffer.from(hex, "hex").toString("base64url");
  }
  return digest.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function otpRequestHash(body) {
  return crypto.createHash("sha256").update(canonicalOtpRequest(body)).digest("base64url");
}

export async function verifyMobileIntegrity(req) {
  const debugAllowed =
    process.env.NODE_ENV !== "production" &&
    boolEnv("ALLOW_DEBUG_MOBILE_ATTESTATION", true);
  const productionTestAllowed =
    process.env.NODE_ENV === "production" &&
    boolEnv("ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION", false);
  const configuredDebugKey = cleanString(process.env.MOBILE_APP_API_KEY);
  const suppliedDebugKey = cleanString(
    req.headers["x-gc-mobile-app-key"] || req.body?.mobileAppKey
  );
  if (
    (debugAllowed || productionTestAllowed) &&
    secureEqual(configuredDebugKey, suppliedDebugKey)
  ) {
    return {
      ok: true,
      debug: debugAllowed,
      productionTest: productionTestAllowed,
    };
  }

  const token = cleanString(req.body?.integrityToken);
  const cloudProjectNumber = cleanString(process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER);
  const packageName = cleanString(process.env.ANDROID_PACKAGE_NAME || "in.goldencreation.app");
  const allowedCertificates = cleanString(process.env.ANDROID_CERT_SHA256)
    .split(",")
    .map(normalizeCertificateDigest)
    .filter(Boolean);
  if (!token || !cloudProjectNumber) {
    return { ok: false, reason: "Mobile app verification is required" };
  }
  if (process.env.NODE_ENV === "production" && allowedCertificates.length === 0) {
    return { ok: false, reason: "Mobile signing certificate is not configured" };
  }

  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/playintegrity"],
  });
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access.token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": cloudProjectNumber,
      },
      body: JSON.stringify({ integrity_token: token }),
    }
  );
  const decoded = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, reason: "Unable to verify this app installation" };
  }

  const payload = decoded.tokenPayloadExternal || {};
  const requestDetails = payload.requestDetails || {};
  const appIntegrity = payload.appIntegrity || {};
  const deviceIntegrity = payload.deviceIntegrity || {};
  const verdicts = Array.isArray(deviceIntegrity.deviceRecognitionVerdict)
    ? deviceIntegrity.deviceRecognitionVerdict
    : [];
  const timestamp = Number(requestDetails.timestampMillis || 0);
  const recent = timestamp > 0 && Math.abs(Date.now() - timestamp) < 2 * 60 * 1000;
  const expectedHash = otpRequestHash(req.body);
  const certificateDigests = Array.isArray(appIntegrity.certificateSha256Digest)
    ? appIntegrity.certificateSha256Digest.map(normalizeCertificateDigest)
    : [];
  const certificateAllowed =
    allowedCertificates.length === 0 ||
    certificateDigests.some((digest) => allowedCertificates.includes(digest));

  if (
    requestDetails.requestPackageName !== packageName ||
    requestDetails.requestHash !== expectedHash ||
    !recent ||
    appIntegrity.appRecognitionVerdict !== "PLAY_RECOGNIZED" ||
    !certificateAllowed ||
    !verdicts.includes("MEETS_DEVICE_INTEGRITY")
  ) {
    return { ok: false, reason: "Mobile app verification failed" };
  }

  return { ok: true, payload };
}

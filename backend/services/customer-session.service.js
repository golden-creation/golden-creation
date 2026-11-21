import crypto from "crypto";
import jwt from "jsonwebtoken";

import { dbQuery } from "./commerce.service.js";

const accessMinutes = Math.max(5, Number(process.env.CUSTOMER_ACCESS_TOKEN_MINUTES || 15));
const refreshDays = Math.max(1, Number(process.env.CUSTOMER_REFRESH_TOKEN_DAYS || 30));

function jwtSecret() {
  return process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || "local_dev_secret_change_before_deploy";
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    profile_image: user.profile_image || "",
    is_verified: Boolean(user.is_verified),
  };
}

function accessTokenFor(user, sessionId) {
  return jwt.sign(
    {
      type: "customer_access",
      sub: String(user.id),
      sid: String(sessionId),
    },
    jwtSecret(),
    { expiresIn: `${accessMinutes}m` }
  );
}

function sessionPayload(user, sessionId, refreshToken, refreshExpiresAt) {
  const accessExpiresAt = new Date(Date.now() + accessMinutes * 60 * 1000);
  return {
    user: publicUser(user),
    session: {
      accessToken: accessTokenFor(user, sessionId),
      refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    },
  };
}

export async function issueCustomerSession(user, metadata = {}) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
  const result = await dbQuery(
    `INSERT INTO customer_sessions
      (user_id, refresh_token_hash, device_name, device_id, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(user.id),
      hashToken(refreshToken),
      String(metadata.deviceName || "").slice(0, 160) || null,
      String(metadata.deviceId || "").slice(0, 190) || null,
      String(metadata.ipAddress || "").slice(0, 64) || null,
      String(metadata.userAgent || "").slice(0, 500) || null,
      refreshExpiresAt,
    ]
  );
  return sessionPayload(user, result.insertId, refreshToken, refreshExpiresAt);
}

export async function rotateCustomerSession(refreshToken, metadata = {}) {
  const rows = await dbQuery(
    `SELECT cs.id AS session_id, cs.user_id, cs.expires_at, u.*
       FROM customer_sessions cs
       JOIN users u ON u.id = cs.user_id
      WHERE cs.refresh_token_hash = ?
        AND cs.revoked_at IS NULL
        AND cs.expires_at > NOW()
      LIMIT 1`,
    [hashToken(refreshToken)]
  );
  const row = rows[0];
  if (!row) {
    const error = new Error("Refresh session is invalid or expired");
    error.statusCode = 401;
    throw error;
  }

  const nextRefreshToken = crypto.randomBytes(48).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
  await dbQuery(
    `UPDATE customer_sessions
        SET refresh_token_hash = ?,
            expires_at = ?,
            last_used_at = NOW(),
            ip_address = COALESCE(?, ip_address),
            user_agent = COALESCE(?, user_agent)
      WHERE id = ?`,
    [
      hashToken(nextRefreshToken),
      refreshExpiresAt,
      String(metadata.ipAddress || "").slice(0, 64) || null,
      String(metadata.userAgent || "").slice(0, 500) || null,
      row.session_id,
    ]
  );
  return sessionPayload(row, row.session_id, nextRefreshToken, refreshExpiresAt);
}

export async function revokeCustomerSession({ refreshToken, sessionId, userId }) {
  if (refreshToken) {
    await dbQuery(
      "UPDATE customer_sessions SET revoked_at = NOW() WHERE refresh_token_hash = ?",
      [hashToken(refreshToken)]
    );
    return;
  }
  if (sessionId && userId) {
    await dbQuery(
      "UPDATE customer_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ?",
      [Number(sessionId), Number(userId)]
    );
  }
}

export function verifyCustomerAccessToken(token) {
  const payload = jwt.verify(token, jwtSecret());
  if (payload.type !== "customer_access" || !payload.sub || !payload.sid) {
    throw new Error("Invalid customer access token");
  }
  return payload;
}

export { publicUser };

import { dbQuery } from "../services/commerce.service.js";
import { verifyCustomerAccessToken } from "../services/customer-session.service.js";

function bearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function requireCustomer(req, res, next) {
  try {
    const payload = verifyCustomerAccessToken(bearerToken(req));
    const rows = await dbQuery(
      `SELECT u.id, u.name, u.email, u.phone, u.profile_image, u.is_verified
         FROM customer_sessions cs
         JOIN users u ON u.id = cs.user_id
        WHERE cs.id = ?
          AND cs.user_id = ?
          AND cs.revoked_at IS NULL
          AND cs.expires_at > NOW()
        LIMIT 1`,
      [Number(payload.sid), Number(payload.sub)]
    );
    if (!rows.length) {
      return res.status(401).json({ message: "Customer session has expired" });
    }
    req.customer = rows[0];
    req.customerSessionId = Number(payload.sid);
    next();
  } catch {
    res.status(401).json({ message: "Authentication is required" });
  }
}

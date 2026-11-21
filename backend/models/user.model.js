import db from "../config/db.js";

function otpUpdateArgs(expiresAt, callback) {
  if (typeof expiresAt === "function") {
    return {
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      callback: expiresAt,
    };
  }

  return {
    expiresAt: expiresAt || new Date(Date.now() + 10 * 60 * 1000),
    callback,
  };
}

export const User = {
  // 🔍 Find user by email
  findByEmail: (email, callback) => {
    db.query("SELECT * FROM users WHERE email = ?", [email], callback);
  },

  // 🔍 Find by phone
  findByPhone: (phone, callback) => {
    db.query("SELECT * FROM users WHERE phone = ?", [phone], callback);
  },

  // ➕ Create new user
  create: (data, callback) => {
    const sql = `
      INSERT INTO users (name, email, phone, otp, otp_expires_at, is_verified)
      VALUES (?, ?, ?, ?, ?, false)
    `;
    db.query(
      sql,
      [
        data.name,
        data.email,
        data.phone,
        data.otp,
        data.otpExpiresAt || new Date(Date.now() + 10 * 60 * 1000),
      ],
      callback
    );
  },

  // 🔁 Update EMAIL OTP
  updateOtp: (email, otp, expiresAt, callback) => {
    const args = otpUpdateArgs(expiresAt, callback);
    db.query(
      "UPDATE users SET otp = ?, otp_expires_at = ? WHERE email = ?",
      [otp, args.expiresAt, email],
      args.callback
    );
  },

  // 🔁 Update MOBILE OTP ✅ FIXED NAME
  updateOtpByPhone: (phone, otp, expiresAt, callback) => {
    const args = otpUpdateArgs(expiresAt, callback);
    db.query(
      "UPDATE users SET otp = ?, otp_expires_at = ? WHERE phone = ?",
      [otp, args.expiresAt, phone],
      args.callback
    );
  },

  // ✅ Verify EMAIL
  verifyOtp: (email, callback) => {
    db.query(
      "UPDATE users SET is_verified = true, otp = NULL, otp_expires_at = NULL WHERE email = ?",
      [email],
      callback
    );
  },

  // ✅ Verify MOBILE ✅ FIXED NAME
  verifyOtpByPhone: (phone, callback) => {
    db.query(
      "UPDATE users SET is_verified = true, otp = NULL, otp_expires_at = NULL WHERE phone = ?",
      [phone],
      callback
    );
  },

  // 🔍 Google user
  findByGoogleId: (google_id, callback) => {
    db.query(
      "SELECT * FROM users WHERE google_id = ?",
      [google_id],
      callback
    );
  },

  // ➕ Create Google user
  createGoogleUser: (data, callback) => {
    const sql = `
      INSERT INTO users (name, email, google_id, is_verified)
      VALUES (?, ?, ?, true)
    `;
    db.query(sql, [data.name, data.email, data.google_id], callback);
  },

  updateGoogleIdByEmail: (email, google_id, name, callback) => {
    db.query(
      "UPDATE users SET google_id = ?, name = COALESCE(NULLIF(?, ''), name), is_verified = true WHERE email = ?",
      [google_id, name, email],
      callback
    );
  },

  updateProfile: (id, data, callback) => {
    const sql = `
      UPDATE users
      SET name = ?, email = ?, phone = ?,
          profile_image = CASE WHEN ? THEN ? ELSE profile_image END
      WHERE id = ?
    `;

    db.query(
      sql,
      [
        data.name,
        data.email,
        data.phone,
        data.hasProfileImage ? 1 : 0,
        data.profileImage || null,
        id,
      ],
      callback
    );
  },

  findById: (id, callback) => {
    db.query("SELECT * FROM users WHERE id = ?", [id], callback);
  },
};

import db from "../config/db.js";

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
      INSERT INTO users (name, email, phone, otp, is_verified)
      VALUES (?, ?, ?, ?, false)
    `;
    db.query(sql, [data.name, data.email, data.phone, data.otp], callback);
  },

  // 🔁 Update EMAIL OTP
  updateOtp: (email, otp, callback) => {
    db.query(
      "UPDATE users SET otp = ? WHERE email = ?",
      [otp, email],
      callback
    );
  },

  // 🔁 Update MOBILE OTP ✅ FIXED NAME
  updateOtpByPhone: (phone, otp, callback) => {
    db.query(
      "UPDATE users SET otp = ? WHERE phone = ?",
      [otp, phone],
      callback
    );
  },

  // ✅ Verify EMAIL
  verifyOtp: (email, callback) => {
    db.query(
      "UPDATE users SET is_verified = true, otp = NULL WHERE email = ?",
      [email],
      callback
    );
  },

  // ✅ Verify MOBILE ✅ FIXED NAME
  verifyOtpByPhone: (phone, callback) => {
    db.query(
      "UPDATE users SET is_verified = true, otp = NULL WHERE phone = ?",
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
      SET name = ?, email = ?, phone = ?
      WHERE id = ?
    `;

    db.query(sql, [data.name, data.email, data.phone, id], callback);
  },

  findById: (id, callback) => {
    db.query("SELECT * FROM users WHERE id = ?", [id], callback);
  },
};

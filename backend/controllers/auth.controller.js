import { User } from "../models/user.model.js";

// ============================
// ✅ SEND EMAIL OTP
// ============================
export const sendOtp = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  User.findByEmail(email, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length > 0) {
      // UPDATE OTP
      User.updateOtp(email, otp, (err) => {
        if (err) return res.status(500).json({ message: "Error updating OTP" });

        console.log("📧 Email OTP:", otp);

        res.json({
          message: "OTP sent successfully",
          otp, // ✅ SEND TO FRONTEND (TESTING)
        });
      });
    } else {
      // CREATE USER
      User.create(
        { name: "User", email, phone: null, otp },
        (err) => {
          if (err) return res.status(500).json({ message: "Error creating user" });

          console.log("📧 Email OTP:", otp);

          res.json({
            message: "OTP sent successfully",
            otp, // ✅ SEND TO FRONTEND
          });
        }
      );
    }
  });
};

// ============================
// ✅ VERIFY EMAIL OTP
// ============================
export const verifyOtp = (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email & OTP required" });
  }

  User.findByEmail(email, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (!results.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = results[0];

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    User.verifyOtp(email, (err) => {
      if (err) return res.status(500).json({ message: "Verification failed" });

      res.json({
        message: "Login successful",
        user,
      });
    });
  });
};

// ============================
// ✅ MOBILE OTP (NEW 🔥)
// ============================
// ============================
// ✅ SEND OTP (MOBILE)
// ============================
export const sendOtpMobile = (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: "Phone is required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  User.findByPhone(phone, (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (results.length > 0) {
      // update OTP
      User.updateOtpByPhone(phone, otp, (err) => {
        if (err) return res.status(500).json({ message: "Update error" });

        console.log("Mobile OTP:", otp);
        res.json({ message: "OTP sent", otp }); // 👈 send OTP to frontend
      });
    } else {
      // create user
      User.create(
        { name: "User", email: null, phone, otp },
        (err) => {
          if (err) return res.status(500).json({ message: "Create error" });

          console.log("Mobile OTP:", otp);
          res.json({ message: "OTP sent", otp });
        }
      );
    }
  });
};


// ============================
// ✅ VERIFY OTP (MOBILE)
// ============================
export const verifyOtpMobile = (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ message: "Phone & OTP required" });
  }

  User.findByPhone(phone, (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });

    if (!results.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = results[0];

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    User.verifyOtpByPhone(phone, (err) => {
      if (err) return res.status(500).json({ message: "Verify failed" });

      res.json({
        message: "Login success",
        user,
      });
    });
  });
};

// ============================
// ✅ GOOGLE LOGIN
// ============================
export const googleLogin = (req, res) => {
  const { name, email, google_id } = req.body;

  if (!google_id || !email) {
    return res.status(400).json({ message: "Google data missing" });
  }

  User.findByGoogleId(google_id, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (results.length > 0) {
      return res.json({
        message: "Login successful",
        user: results[0],
      });
    }

    User.createGoogleUser({ name, email, google_id }, (err) => {
      if (err) return res.status(500).json({ message: "Error creating user" });

      res.json({
        message: "Google login successful",
      });
    });
  });
};
import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import {
  findMockUser,
  updateMockUser,
  upsertMockEmailOtp,
  upsertMockPhoneOtp,
  verifyMockEmailOtp,
  verifyMockPhoneOtp,
} from "../config/mock-store.js";

function createOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanString(value) {
  return String(value || "").trim();
}

function getFrontendAppUrl() {
  return (
    cleanString(process.env.FRONTEND_APP_URL) ||
    cleanString(process.env.FRONTEND_URL).split(",")[0] ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

function getGoogleRedirectUri() {
  return cleanString(process.env.GOOGLE_REDIRECT_URI) || "http://localhost:5000/api/auth/google/callback";
}

function getGoogleClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGoogleRedirectUri()
  );
}

function signGoogleSession(user) {
  return jwt.sign(
    {
      type: "customer_google_login",
      user,
    },
    process.env.JWT_SECRET || "local_dev_secret_change_before_deploy",
    { expiresIn: "10m" }
  );
}

function safeRedirectPath(value) {
  const path = cleanString(value);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/home";
  return path;
}

function sanitizeUser(user) {
  if (!user) return null;
  const safeUser = { ...user };
  delete safeUser.otp;
  delete safeUser.password;
  return safeUser;
}

export const sendOtp = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const otp = createOtp();

  User.findByEmail(email, (err, results) => {
    if (err) {
      const user = upsertMockEmailOtp(email, otp);
      return res.json({ message: "OTP sent successfully", otp, user });
    }

    if (results.length > 0) {
      User.updateOtp(email, otp, (updateError) => {
        if (updateError) {
          const user = upsertMockEmailOtp(email, otp);
          return res.json({ message: "OTP sent successfully", otp, user });
        }

        res.json({ message: "OTP sent successfully", otp });
      });
      return;
    }

    User.create({ name: "User", email, phone: null, otp }, (createError) => {
      if (createError) {
        const user = upsertMockEmailOtp(email, otp);
        return res.json({ message: "OTP sent successfully", otp, user });
      }

      res.json({ message: "OTP sent successfully", otp });
    });
  });
};

export const verifyOtp = (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email & OTP required" });
  }

  User.findByEmail(email, (err, results) => {
    if (err || !results.length) {
      const fallback = verifyMockEmailOtp(email, otp);

      if (fallback.error) {
        return res.status(fallback.status).json({ message: fallback.error });
      }

      return res.json({ message: "Login successful", user: fallback.user });
    }

    const user = results[0];

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    User.verifyOtp(email, (verifyError) => {
      if (verifyError) {
        const fallback = verifyMockEmailOtp(email, otp);

        if (fallback.error) {
          return res.status(fallback.status).json({ message: fallback.error });
        }

        return res.json({ message: "Login successful", user: fallback.user });
      }

      res.json({ message: "Login successful", user });
    });
  });
};

export const sendOtpMobile = (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: "Phone is required" });
  }

  const otp = createOtp();

  User.findByPhone(phone, (err, results) => {
    if (err) {
      const user = upsertMockPhoneOtp(phone, otp);
      return res.json({ message: "OTP sent", otp, user });
    }

    if (results.length > 0) {
      User.updateOtpByPhone(phone, otp, (updateError) => {
        if (updateError) {
          const user = upsertMockPhoneOtp(phone, otp);
          return res.json({ message: "OTP sent", otp, user });
        }

        res.json({ message: "OTP sent", otp });
      });
      return;
    }

    User.create({ name: "User", email: null, phone, otp }, (createError) => {
      if (createError) {
        const user = upsertMockPhoneOtp(phone, otp);
        return res.json({ message: "OTP sent", otp, user });
      }

      res.json({ message: "OTP sent", otp });
    });
  });
};

export const verifyOtpMobile = (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ message: "Phone & OTP required" });
  }

  User.findByPhone(phone, (err, results) => {
    if (err || !results.length) {
      const fallback = verifyMockPhoneOtp(phone, otp);

      if (fallback.error) {
        return res.status(fallback.status).json({ message: fallback.error });
      }

      return res.json({ message: "Login success", user: fallback.user });
    }

    const user = results[0];

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    User.verifyOtpByPhone(phone, (verifyError) => {
      if (verifyError) {
        const fallback = verifyMockPhoneOtp(phone, otp);

        if (fallback.error) {
          return res.status(fallback.status).json({ message: fallback.error });
        }

        return res.json({ message: "Login success", user: fallback.user });
      }

      res.json({ message: "Login success", user });
    });
  });
};

export const getProfile = (req, res) => {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ message: "Email or phone is required" });
  }

  const fallbackUser = findMockUser({ email, phone });

  const respondFromPhone = () => {
    if (!phone) {
      if (fallbackUser) {
        return res.json({ user: fallbackUser });
      }

      return res.status(404).json({ message: "User not found" });
    }

    User.findByPhone(phone, (phoneError, phoneResults) => {
      if (phoneError || !phoneResults.length) {
        if (fallbackUser) {
          return res.json({ user: fallbackUser });
        }

        return res.status(404).json({ message: "User not found" });
      }

      return res.json({ user: phoneResults[0] });
    });
  };

  if (email) {
    User.findByEmail(email, (emailError, emailResults) => {
      if (!emailError && emailResults.length) {
        return res.json({ user: emailResults[0] });
      }

      return respondFromPhone();
    });

    return;
  }

  respondFromPhone();
};

export const updateProfile = (req, res) => {
  const { id, name, email, phone } = req.body;

  if (!id) {
    return res.status(400).json({ message: "User id is required" });
  }

  if (!String(name || "").trim()) {
    return res.status(400).json({ message: "Name is required" });
  }

  const normalizedEmail = String(email || "").trim() || null;
  const normalizedPhone = String(phone || "").trim() || null;
  const normalizedName = String(name || "").trim();

  User.updateProfile(
    id,
    {
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
    },
    (updateError) => {
      if (updateError) {
        const fallbackUser = updateMockUser({
          id,
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
        });

        if (!fallbackUser) {
          return res.status(404).json({ message: "User not found" });
        }

        return res.json({ message: "Profile updated", user: fallbackUser });
      }

      User.findById(id, (findError, results) => {
        if (findError || !results.length) {
          const fallbackUser = updateMockUser({
            id,
            name: normalizedName,
            email: normalizedEmail,
            phone: normalizedPhone,
          });

          if (!fallbackUser) {
            return res.status(404).json({ message: "User not found" });
          }

          return res.json({ message: "Profile updated", user: fallbackUser });
        }

        return res.json({ message: "Profile updated", user: results[0] });
      });
    }
  );
};

export const startGoogleLogin = (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: "Google login is not configured" });
  }

  const client = getGoogleClient();
  const state = Buffer.from(
    JSON.stringify({
      redirectTo: safeRedirectPath(req.query.redirectTo),
    })
  ).toString("base64url");
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
  });

  res.redirect(url);
};

export const googleCallback = async (req, res) => {
  const frontendUrl = getFrontendAppUrl();

  try {
    const code = cleanString(req.query.code);
    const state = cleanString(req.query.state);

    if (!code) {
      return res.redirect(`${frontendUrl}/login?google_error=missing_code`);
    }

    let redirectTo = "/home";
    try {
      const parsedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      redirectTo = safeRedirectPath(parsedState.redirectTo);
    } catch {
      redirectTo = "/home";
    }

    const client = getGoogleClient();
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();
    const googleId = cleanString(profile?.sub);
    const email = cleanString(profile?.email).toLowerCase();
    const name = cleanString(profile?.name) || "Google User";

    if (!googleId || !email) {
      return res.redirect(`${frontendUrl}/login?google_error=profile_missing`);
    }

    const user = await new Promise((resolve, reject) => {
      User.findByGoogleId(googleId, (googleError, googleRows) => {
        if (googleError) {
          reject(googleError);
          return;
        }

        if (googleRows.length) {
          resolve(googleRows[0]);
          return;
        }

        User.findByEmail(email, (emailError, emailRows) => {
          if (emailError) {
            reject(emailError);
            return;
          }

          if (emailRows.length) {
            User.updateGoogleIdByEmail(email, googleId, name, (updateError) => {
              if (updateError) {
                reject(updateError);
                return;
              }

              User.findByGoogleId(googleId, (findError, updatedRows) => {
                if (findError) reject(findError);
                else resolve(updatedRows[0] || emailRows[0]);
              });
            });
            return;
          }

          User.createGoogleUser({ name, email, google_id: googleId }, (createError) => {
            if (createError) {
              reject(createError);
              return;
            }

            User.findByGoogleId(googleId, (findError, createdRows) => {
              if (findError) reject(findError);
              else resolve(createdRows[0]);
            });
          });
        });
      });
    });

    const token = signGoogleSession(sanitizeUser(user));
    const params = new URLSearchParams({
      google_token: token,
      redirectTo,
    });
    return res.redirect(`${frontendUrl}/login?${params.toString()}`);
  } catch (error) {
    console.log("Google OAuth Error:", error);
    return res.redirect(`${frontendUrl}/login?google_error=oauth_failed`);
  }
};

export const completeGoogleLogin = (req, res) => {
  try {
    const token = cleanString(req.body?.token || req.query?.token);
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "local_dev_secret_change_before_deploy"
    );

    if (payload.type !== "customer_google_login" || !payload.user) {
      return res.status(400).json({ message: "Invalid Google login session" });
    }

    res.json({
      message: "Google login successful",
      user: sanitizeUser({
        ...payload.user,
        loginMethod: "google",
      }),
    });
  } catch {
    res.status(400).json({ message: "Google login session expired" });
  }
};

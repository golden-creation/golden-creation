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
import { normalizeSmsPhone, sendOtpSms } from "../services/sms.service.js";
import { sendEmailOtp } from "../services/email.service.js";
import { safelyDeleteMedia } from "../services/media-reference.service.js";
import {
  issueCustomerSession,
  publicUser,
} from "../services/customer-session.service.js";

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
  delete safeUser.otp_expires_at;
  delete safeUser.password;
  return safeUser;
}

function sessionMetadata(req) {
  return {
    deviceName: cleanString(req.body?.deviceName),
    deviceId: cleanString(req.body?.deviceId),
    ipAddress: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

async function loginResponse(req, user, message) {
  const authenticated = await issueCustomerSession(user, sessionMetadata(req));
  return {
    message,
    ...authenticated,
  };
}

function boolEnv(name, fallback = false) {
  const value = cleanString(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function shouldExposeDevOtp() {
  return boolEnv("EXPOSE_DEV_OTP", process.env.NODE_ENV !== "production");
}

function otpResponse(payload, otp) {
  if (!shouldExposeDevOtp()) return payload;
  return {
    ...payload,
    otp,
  };
}

function otpExpiresAt() {
  return new Date(Date.now() + 10 * 60 * 1000);
}

function isOtpExpired(user) {
  const expiresAt = user?.otp_expires_at;
  return !expiresAt || new Date(expiresAt).getTime() <= Date.now();
}

async function deliverMobileOtp(res, phone, otp, payload) {
  try {
    await sendOtpSms(phone, otp);
    return res.json(otpResponse(payload, otp));
  } catch (error) {
    console.error("Nimbus OTP SMS failed:", error.message);
    if (process.env.NODE_ENV !== "production" && shouldExposeDevOtp()) {
      return res.json({
        ...payload,
        otp,
        delivery: "development",
        warning: "SMS delivery is unavailable; using the development OTP.",
      });
    }
    return res.status(502).json({
      message: "Unable to send OTP right now. Please try again shortly.",
    });
  }
}

async function deliverEmailOtp(res, email, otp, payload) {
  try {
    await sendEmailOtp(email, otp);
    return res.json(otpResponse(payload, otp));
  } catch (error) {
    console.error("MailerCloud OTP email failed:", error.message);
    if (process.env.NODE_ENV !== "production" && shouldExposeDevOtp()) {
      return res.json({
        ...payload,
        otp,
        delivery: "development",
        warning: "Email delivery is unavailable; using the development OTP.",
      });
    }
    return res.status(502).json({
      message: "Unable to send OTP right now. Please try again shortly.",
    });
  }
}

export const sendOtp = (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const otp = createOtp();
  const expiresAt = otpExpiresAt();

  User.findByEmail(email, async (err, results) => {
    if (err) {
      const user = upsertMockEmailOtp(email, otp, expiresAt);
      return deliverEmailOtp(res, email, otp, { message: "OTP sent successfully", user });
    }

    if (results.length > 0) {
      User.updateOtp(email, otp, expiresAt, async (updateError) => {
        if (updateError) {
          const user = upsertMockEmailOtp(email, otp, expiresAt);
          return deliverEmailOtp(res, email, otp, { message: "OTP sent successfully", user });
        }

        return deliverEmailOtp(res, email, otp, { message: "OTP sent successfully" });
      });
      return;
    }

    User.create({ name: "User", email, phone: null, otp, otpExpiresAt: expiresAt }, async (createError) => {
      if (createError) {
        const user = upsertMockEmailOtp(email, otp, expiresAt);
        return deliverEmailOtp(res, email, otp, { message: "OTP sent successfully", user });
      }

      return deliverEmailOtp(res, email, otp, { message: "OTP sent successfully" });
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

    if (isOtpExpired(user)) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    User.verifyOtp(email, async (verifyError) => {
      if (verifyError) {
        const fallback = verifyMockEmailOtp(email, otp);

        if (fallback.error) {
          return res.status(fallback.status).json({ message: fallback.error });
        }

        try {
          return res.json(await loginResponse(req, fallback.user, "Login successful"));
        } catch {
          return res.status(500).json({ message: "Unable to create login session" });
        }
      }

      loginResponse(req, user, "Login successful")
        .then((payload) => res.json(payload))
        .catch(() => res.status(500).json({ message: "Unable to create login session" }));
    });
  });
};

export const sendOtpMobile = (req, res) => {
  let phone;

  try {
    phone = normalizeSmsPhone(req.body?.phone);
  } catch {
    return res.status(400).json({ message: "A valid 10-digit mobile number is required" });
  }

  const otp = createOtp();
  const expiresAt = otpExpiresAt();

  User.findByPhone(phone, async (err, results) => {
    if (err) {
      const user = upsertMockPhoneOtp(phone, otp, expiresAt);
      return deliverMobileOtp(res, phone, otp, { message: "OTP sent", user });
    }

    if (results.length > 0) {
      User.updateOtpByPhone(phone, otp, expiresAt, async (updateError) => {
        if (updateError) {
          const user = upsertMockPhoneOtp(phone, otp, expiresAt);
          return deliverMobileOtp(res, phone, otp, { message: "OTP sent", user });
        }

        return deliverMobileOtp(res, phone, otp, { message: "OTP sent" });
      });
      return;
    }

    User.create(
      { name: "User", email: null, phone, otp, otpExpiresAt: expiresAt },
      async (createError) => {
        if (createError) {
          const user = upsertMockPhoneOtp(phone, otp, expiresAt);
          return deliverMobileOtp(res, phone, otp, { message: "OTP sent", user });
        }

        return deliverMobileOtp(res, phone, otp, { message: "OTP sent" });
      }
    );
  });
};

export const verifyOtpMobile = (req, res) => {
  const { otp } = req.body;
  let phone;

  try {
    phone = normalizeSmsPhone(req.body?.phone);
  } catch {
    return res.status(400).json({ message: "Phone & OTP required" });
  }

  if (!otp) {
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

    if (isOtpExpired(user)) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    User.verifyOtpByPhone(phone, async (verifyError) => {
      if (verifyError) {
        const fallback = verifyMockPhoneOtp(phone, otp);

        if (fallback.error) {
          return res.status(fallback.status).json({ message: fallback.error });
        }

        try {
          return res.json(await loginResponse(req, fallback.user, "Login success"));
        } catch {
          return res.status(500).json({ message: "Unable to create login session" });
        }
      }

      loginResponse(req, user, "Login success")
        .then((payload) => res.json(payload))
        .catch(() => res.status(500).json({ message: "Unable to create login session" }));
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
  const hasProfileImage = Object.prototype.hasOwnProperty.call(req.body || {}, "profileImage");
  const profileImage = hasProfileImage ? cleanString(req.body?.profileImage) || null : undefined;

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
      hasProfileImage,
      profileImage,
    },
    (updateError) => {
      if (updateError) {
        const fallbackUser = updateMockUser({
          id,
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          hasProfileImage,
          profileImage,
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
            hasProfileImage,
            profileImage,
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

export const removeProfileImage = (req, res) => {
  const id = Number(req.body?.id);
  const imageUrl = cleanString(req.body?.imageUrl);
  if (!id || !imageUrl) {
    return res.status(400).json({ message: "User id and image URL are required" });
  }

  User.findById(id, (findError, rows) => {
    const user = rows?.[0];
    if (findError || !user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (cleanString(user.profile_image) !== imageUrl) {
      return res.status(409).json({ message: "Profile image has changed; refresh and try again" });
    }

    User.updateProfile(
      id,
      {
        name: user.name,
        email: user.email,
        phone: user.phone,
        hasProfileImage: true,
        profileImage: null,
      },
      async (updateError) => {
        if (updateError) {
          return res.status(500).json({ message: "Unable to remove profile image" });
        }
        await safelyDeleteMedia(imageUrl).catch(() => {});
        User.findById(id, (refreshError, refreshedRows) => {
          if (refreshError || !refreshedRows.length) {
            return res.json({ message: "Profile image removed", user: { ...user, profile_image: null } });
          }
          return res.json({ message: "Profile image removed", user: refreshedRows[0] });
        });
      }
    );
  });
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

export const completeGoogleLogin = async (req, res) => {
  try {
    const token = cleanString(req.body?.token || req.query?.token);
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET || "local_dev_secret_change_before_deploy"
    );

    if (payload.type !== "customer_google_login" || !payload.user) {
      return res.status(400).json({ message: "Invalid Google login session" });
    }

    const user = sanitizeUser({
      ...payload.user,
      loginMethod: "google",
    });
    res.json(await loginResponse(req, user, "Google login successful"));
  } catch {
    res.status(400).json({ message: "Google login session expired" });
  }
};

function findOrCreateGoogleUser({ googleId, email, name }) {
  return new Promise((resolve, reject) => {
    User.findByGoogleId(googleId, (googleError, googleRows) => {
      if (googleError) return reject(googleError);
      if (googleRows.length) return resolve(googleRows[0]);

      User.findByEmail(email, (emailError, emailRows) => {
        if (emailError) return reject(emailError);
        if (emailRows.length) {
          User.updateGoogleIdByEmail(email, googleId, name, (updateError) => {
            if (updateError) return reject(updateError);
            User.findByGoogleId(googleId, (findError, updatedRows) => {
              if (findError) reject(findError);
              else resolve(updatedRows[0] || emailRows[0]);
            });
          });
          return;
        }
        User.createGoogleUser({ name, email, google_id: googleId }, (createError) => {
          if (createError) return reject(createError);
          User.findByGoogleId(googleId, (findError, createdRows) => {
            if (findError) reject(findError);
            else resolve(createdRows[0]);
          });
        });
      });
    });
  });
}

export const nativeGoogleLogin = async (req, res) => {
  try {
    const idToken = cleanString(req.body?.idToken);
    const androidAudiences = [
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_IDS,
    ]
      .flatMap((value) => cleanString(value).split(","))
      .map(cleanString);
    const audiences = [
      process.env.GOOGLE_WEB_CLIENT_ID,
      ...androidAudiences,
      process.env.GOOGLE_CLIENT_ID,
    ]
      .map(cleanString)
      .filter(Boolean);
    const uniqueAudiences = [...new Set(audiences)];
    if (!idToken || !uniqueAudiences.length) {
      return res.status(503).json({ message: "Google mobile login is not configured" });
    }
    const ticket = await new OAuth2Client(uniqueAudiences[0]).verifyIdToken({
      idToken,
      audience: uniqueAudiences,
    });
    const profile = ticket.getPayload();
    if (!profile?.email_verified || !profile?.sub || !profile?.email) {
      return res.status(401).json({ message: "Google account could not be verified" });
    }
    const user = await findOrCreateGoogleUser({
      googleId: cleanString(profile.sub),
      email: cleanString(profile.email).toLowerCase(),
      name: cleanString(profile.name) || "Google User",
    });
    res.json(await loginResponse(req, user, "Google login successful"));
  } catch (error) {
    console.error("Native Google login failed:", error.message);
    res.status(401).json({ message: "Google login failed" });
  }
};

export const getAuthenticatedProfile = (req, res) => {
  res.json({ user: publicUser(req.customer) });
};

export const updateAuthenticatedProfile = (req, res) => {
  const id = Number(req.customer?.id);
  const name = cleanString(req.body?.name);
  if (!name) return res.status(400).json({ message: "Name is required" });
  User.updateProfile(
    id,
    {
      name,
      email: cleanString(req.body?.email) || null,
      phone: cleanString(req.body?.phone) || null,
      hasProfileImage: Object.prototype.hasOwnProperty.call(req.body || {}, "profileImage"),
      profileImage: cleanString(req.body?.profileImage) || null,
    },
    (error) => {
      if (error) return res.status(500).json({ message: "Unable to update profile" });
      User.findById(id, (findError, rows) => {
        if (findError || !rows.length) return res.status(404).json({ message: "User not found" });
        res.json({ user: publicUser(rows[0]) });
      });
    }
  );
};

export const removeAuthenticatedProfileImage = (req, res) => {
  const id = Number(req.customer?.id);
  const imageUrl = cleanString(req.customer?.profile_image);
  User.updateProfile(
    id,
    {
      name: req.customer.name,
      email: req.customer.email || null,
      phone: req.customer.phone || null,
      hasProfileImage: true,
      profileImage: null,
    },
    async (error) => {
      if (error) {
        return res.status(500).json({ message: "Unable to remove profile image" });
      }
      if (imageUrl) await safelyDeleteMedia(imageUrl).catch(() => {});
      User.findById(id, (findError, rows) => {
        if (findError || !rows.length) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json({ user: publicUser(rows[0]) });
      });
    }
  );
};

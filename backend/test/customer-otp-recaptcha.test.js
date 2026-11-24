import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requireRecaptcha } from "../middleware/recaptcha.middleware.js";
import { verifyRecaptchaToken } from "../services/recaptcha.service.js";
import {
  upsertMockEmailOtp,
  upsertMockPhoneOtp,
  verifyMockEmailOtp,
  verifyMockPhoneOtp,
} from "../config/mock-store.js";

function otpApp() {
  const app = express();
  app.use(express.json());
  const guard = requireRecaptcha("otp_request", { minScore: 0.6, allowMobileApp: true });
  app.post("/auth/send-otp", guard, (_req, res) => {
    res.json({ channel: "email" });
  });
  app.post("/auth/send-otp-mobile", guard, (_req, res) => {
    res.json({ channel: "mobile" });
  });
  return app;
}

async function post(path, body, headers = {}) {
  const server = await new Promise((resolve) => {
    const listening = otpApp().listen(0, "127.0.0.1", () => resolve(listening));
  });
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("a configured reCAPTCHA secret rejects an OTP request with no token", async () => {
  const previous = process.env.RECAPTCHA_SECRET_KEY;
  process.env.RECAPTCHA_SECRET_KEY = "ci-recaptcha-secret";
  try {
    const result = await verifyRecaptchaToken({ token: "", action: "otp_request" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "reCAPTCHA token is required");

    const email = await post("/auth/send-otp", { email: "otp-check@example.com" });
    const mobile = await post("/auth/send-otp-mobile", { phone: "9999999999" });
    assert.equal(email.status, 403);
    assert.equal(email.body.message, "reCAPTCHA token is required");
    assert.equal(mobile.status, 403);
    assert.equal(mobile.body.message, "reCAPTCHA token is required");
  } finally {
    if (previous === undefined) delete process.env.RECAPTCHA_SECRET_KEY;
    else process.env.RECAPTCHA_SECRET_KEY = previous;
  }
});

test("email and mobile OTP verification stay independent", () => {
  const email = "otp-email-check@example.com";
  const phone = "9000000001";
  upsertMockEmailOtp(email, "111111", new Date(Date.now() + 60_000));
  upsertMockPhoneOtp(phone, "222222", new Date(Date.now() + 60_000));

  assert.equal(verifyMockEmailOtp(email, "222222").error, "Invalid OTP");
  assert.equal(verifyMockPhoneOtp(phone, "111111").error, "Invalid OTP");
  assert.equal(verifyMockEmailOtp(email, "111111").user.email, email);
  const mobileLogin = verifyMockPhoneOtp(phone, "222222");
  assert.equal(mobileLogin.error, undefined);
  assert.equal(mobileLogin.user.phone, phone);

  upsertMockEmailOtp(email, "333333", new Date(Date.now() - 1000));
  assert.equal(verifyMockEmailOtp(email, "333333").error, "OTP has expired");
  upsertMockEmailOtp(email, "444444", new Date(Date.now() + 60_000));
  assert.equal(verifyMockEmailOtp(email, "444444").user.email, email);
});

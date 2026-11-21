import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCertificateDigest,
  otpRequestHash,
  verifyMobileIntegrity,
} from "../services/play-integrity.service.js";

test("OTP request hash is stable and bound to phone and nonce", () => {
  const first = otpRequestHash({
    phone: "9876543210",
    integrityNonce: "nonce-1",
  });
  const same = otpRequestHash({
    phone: "9876543210",
    integrityNonce: "nonce-1",
    ignored: "value",
  });
  const changed = otpRequestHash({
    phone: "9876543210",
    integrityNonce: "nonce-2",
  });

  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("certificate fingerprint normalization accepts colon-delimited SHA-256", () => {
  const fingerprint =
    "D2:0E:3D:DD:2B:18:82:37:44:53:26:3E:00:84:0D:BC:CD:8F:D9:82:4E:29:2B:19:70:FE:CB:C0:4E:E7:D1:89";

  assert.equal(
    normalizeCertificateDigest(fingerprint),
    Buffer.from(fingerprint.replaceAll(":", ""), "hex").toString("base64url")
  );
});

test("debug app key bypass is unavailable in production", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    appKey: process.env.MOBILE_APP_API_KEY,
    project: process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER,
    productionTest: process.env.ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION,
  };
  process.env.NODE_ENV = "production";
  process.env.MOBILE_APP_API_KEY = "debug-key";
  delete process.env.ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION;
  delete process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;

  try {
    const result = await verifyMobileIntegrity({
      headers: { "x-gc-mobile-app-key": "debug-key" },
      body: {},
    });
    assert.equal(result.ok, false);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.appKey === undefined) delete process.env.MOBILE_APP_API_KEY;
    else process.env.MOBILE_APP_API_KEY = previous.appKey;
    if (previous.project === undefined) {
      delete process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;
    } else {
      process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER = previous.project;
    }
    if (previous.productionTest === undefined) {
      delete process.env.ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION;
    } else {
      process.env.ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION =
        previous.productionTest;
    }
  }
});

test("explicit production test key attestation is opt-in", async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    appKey: process.env.MOBILE_APP_API_KEY,
    productionTest: process.env.ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION,
    project: process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER,
  };
  process.env.NODE_ENV = "production";
  process.env.MOBILE_APP_API_KEY = "client-test-key";
  process.env.ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION = "true";
  delete process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;

  try {
    const result = await verifyMobileIntegrity({
      headers: { "x-gc-mobile-app-key": "client-test-key" },
      body: {},
    });
    assert.equal(result.ok, true);
    assert.equal(result.productionTest, true);
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.nodeEnv,
      MOBILE_APP_API_KEY: previous.appKey,
      ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION: previous.productionTest,
      PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: previous.project,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { publicRecaptchaSiteKey } from "../src/lib/publicFrontendConfig.js";
import { resolveRecaptchaSiteKey } from "../src/lib/recaptchaSiteKey.js";

test("customer login keeps a public reCAPTCHA site key when the build env is empty", () => {
  assert.match(publicRecaptchaSiteKey, /^6L[A-Za-z0-9_-]{20,}$/);
  assert.equal(
    resolveRecaptchaSiteKey({ configured: "", fallback: publicRecaptchaSiteKey }),
    publicRecaptchaSiteKey
  );
  assert.equal(
    resolveRecaptchaSiteKey({
      configured: "your_google_recaptcha_site_key",
      fallback: publicRecaptchaSiteKey,
    }),
    publicRecaptchaSiteKey
  );
});

test("an explicit public reCAPTCHA site key overrides the built-in key", () => {
  const configured = "6LConfiguredSiteKeyForTests000000";
  assert.equal(
    resolveRecaptchaSiteKey({ configured, fallback: publicRecaptchaSiteKey }),
    configured
  );
});

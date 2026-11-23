const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export const RAZORPAY_KEYS = [
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

export const STORAGE_KEYS = [
  "DO_SPACES_BUCKET",
  "DO_SPACES_ACCESS_KEY_ID",
  "DO_SPACES_SECRET_KEY",
];

export const SENSITIVE_KEYS = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  ...RAZORPAY_KEYS,
  "MAILER_CLOUD_ENABLED",
  "MAILER_CLOUD_SMTP_HOST",
  "MAILER_CLOUD_SMTP_PORT",
  "MAILER_CLOUD_SMTP_USER",
  "MAILER_CLOUD_SMTP_PASSWORD",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM_EMAIL",
  "MAIL_FROM_NAME",
  "NIMBUS_SMS_ENABLED",
  "NIMBUS_SMS_BASE_URL",
  "NIMBUS_SMS_USER_ID",
  "NIMBUS_SMS_PASSWORD",
  "NIMBUS_SMS_SENDER_ID",
  "NIMBUS_SMS_ENTITY_ID",
  "NIMBUS_SMS_OTP_TEMPLATE_ID",
  "NIMBUS_SMS_ORDER_TEMPLATE_ID",
  ...STORAGE_KEYS,
  "DO_SPACES_REGION",
  "DO_SPACES_ENDPOINT",
  "DO_SPACES_CDN_URL",
  "DO_SPACES_PUBLIC_URL",
  "RECAPTCHA_SECRET_KEY",
  "JWT_SECRET",
  "CUSTOMER_JWT_SECRET",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

function token(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isIsolatedTest(env = process.env) {
  return TRUE_VALUES.has(token(env.GC_ISOLATED_TEST));
}

export function startupJobsEnabled(env = process.env) {
  const value = token(env.RUN_STARTUP_JOBS);
  if (!value) return true;
  return !FALSE_VALUES.has(value);
}

export function listenHost(env = process.env) {
  return isIsolatedTest(env) ? "127.0.0.1" : null;
}

export function isolatedTestFailures(env = process.env) {
  const failures = [];
  if (String(env.PORT ?? "").trim() !== "5001") failures.push("PORT must be 5001");
  if (String(env.DB_USER ?? "").trim() !== "gc_restore") failures.push("DB_USER must be gc_restore");
  if (String(env.DB_NAME ?? "").trim() !== "goldencreation_restore_20261122T142649Z") {
    failures.push("DB_NAME must be goldencreation_restore_20261122T142649Z");
  }
  const host = token(env.DB_HOST);
  if (host !== "127.0.0.1" && host !== "localhost") failures.push("DB_HOST must be local");
  if (startupJobsEnabled(env)) failures.push("RUN_STARTUP_JOBS must be false");
  for (const key of RAZORPAY_KEYS) {
    if (String(env[key] ?? "").trim()) failures.push(`${key} must be empty`);
  }
  if (token(env.MAILER_CLOUD_ENABLED) !== "false") failures.push("MAILER_CLOUD_ENABLED must be false");
  if (token(env.NIMBUS_SMS_ENABLED) !== "false") failures.push("NIMBUS_SMS_ENABLED must be false");
  for (const key of STORAGE_KEYS) {
    if (String(env[key] ?? "").trim()) failures.push(`${key} must be empty`);
  }
  return failures;
}

export function safeIsolatedTestEnv(overrides = {}) {
  return {
    GC_ISOLATED_TEST: "true",
    PORT: "5001",
    DB_HOST: "127.0.0.1",
    DB_USER: "gc_restore",
    DB_NAME: "goldencreation_restore_20261122T142649Z",
    RUN_STARTUP_JOBS: "false",
    MAILER_CLOUD_ENABLED: "false",
    NIMBUS_SMS_ENABLED: "false",
    ...overrides,
  };
}

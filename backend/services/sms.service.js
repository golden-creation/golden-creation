const OTP_MESSAGE_TEMPLATE =
  "Dear Customer, Your OTP for login on Golden Creation is {otp}. This OTP is valid for 10 minutes. Do not share it with anyone. Regards, goldencreation.in";

const ORDER_MESSAGE_TEMPLATE =
  "Dear {name}, Thank you for shopping with Golden Creation. Your order {orderNumber} has been successfully placed. Order Amount: Rs. {amount}. Team Golden Creation";

function cleanString(value) {
  return String(value || "").trim();
}

function boolEnv(name, fallback = false) {
  const value = cleanString(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function templateVariable(value, fallback) {
  const normalized = cleanString(value).replace(/\s+/g, " ");
  return (normalized || fallback).slice(0, 40);
}

export function normalizeSmsPhone(value) {
  let digits = cleanString(value).replace(/\D/g, "");

  if (digits.startsWith("0091") && digits.length === 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("A valid 10-digit Indian mobile number is required");
  }

  return digits;
}

function getNimbusConfig() {
  return {
    enabled: boolEnv("NIMBUS_SMS_ENABLED", false),
    baseUrl:
      cleanString(process.env.NIMBUS_SMS_BASE_URL) ||
      "http://nimbusit.biz/api/SmsApi/SendSingleApi",
    userId: cleanString(process.env.NIMBUS_SMS_USER_ID),
    password: cleanString(process.env.NIMBUS_SMS_PASSWORD),
    senderId: cleanString(process.env.NIMBUS_SMS_SENDER_ID),
    entityId: cleanString(process.env.NIMBUS_SMS_ENTITY_ID),
    otpTemplateId: cleanString(process.env.NIMBUS_SMS_OTP_TEMPLATE_ID),
    orderTemplateId: cleanString(process.env.NIMBUS_SMS_ORDER_TEMPLATE_ID),
    timeoutMs: Math.max(1000, Number(process.env.NIMBUS_SMS_TIMEOUT_MS || 10000)),
  };
}

function assertConfigured(config, templateId) {
  if (!config.enabled) {
    throw new Error("Nimbus SMS is disabled");
  }

  const required = [
    ["NIMBUS_SMS_USER_ID", config.userId],
    ["NIMBUS_SMS_PASSWORD", config.password],
    ["NIMBUS_SMS_SENDER_ID", config.senderId],
    ["NIMBUS_SMS_ENTITY_ID", config.entityId],
    ["Nimbus template ID", templateId],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Nimbus SMS configuration is incomplete: ${missing.join(", ")}`);
  }
}

export function buildNimbusSmsUrl({ phone, message, templateId }) {
  const config = getNimbusConfig();
  assertConfigured(config, templateId);

  const url = new URL(config.baseUrl);
  url.searchParams.set("UserID", config.userId);
  url.searchParams.set("Password", config.password);
  url.searchParams.set("SenderID", config.senderId);
  url.searchParams.set("Phno", normalizeSmsPhone(phone));
  url.searchParams.set("Msg", cleanString(message));
  url.searchParams.set("EntityID", config.entityId);
  url.searchParams.set("TemplateID", templateId);
  return url;
}

function providerRejected(body) {
  return /\b(error|invalid|failed|failure|unauthori[sz]ed|denied)\b/i.test(
    cleanString(body)
  );
}

export async function sendNimbusSms(
  { phone, message, templateId },
  { fetchImpl = globalThis.fetch } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("HTTP client is unavailable");
  }

  const config = getNimbusConfig();
  const url = buildNimbusSmsUrl({ phone, message, templateId });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
    const body = await response.text();

    if (!response.ok || providerRejected(body)) {
      throw new Error(
        `Nimbus rejected the SMS request (${response.status}): ${cleanString(body).slice(0, 200)}`
      );
    }

    return {
      ok: true,
      status: response.status,
      response: cleanString(body).slice(0, 500),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Nimbus SMS request timed out after ${config.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildOtpMessage(otp) {
  return OTP_MESSAGE_TEMPLATE.replace("{otp}", templateVariable(otp, "000000"));
}

export function buildOrderConfirmationMessage({ customerName, orderNumber, totalAmount }) {
  const amount = Number(totalAmount || 0).toFixed(2);
  return ORDER_MESSAGE_TEMPLATE.replace(
    "{name}",
    templateVariable(customerName, "Customer")
  )
    .replace("{orderNumber}", templateVariable(orderNumber, "Order"))
    .replace("{amount}", templateVariable(amount, "0.00"));
}

export function sendOtpSms(phone, otp, options) {
  const config = getNimbusConfig();
  return sendNimbusSms(
    {
      phone,
      message: buildOtpMessage(otp),
      templateId: config.otpTemplateId,
    },
    options
  );
}

export function sendOrderConfirmationSms(
  { phone, customerName, orderNumber, totalAmount },
  options
) {
  const config = getNimbusConfig();
  return sendNimbusSms(
    {
      phone,
      message: buildOrderConfirmationMessage({
        customerName,
        orderNumber,
        totalAmount,
      }),
      templateId: config.orderTemplateId,
    },
    options
  );
}

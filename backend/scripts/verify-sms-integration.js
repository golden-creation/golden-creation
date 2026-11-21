import assert from "node:assert/strict";
import {
  buildNimbusSmsUrl,
  buildOrderConfirmationMessage,
  buildOtpMessage,
  normalizeSmsPhone,
  sendNimbusSms,
} from "../services/sms.service.js";

Object.assign(process.env, {
  NIMBUS_SMS_ENABLED: "true",
  NIMBUS_SMS_BASE_URL: "http://example.test/sms",
  NIMBUS_SMS_USER_ID: "test-user",
  NIMBUS_SMS_PASSWORD: "test-password",
  NIMBUS_SMS_SENDER_ID: "GLDCRN",
  NIMBUS_SMS_ENTITY_ID: "1701177927572091409",
  NIMBUS_SMS_OTP_TEMPLATE_ID: "1707178040009045192",
  NIMBUS_SMS_ORDER_TEMPLATE_ID: "1707178039774997518",
  NIMBUS_SMS_TIMEOUT_MS: "2000",
});

assert.equal(normalizeSmsPhone("+91 87459 35729"), "8745935729");
assert.equal(normalizeSmsPhone("08745935729"), "8745935729");
assert.throws(() => normalizeSmsPhone("12345"), /valid 10-digit/);

assert.equal(
  buildOtpMessage("482913"),
  "Dear Customer, Your OTP for login on Golden Creation is 482913. This OTP is valid for 10 minutes. Do not share it with anyone. Regards, goldencreation.in"
);
assert.equal(
  buildOrderConfirmationMessage({
    customerName: "Amit",
    orderNumber: "LM-12345678",
    totalAmount: 1250,
  }),
  "Dear Amit, Thank you for shopping with Golden Creation. Your order LM-12345678 has been successfully placed. Order Amount: Rs. 1250.00. Team Golden Creation"
);

const url = buildNimbusSmsUrl({
  phone: "8745935729",
  message: buildOtpMessage("482913"),
  templateId: process.env.NIMBUS_SMS_OTP_TEMPLATE_ID,
});
assert.equal(url.searchParams.get("UserID"), "test-user");
assert.equal(url.searchParams.get("Password"), "test-password");
assert.equal(url.searchParams.get("Phno"), "8745935729");
assert.equal(url.searchParams.get("TemplateID"), "1707178040009045192");

let requestedUrl;
const accepted = await sendNimbusSms(
  {
    phone: "8745935729",
    message: buildOtpMessage("482913"),
    templateId: process.env.NIMBUS_SMS_OTP_TEMPLATE_ID,
  },
  {
    fetchImpl: async (requestUrl) => {
      requestedUrl = requestUrl;
      return new Response("Message Submitted Successfully", { status: 200 });
    },
  }
);
assert.equal(accepted.ok, true);
assert.equal(requestedUrl.searchParams.get("SenderID"), "GLDCRN");

await assert.rejects(
  sendNimbusSms(
    {
      phone: "8745935729",
      message: buildOtpMessage("482913"),
      templateId: process.env.NIMBUS_SMS_OTP_TEMPLATE_ID,
    },
    {
      fetchImpl: async () => new Response("Invalid Template ID", { status: 200 }),
    }
  ),
  /Nimbus rejected/
);

console.log("Nimbus SMS integration verification passed");

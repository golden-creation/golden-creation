import nodemailer from "nodemailer";

function cleanString(value) {
  return String(value || "").trim();
}

function boolEnv(name, fallback = false) {
  const value = cleanString(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getMailConfig() {
  const host = cleanString(process.env.MAILER_CLOUD_SMTP_HOST || process.env.SMTP_HOST);
  const port = Number(process.env.MAILER_CLOUD_SMTP_PORT || process.env.SMTP_PORT || 587);
  const user = cleanString(process.env.MAILER_CLOUD_SMTP_USER || process.env.SMTP_USER);
  const pass = cleanString(process.env.MAILER_CLOUD_SMTP_PASSWORD || process.env.SMTP_PASSWORD);
  const enabled = boolEnv("MAILER_CLOUD_ENABLED", Boolean(host && user && pass));
  const fromEmail = cleanString(process.env.MAIL_FROM_EMAIL) || user;
  const fromName = cleanString(process.env.MAIL_FROM_NAME) || "Golden Creation";

  return {
    enabled,
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from: `"${fromName}" <${fromEmail}>`,
  };
}

let transporter;

function getTransporter() {
  const config = getMailConfig();
  if (!config.enabled) return null;
  if (!config.host || !config.user || !config.pass) {
    throw new Error("MailerCloud SMTP credentials are incomplete");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      requireTLS: !config.secure,
    });
  }
  return transporter;
}

function shell({ title, preview, body }) {
  return `
    <div style="margin:0;padding:0;background:#fbf8f2;font-family:Arial,Helvetica,sans-serif;color:#242414;">
      <div style="display:none;max-height:0;overflow:hidden;">${preview}</div>
      <div style="max-width:620px;margin:0 auto;padding:24px;">
        <div style="background:#fff;border-radius:18px;overflow:hidden;border:1px solid #eadfca;">
          <div style="background:#fff49c;padding:22px 24px;">
            <div style="font-size:22px;font-weight:700;color:#a06422;">Golden Creation</div>
            <div style="font-size:13px;color:#5f5a44;margin-top:4px;">House of Office Stationery & Gift Items</div>
          </div>
          <div style="padding:24px;">
            <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#242414;">${title}</h1>
            ${body}
          </div>
          <div style="border-top:1px solid #eee2ca;padding:16px 24px;font-size:12px;color:#7c7563;">
            Golden Creation, Gurugram<br />
            <a href="https://goldencreation.in" style="color:#a06422;text-decoration:none;">goldencreation.in</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function sendTransactionalEmail({ to, subject, html, text, campaignId }) {
  const config = getMailConfig();
  if (!config.enabled) {
    return { skipped: true, reason: "MailerCloud SMTP is disabled" };
  }
  const recipient = cleanString(to);
  if (!recipient) return { skipped: true, reason: "No recipient email" };

  const mailer = getTransporter();
  return mailer.sendMail({
    from: config.from,
    to: recipient,
    subject,
    text,
    html,
    headers: {
      "mld-track-opens": "false",
      "mld-track-inbox": "true",
      "mld-track-campaign-id": campaignId || "golden-creation-transactional",
    },
  });
}

export async function sendEmailOtp(email, otp) {
  const result = await sendTransactionalEmail({
    to: email,
    subject: "Your Golden Creation OTP",
    campaignId: "golden-creation-email-otp",
    text: `Your OTP for Golden Creation login is ${otp}. This OTP is valid for 10 minutes. Do not share it with anyone.`,
    html: shell({
      title: "Your login OTP",
      preview: "Use this OTP to login to Golden Creation.",
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4f4a3d;">Use the OTP below to complete your Golden Creation login. It is valid for 10 minutes.</p>
        <div style="display:inline-block;letter-spacing:7px;font-size:30px;font-weight:700;background:#fbf8f2;border:1px solid #eadfca;border-radius:14px;padding:14px 18px;color:#a06422;">${otp}</div>
        <p style="margin:18px 0 0;font-size:13px;color:#7c7563;">Do not share this code with anyone.</p>
      `,
    }),
  });

  if (result?.skipped) {
    throw new Error(result.reason || "Email OTP delivery was skipped");
  }

  return result;
}

export function sendOrderSuccessEmail(order) {
  return sendTransactionalEmail({
    to: order.customer_email,
    subject: `Order ${order.order_number} placed successfully`,
    campaignId: "golden-creation-order-success",
    text: `Thank you for shopping with Golden Creation. Your order ${order.order_number} has been placed successfully. Order total: ${money(order.total_amount)}.`,
    html: shell({
      title: "Order placed successfully",
      preview: `Your order ${order.order_number} has been placed.`,
      body: `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4f4a3d;">Dear ${cleanString(order.customer_name) || "Customer"}, thank you for shopping with Golden Creation.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          <tr><td style="padding:9px 0;color:#7c7563;">Order</td><td style="padding:9px 0;text-align:right;font-weight:700;">${order.order_number}</td></tr>
          <tr><td style="padding:9px 0;color:#7c7563;">Order total</td><td style="padding:9px 0;text-align:right;font-weight:700;">${money(order.total_amount)}</td></tr>
          <tr><td style="padding:9px 0;color:#7c7563;">Payment status</td><td style="padding:9px 0;text-align:right;font-weight:700;">${cleanString(order.payment_status) || "Pending"}</td></tr>
        </table>
        <a href="https://goldencreation.in/orders" style="display:inline-block;margin-top:18px;background:#c2863f;color:#fff;text-decoration:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:700;">View order</a>
      `,
    }),
  });
}

export function sendPaymentSuccessEmail(order) {
  return sendTransactionalEmail({
    to: order.customer_email,
    subject: `Payment received for order ${order.order_number}`,
    campaignId: "golden-creation-payment-success",
    text: `Payment received for order ${order.order_number}. Amount paid: ${money(order.amount_paid)}. COD balance: ${money(order.cod_due)}.`,
    html: shell({
      title: "Payment received",
      preview: `Payment received for order ${order.order_number}.`,
      body: `
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4f4a3d;">We have received your payment for order <strong>${order.order_number}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          <tr><td style="padding:9px 0;color:#7c7563;">Amount paid</td><td style="padding:9px 0;text-align:right;font-weight:700;">${money(order.amount_paid)}</td></tr>
          <tr><td style="padding:9px 0;color:#7c7563;">COD balance</td><td style="padding:9px 0;text-align:right;font-weight:700;">${money(order.cod_due)}</td></tr>
          <tr><td style="padding:9px 0;color:#7c7563;">Payment status</td><td style="padding:9px 0;text-align:right;font-weight:700;">${cleanString(order.payment_status)}</td></tr>
        </table>
      `,
    }),
  });
}

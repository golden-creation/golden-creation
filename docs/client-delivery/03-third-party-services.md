# Golden Creation Third-Party Services Documentation

Client: Golden Creation  
Owner: Mr. Ajay Malhotra  
Delivery partner: Natho Asto Global Tech  
Responsible person: Mr. Mridul Dubey

## 1. Service Inventory

| Service | Purpose | Integration Location |
| --- | --- | --- |
| Hostinger VPS | Production server hosting Node.js app, MySQL, CyberPanel/OpenLiteSpeed. | VPS `/opt/goldencreation/current`, PM2 `goldencreation-api`. |
| CyberPanel/OpenLiteSpeed | Web server, SSL, reverse proxy, domain/vhost handling. | Server-level configuration. |
| MySQL | Main application database. | `backend/config/db.js`. |
| DigitalOcean Spaces | Public/private media object storage. | `backend/services/media-storage.service.js`. |
| Razorpay | Online payment and Partial COD prepaid amount collection. | `backend/controllers/checkout.controller.js`, `commerce.service.js`. |
| MailerCloud SMTP | Transactional emails and OTP emails. | `backend/services/email.service.js`. |
| Nimbus SMS | SMS OTP and order confirmation fallback/support. | `backend/services/sms.service.js`. |
| Google reCAPTCHA | Public form and OTP abuse protection. | `backend/middleware/recaptcha.middleware.js`, `recaptcha.service.js`. |
| Google OAuth | Customer Google login. | `auth.fallback.controller.js`. |
| Google Places | Homepage Google reviews. | `google-reviews.controller.js`. |
| Google Play Integrity | Android app request integrity verification. | `play-integrity.service.js`. |
| Google Tag Manager / GA4 / Google Ads | Analytics and advertising tracking bridge. | SEO settings and storefront `dataLayer` utility. |
| Google Merchant Center | Product feed for shopping listings/ads. | `/feeds/google-merchant.xml`. |
| Meta Pixel / Meta Catalog | Meta ads tracking/catalog feed. | SEO settings and `/feeds/meta-catalog.csv`. |
| DigitalOcean CDN or Spaces public URL | Public media delivery. | `DO_SPACES_CDN_URL` or `DO_SPACES_PUBLIC_URL`. |

## 2. Hostinger VPS And Web Server

Production references recorded in this project:

- Main domain: `goldencreation.in`
- WWW domain: `www.goldencreation.in`
- Admin domain: `admin.goldencreation.in`
- Node app root: `/opt/goldencreation/current`
- Release directories: `/opt/goldencreation/releases/<timestamp>`
- Backup directories: `/opt/goldencreation/backups/<release-name>-<timestamp>`
- PM2 process: `goldencreation-api`

Deployment script responsibilities:

- Creates active release archive backup.
- Creates database backup with `mysqldump`.
- Backs up `.env`.
- Backs up OpenLiteSpeed vhost/httpd config when available.
- Extracts new release.
- Copies `.env` from previous release.
- Preserves runtime `images` and `public/.well-known`.
- Runs `npm ci --omit=dev`.
- Runs backend build check and idempotent migrations.
- Switches `/opt/goldencreation/current`.
- Restarts PM2.
- Runs local health checks.
- Rolls back PM2 if restart fails after switch.

## 3. Environment Variables

The production `.env` should define these keys as needed. Values must not be committed to the repository.

### Core Server

| Variable | Purpose |
| --- | --- |
| `PORT` | Express server port, default `5000`. |
| `NODE_ENV` | Should be `production` on VPS. |
| `FRONTEND_URL` | Comma-separated allowed origins for CORS. |
| `PUBLIC_API_URL` | Public API URL used in generated links. |
| `STOREFRONT_URL` | Public storefront URL used in sales/catalog links. |
| `SITE_BASE_URL` / `PUBLIC_SITE_URL` / `CANONICAL_SITE_URL` | Canonical URL fallbacks for SEO service. |

### Database

| Variable | Purpose |
| --- | --- |
| `DB_HOST` | MySQL host. |
| `DB_PORT` | MySQL port, default `3306`. |
| `DB_USER` | MySQL username. |
| `DB_PASSWORD` | MySQL password. |
| `DB_NAME` | MySQL database name. |
| `DB_CONNECT_TIMEOUT_MS` | Connection timeout. |
| `DB_QUERY_TIMEOUT_MS` | Query timeout. |
| `DB_CONNECTION_LIMIT` | MySQL pool size. |

### Tokens And Sessions

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Admin JWT signing secret. |
| `CUSTOMER_JWT_SECRET` | Customer JWT signing secret. |
| `CUSTOMER_ACCESS_TOKEN_MINUTES` | Customer access token lifetime. |
| `CUSTOMER_REFRESH_TOKEN_DAYS` | Customer refresh token lifetime. |
| `EXPOSE_DEV_OTP` | Must be `false` in production. |

### DigitalOcean Spaces

| Variable | Purpose |
| --- | --- |
| `DO_SPACES_BUCKET` | Spaces bucket name. |
| `DO_SPACES_REGION` | Region, default `sgp1`. |
| `DO_SPACES_ENDPOINT` | S3-compatible endpoint. |
| `DO_SPACES_ACCESS_KEY_ID` | Spaces access key. |
| `DO_SPACES_SECRET_KEY` | Spaces secret key. |
| `DO_SPACES_PUBLIC_URL` | Public bucket URL. |
| `DO_SPACES_CDN_URL` | CDN URL if enabled. |

### Razorpay

| Variable | Purpose |
| --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay checkout key ID. |
| `RAZORPAY_KEY_SECRET` | Razorpay secret used server-side. |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature secret. |
| `RAZORPAY_MERCHANT_ID` | Merchant identifier/reference. |

Webhook URL:

```text
https://goldencreation.in/api/payments/razorpay/webhook
```

### MailerCloud SMTP

| Variable | Purpose |
| --- | --- |
| `MAILER_CLOUD_ENABLED` | Enables transactional email. |
| `MAILER_CLOUD_SMTP_HOST` | SMTP host, e.g. `smtp-prod.mailrcld.com`. |
| `MAILER_CLOUD_SMTP_PORT` | SMTP port, typically `587`. |
| `MAILER_CLOUD_SMTP_USER` | SMTP username. |
| `MAILER_CLOUD_SMTP_PASSWORD` | SMTP password. |
| `MAILER_CLOUD_API_KEY` | API key, reserved for API-based integration if needed. |
| `MAIL_FROM_NAME` | Display sender name. |
| `MAIL_FROM_EMAIL` | Sender email address. |

Current code uses SMTP through Nodemailer with STARTTLS for port 587.

### Nimbus SMS

| Variable | Purpose |
| --- | --- |
| `NIMBUS_SMS_ENABLED` | Enables SMS sending. |
| `NIMBUS_SMS_BASE_URL` | SMS API URL. |
| `NIMBUS_SMS_USER_ID` | Provider user ID. |
| `NIMBUS_SMS_PASSWORD` | Provider password. |
| `NIMBUS_SMS_SENDER_ID` | Approved sender header, e.g. `GLDCRN`. |
| `NIMBUS_SMS_ENTITY_ID` | DLT entity ID. |
| `NIMBUS_SMS_OTP_TEMPLATE_ID` | DLT approved OTP template ID. |
| `NIMBUS_SMS_ORDER_TEMPLATE_ID` | DLT approved order template ID. |
| `NIMBUS_SMS_TIMEOUT_MS` | Provider request timeout. |

### Google Services

| Variable | Purpose |
| --- | --- |
| `RECAPTCHA_SECRET_KEY` | Server-side reCAPTCHA secret. |
| `RECAPTCHA_MIN_SCORE` | Minimum accepted score. |
| `GOOGLE_PLACES_API_KEY` | Google Places API key for reviews. |
| `GOOGLE_PLACE_ID` | Google Business place ID. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_WEB_CLIENT_ID` | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret. |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL. |
| `GOOGLE_ANDROID_CLIENT_ID` | Android OAuth client ID. |
| `GOOGLE_ANDROID_CLIENT_IDS` | Additional Android OAuth client IDs. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account JSON path for Play Integrity. |
| `PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` | Google Cloud project number. |
| `ANDROID_PACKAGE_NAME` | Android package name, e.g. `in.goldencreation.app`. |
| `ANDROID_CERT_SHA256` | Approved signing certificate hash. |
| `MOBILE_APP_API_KEY` | Mobile app API key for controlled mobile requests. |
| `ALLOW_MOBILE_APP_OTP_WITH_KEY` | Allows mobile key-based OTP flow. |
| `ALLOW_DEBUG_MOBILE_ATTESTATION` | Debug-only mobile attestation bypass. |
| `ALLOW_PRODUCTION_MOBILE_KEY_ATTESTATION` | Production mobile key fallback control. |

## 4. DigitalOcean Spaces Integration

Code location:

- `backend/services/media-storage.service.js`
- `backend/controllers/media.controller.js`
- `backend/controllers/drive.controller.js`

Capabilities:

- Public file uploads with `ACL: public-read`.
- Private Drive Storage uploads without public ACL.
- Safe storage key generation with UUID and cleaned filename.
- Public URL generation from CDN/public Spaces URL.
- Direct signed upload URLs for large video files.
- Safe deletion from Spaces after ownership/reference checks.
- Object existence checks with `HeadObject`.

Typical folders:

- `products`
- `categories`
- `brands`
- `collections`
- `banners`
- `blogs`
- `blog-videos`
- `customer-profiles`
- `staff`
- `drive`
- `private`

Operational notes:

- Do not manually delete Spaces objects unless database references have been checked.
- Keep CDN URL stable because it is stored in product/blog/media records.
- If CDN/domain changes, run a controlled URL migration.

## 5. Razorpay Integration

Code locations:

- `backend/controllers/checkout.controller.js`
- `backend/services/commerce.service.js`
- `backend/controllers/commerce-admin.controller.js`

Capabilities:

- Server-authoritative checkout quote.
- Full Online payments.
- Partial COD prepaid amount collection.
- Razorpay order creation.
- Server-side signature verification.
- Idempotent webhook handling.
- Payment ledger via `payment_transactions`.
- Webhook log via `payment_webhook_events`.
- Amount paid/COD balance reconciliation.
- COD balance collection admin action.
- Temporary stock hold and restoration for expired pending payments.

Required production configuration:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_MERCHANT_ID`

Webhook configuration:

```text
URL: https://goldencreation.in/api/payments/razorpay/webhook
Method: POST
Body: raw JSON
Header: X-Razorpay-Signature
```

Important:

- Never expose `RAZORPAY_KEY_SECRET` or webhook secret in frontend code.
- Razorpay key ID can be exposed to frontend only through the backend order response when configured.
- Webhook signature must be verified against the exact raw body.

## 6. MailerCloud Integration

Code location:

- `backend/services/email.service.js`

Current implementation:

- SMTP via Nodemailer.
- STARTTLS on port 587.
- Headers configured:
  - `mld-track-opens: false`
  - `mld-track-inbox: true`
  - `mld-track-campaign-id`

Email types:

- Customer/admin login OTP.
- Order success email.
- Payment success email.
- Password reset/security OTP for admin/staff.

DNS requirements for deliverability:

- One SPF TXT record only, combining all senders.
- DKIM records for MailerCloud and any other mail provider using their own selector names.
- One DMARC TXT record at `_dmarc.goldencreation.in`.
- MX record for the selected mailbox provider.
- PTR/rDNS matching mail host where applicable.

Operational note:

MailerCloud sender identity must match the verified sending domain/email. If `MAIL_FROM_EMAIL` is `info@goldencreation.in`, that sender must be verified and aligned with DNS. If using `goldencreation@lekhanmart.in`, the Lekhanmart domain must be authorized in MailerCloud.

## 7. Google reCAPTCHA

Code locations:

- `backend/middleware/recaptcha.middleware.js`
- `backend/services/recaptcha.service.js`

Protected actions:

- Customer email/mobile OTP request.
- Public product reviews.
- Public contact form.
- Public corporate enquiry.
- Public media upload.

The backend verifies tokens with Google and checks action/score. Mobile app flows can use additional mobile key logic where configured.

## 8. Google OAuth And Play Integrity

Google OAuth:

- Web login starts at `/api/auth/google`.
- Callback is `/api/auth/google/callback`.
- Frontend session completion uses `/api/auth/google/session`.
- Native app login uses `/api/auth/google/mobile`.

Play Integrity:

- Used for Android app request integrity.
- Requires Google Cloud credentials, project number, Android package, and certificate SHA-256.
- Production should not rely on debug bypass settings.

## 9. Google Reviews

Code location:

- `backend/controllers/google-reviews.controller.js`

Requirements:

- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`

Behavior:

- Fetches Google Place Details/reviews when configured.
- Homepage can show review score and selected reviews.
- If Google API is unavailable, frontend/backend may show fallback review data depending on implementation state.

## 10. SEO, Google Ads, Merchant Center, Meta

Code locations:

- `backend/services/seo.service.js`
- `backend/controllers/seo.controller.js`
- `backend/controllers/seo-admin.controller.js`
- Admin page: `saas-panel/src/pages/SeoMarketing.jsx`

Admin location:

```text
Admin Panel -> SEO & Marketing
```

Configuration areas:

- Site title.
- Default metadata.
- Canonical base URL.
- Default social image.
- Search Console verification token.
- GTM container ID.
- GA4 measurement ID.
- Google Ads conversion ID/label.
- Google Merchant Center ID.
- Meta Pixel ID.
- Meta CAPI dataset ID.
- Meta catalog ID.
- Custom script slots.

Public feeds:

- Google Merchant: `https://goldencreation.in/feeds/google-merchant.xml`
- Meta Catalog: `https://goldencreation.in/feeds/meta-catalog.csv`

Public SEO files:

- Sitemap index: `https://goldencreation.in/sitemap.xml`
- Robots: `https://goldencreation.in/robots.txt`
- AI summary: `https://goldencreation.in/llms.txt`

Recommended ads setup:

1. Create Google Tag Manager container.
2. Add GTM container ID in Admin -> SEO & Marketing.
3. Configure GA4 and Google Ads tags inside GTM.
4. Use Merchant Center feed URL for product approvals.
5. Add Meta Pixel ID in SEO & Marketing or through GTM.
6. Use Meta catalog feed URL for catalog ads.
7. Validate ecommerce events:
   - `view_item`
   - `view_item_list`
   - `select_item`
   - `search`
   - `add_to_cart`
   - `view_cart`
   - `begin_checkout`
   - `add_shipping_info`
   - `add_payment_info`
   - `purchase`
   - `generate_lead`
   - `sign_up`
   - `login`

## 11. DNS And Email Notes

Domain: `goldencreation.in`

Important DNS records:

- A record for root domain pointing to VPS IP.
- A/CNAME for `www`.
- A/CNAME for `admin`.
- Mail records depending on final mail provider:
  - `mail.goldencreation.in` A record if using VPS-native mail.
  - MX priority 10 to selected mail host.
  - SPF TXT record combining VPS/MailerCloud/other senders.
  - DKIM records for each sender provider.
  - DMARC TXT record.

DKIM records do not conflict when each provider uses a different selector. SPF must be a single combined TXT record, not multiple SPF records.

## 12. Maintenance Checklist

Weekly:

- Check PM2 status and logs.
- Confirm backups are being created during deployments.
- Check disk usage.
- Review failed email/SMS/payment logs.
- Review media migration failures.

Monthly:

- Test checkout with each payment mode.
- Download invoice PDF and verify layout.
- Validate Merchant feed in Google Merchant Center.
- Check Search Console indexing errors.
- Check Meta catalog diagnostics.
- Review old release backups and archive/delete according to retention policy.

Before each deployment:

- Run storefront lint/build.
- Run admin lint/build.
- Run backend build/test.
- Confirm `.env` remains unchanged.
- Create database backup.
- Deploy to a new timestamped release.
- Smoke-test homepage, product page, checkout, admin login, sitemap, and feeds.


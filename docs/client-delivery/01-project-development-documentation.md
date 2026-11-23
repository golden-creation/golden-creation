# Golden Creation Project Development Documentation

Client: Golden Creation  
Owner: Mr. Ajay Malhotra  
Delivery partner: Natho Asto Global Tech  
Responsible person: Mr. Mridul Dubey

## 1. Project Overview

Golden Creation is a custom ecommerce and operations platform for office stationery and gift items. It includes:

- Public ecommerce storefront.
- Admin panel for website, inventory, sales, billing, staff, SEO, and operations.
- Backend API with MySQL persistence.
- DigitalOcean Spaces media storage.
- Razorpay payment integration.
- MailerCloud SMTP transactional email integration.
- Google login, Google reviews, reCAPTCHA, sitemap, feed, and SEO features.
- Mobile-app supporting APIs and Google Play Integrity hooks.

## 2. Application Structure

Repository root: `D:\lekhanmart-backend-frontend-hostinger`

| Path | Purpose |
| --- | --- |
| `backend/` | Node.js Express backend, API routes, controllers, services, migrations, and production public assets. |
| `frontend/` | Public React/Vite storefront source. |
| `saas-panel/` | Admin React/Vite panel source. |
| `backend/public/` | Built storefront files served by Express. |
| `backend/public/admin/` | Built admin panel files served by Express/admin subdomain. |
| `deploy-artifacts/` | Timestamped deployment archives and deployment scripts. |
| `outputs/` | Audit, spreadsheet, Playwright, and generated verification outputs. |

## 3. Runtime Architecture

Production uses one Node.js Express application behind OpenLiteSpeed/CyberPanel reverse proxy.

Request flow:

1. Browser opens `goldencreation.in` or `admin.goldencreation.in`.
2. OpenLiteSpeed proxies to Node.js service on the VPS.
3. Express serves static storefront/admin assets and handles `/api/*` routes.
4. Express connects to MySQL through `mysql2` connection pool.
5. Media uploads are sent to DigitalOcean Spaces through S3-compatible APIs.
6. Transactional emails are sent through MailerCloud SMTP.
7. Razorpay checkout and webhook events are handled server-side.

Production process:

- PM2 app name: `goldencreation-api`
- VPS app path: `/opt/goldencreation/current`
- Release pattern: `/opt/goldencreation/releases/<timestamp>`
- Backup pattern: `/opt/goldencreation/backups/<release-name>-<timestamp>`

## 4. Technology Stack

### Backend

- Node.js 20.x
- Express 5
- MySQL
- PM2 process manager
- OpenLiteSpeed/CyberPanel reverse proxy
- PDFKit invoice/catalog PDF generation
- ExcelJS import/export
- DigitalOcean Spaces via AWS SDK S3 client

### Storefront

- React 19
- Vite 8
- React Router 7
- CSS modules/global CSS in source files
- Route-level lazy loading and skeleton loading states
- Google reCAPTCHA compatible public write forms
- GTM/dataLayer ecommerce event hooks

### Admin Panel

- React 19
- Vite 8
- React Router 7
- Tailwind utility classes and custom CSS
- Lucide icons
- ExcelJS and JSZip for spreadsheet workflows
- Role and permission aware navigation

## 5. External Libraries

### Backend Dependencies

| Package | Version | Usage |
| --- | --- | --- |
| `@aws-sdk/client-s3` | `^3.1053.0` | DigitalOcean Spaces upload, delete, read, object checks. |
| `@aws-sdk/s3-request-presigner` | `^3.1068.0` | Signed upload URLs for direct video uploads. |
| `bcrypt` | `^6.0.0` | Admin/staff password hashing. |
| `body-parser` | `^2.3.0` | Request body helpers where needed. |
| `cors` | `^2.8.6` | Allowed frontend origin handling. |
| `dotenv` | `^17.4.0` | Environment variable loading. |
| `exceljs` | `^4.4.0` | Product import/export, lead export, discount export. |
| `express` | `^5.2.1` | HTTP server and routing. |
| `google-auth-library` | `^10.6.2` | Google OAuth/native token and Play Integrity support. |
| `jsonwebtoken` | `^9.0.3` | Admin and customer bearer tokens. |
| `multer` | `^2.3.0` | Multipart upload parsing. |
| `mysql2` | `^3.24.3` | MySQL connection pool and queries. |
| `nodemailer` | `^10.0.0` | MailerCloud SMTP email delivery. |
| `otp-generator` | `^4.0.1` | OTP generation. |
| `pdfkit` | `^0.18.0` | PDF bills, invoices, and catalogs. |
| `qs` | `^6.16.0` | Query parsing utilities. |
| `nodemon` | `^3.1.14` | Development server reload only. |

### Storefront Dependencies

| Package | Version | Usage |
| --- | --- | --- |
| `react` | `^19.2.4` | UI rendering. |
| `react-dom` | `^19.2.4` | Browser DOM rendering. |
| `react-router-dom` | `^7.18.3` | Public routing and redirects. |
| `vite` | `^8.2.2` | Frontend build/dev server. |
| `eslint` + plugins | `^9.39.4` | Code-quality checks. |
| `tailwindcss`, `postcss`, `autoprefixer` | listed dev dependencies | CSS build/tooling support. |

### Admin Dependencies

| Package | Version | Usage |
| --- | --- | --- |
| `react` | `^19.2.4` | Admin UI rendering. |
| `react-dom` | `^19.2.4` | Browser DOM rendering. |
| `react-router-dom` | `^7.18.3` | Admin routing. |
| `lucide-react` | `^1.8.0` | Admin icons. |
| `react-icons` | `^5.6.0` | Additional icons. |
| `react-datepicker` | `^9.1.0` | Date inputs. |
| `exceljs` | `^4.4.0` | Admin-side workbook handling. |
| `jszip` | `^3.10.1` | XLSX/archive support. |
| `vite`, `eslint`, `tailwindcss`, `postcss`, `autoprefixer` | listed dev dependencies | Build and lint tooling. |

## 6. Authentication And Authorization

### Customer Authentication

Customer login supports:

- Email OTP.
- Mobile OTP.
- Google login.
- Native Google login for app flows.

Customer protected APIs use:

```http
Authorization: Bearer <customer_access_token>
```

Customer sessions use access and refresh tokens:

- `CUSTOMER_ACCESS_TOKEN_MINUTES`
- `CUSTOMER_REFRESH_TOKEN_DAYS`
- `CUSTOMER_JWT_SECRET` or fallback `JWT_SECRET`

### Admin And Staff Authentication

Admin login supports:

- Email/password login.
- Optional email OTP-based two-factor authentication.
- Password reset by email OTP.
- Profile password change with security OTP.

Admin protected APIs use:

```http
Authorization: Bearer <admin_jwt_token>
```

Admin roles include:

- Super Admin
- Technical Developer
- Admin
- Salesman
- Other staff roles with permissions

Technical Developer has full platform access similar to Super Admin but can be deleted by admin. Super Admin is protected as the primary owner-level account.

### Permissions

Admin module access is controlled by backend middleware and frontend route guards. Important permissions include:

- `dashboard`
- `products`
- `orders`
- `brands`
- `categories`
- `inventory`
- `warehouse`
- `store`
- `seo_marketing`
- `tasks`
- `drive`
- `users`
- `roles`
- `customers`
- `leads`
- `sales_catalogs`
- `billing`
- `suppliers`
- `reports`
- `discounts`
- `shipping`
- `payments`
- `blog`

Salesman accounts are restricted to sales-related modules, profile, drive, and tasks as configured.

### Delete Authorization

Deletion across admin modules can be routed through removal approval:

1. Staff requests deletion.
2. Request is stored in `removal_requests`.
3. Super Admin approves or rejects.
4. Approved requests execute the target delete action.

Admin-only direct delete is used only where authorized.

## 7. Core Business Modules

### Storefront

- Homepage with product sections, trusted brands, Google reviews, and responsive mobile UX.
- Product listing with category, brand, tag, collection, and stock filters.
- Product detail with variants, images, reviews, out-of-stock handling, share, zoom, and sticky mobile CTA.
- Cart and checkout.
- Saved addresses.
- Wishlist.
- Customer orders and invoice download.
- Returns.
- Contact form and corporate enquiry form.
- Blog.
- Static policy/content pages.

### Admin Panel

- Dashboard and WhatsApp campaign helper.
- Product Management with Excel import/export.
- Category, Brand, Tag, Collection, Menu, Bundle management.
- Inventory Management with Website/Warehouse/Shop stock reconciliation.
- Warehouse and Shop operational catalog views.
- Orders and dispatch handling.
- Shipping rule management.
- Payment settings and payment management.
- Discount management.
- Billing Management and Performa Invoice PDF download/send.
- Supplier Management.
- Lead Management and Sales Catalog Management.
- Enquiry Management.
- Corporate Enquiries.
- Blog Management.
- SEO & Marketing.
- Drive Storage.
- Staff Management, roles, profile, activity logs.

## 8. Inventory And Stock Model

The product catalog is shared across Website, Warehouse, and Shop.

Stock buckets:

- Website stock: `products.stock_quantity`
- Warehouse stock: physical stock bucket
- Shop stock: physical stock bucket

Inventory reconciliation:

```text
Website Stock should equal Warehouse Stock + Shop Stock
```

Indicators:

- Green row: stock is balanced.
- Red row: mismatch.
- Blinking red: zero website stock.
- Blinking yellow dot: stock is at or below low-stock warning level.

Stock changes are audited with product, bucket, previous count, new count, actor, reason, and timestamp.

Checkout still reduces Website stock. Physical bucket deduction is selected during dispatch.

## 9. Product Import And Export

Product Management is the central place for product Excel import/export.

The export is designed to match the import format so the client can:

1. Export products.
2. Edit product data or stock locally.
3. Re-import the same workbook.
4. Update existing products by ID, SKU, handle, or name.

Stock columns:

- `Variant Inventory Qty` = Website stock.
- `Warehouse Stock` = Warehouse physical stock.
- `Shop Stock` = Shop physical stock.

Remote spreadsheet images are copied into DigitalOcean Spaces for future imports. Existing Shopify references can be migrated through background media migration tooling.

## 10. Payments

Payment modes:

- Full Online
- Partial COD
- Full COD

Razorpay:

- Standard Checkout is used for online/partial-COD payments.
- Orders are created server-side.
- Payment signatures are verified server-side.
- Webhooks use raw request body and are idempotently tracked.
- Pending Razorpay orders hold stock temporarily and restore stock once if payment expires.

Billing and orders show:

- Order total.
- Online amount paid.
- COD amount due.
- COD collection status.

## 11. Shipping

Shipping rules support:

- Priority.
- Product/category/collection/global targets.
- All India/state/pincode locations.
- Minimum-order threshold.
- Category descendant matching.

Resolution order:

1. Highest priority.
2. Target specificity: product, collection, category, global.
3. Highest valid minimum-order threshold.

Checkout is blocked when no applicable shipping rule exists.

## 12. SEO And Marketing

SEO is implemented as a platform feature.

Features:

- Backend HTML metadata injection for first response.
- Product/category/brand/collection/blog metadata.
- Product JSON-LD and Breadcrumb JSON-LD.
- Article/BlogPosting JSON-LD.
- VideoObject JSON-LD for video blogs.
- Sitemap index and split sitemaps.
- `robots.txt`.
- `/llms.txt`.
- Google Merchant feed.
- Meta catalog feed.
- GTM/dataLayer ecommerce events.
- Admin-managed SEO settings and header/body script slots.

Admin module: `SEO & Marketing`.

Privileged users can configure:

- Site title.
- Default meta title/description.
- Canonical base URL.
- Default social image.
- Search Console verification.
- GTM container ID.
- GA4 measurement ID.
- Google Ads conversion ID/label.
- Google Merchant Center ID.
- Meta Pixel ID.
- Meta CAPI dataset ID.
- Meta catalog ID.

## 13. Media Management

Media uploads are stored in DigitalOcean Spaces.

Supported media areas:

- Product images.
- Variant images.
- Category, brand, collection, bundle, banner/menu images.
- Blog images and videos.
- Customer profile images.
- Staff/admin profile images.
- Drive Storage files.

Video upload:

- MP4/WebM up to configured size limits.
- Direct signed upload URL is used so large videos do not need to be buffered in Node memory.

Deletion policy:

- Spaces objects should be deleted only when the object belongs to this application and no database record still references it.

## 14. Database Overview

Primary tables include:

- Catalog: `products`, `product_images`, `product_variants`, `variant_options`, `variant_option_values`, `variant_attribute_map`
- Taxonomy: `categories`, `brands`, `tags`, `product_tags`, `collections`, `collection_products`
- Commerce: `orders`, `order_items`, `shipping_rules`, `shipping_rule_targets`, `shipping_rule_locations`
- Payments: `payment_settings`, `partial_cod_rules`, `payment_transactions`, `payment_webhook_events`, `payment_integrations`
- Discounts: `discounts`, `discount_coupon_codes`, `discount_conditions`, `discount_usage`, `discount_audit_logs`
- Customers: `users`, `customer_sessions`, `customer_cart_items`, `customer_wishlist_items`, `customer_addresses`
- Admin/RBAC: `admins`, `roles`, `admin_activity`, `admin_auth_otps`, `admin_notifications`, `removal_requests`
- Inventory: `warehouse_locations`, `warehouse_products`, `warehouse_stock`, `stock_movements`
- Billing: `manual_bills`, `manual_bill_items`, `bill_delivery_logs`, `gst_returns`
- Leads/Sales: `sales_leads`, `sales_catalogs`, sales catalog item/share tables
- Content: `blog_posts`, `content_pages`, `menus`, `corporate_enquiries`, `contact_enquiries`, `newsletter_subscribers`, `returns`
- Media/SEO: `media_assets`, `remote_media_imports`, `seo_settings`, `seo_scripts`, `seo_script_revisions`, `seo_redirects`, `seo_feed_logs`
- Drive: `drive_folders`, `drive_files`

Migrations are idempotent and are run by:

```bash
npm run db:setup
npm run db:commerce
npm run db:customer
node scripts/ensure-seo-schema.js
```

`npm start` does not run database setup. `npm run db:setup` is schema-only unless a local seed is explicitly authorized. Do not run `db:setup` or `db:seed` from the production start command. See `backend/HOSTINGER_DEPLOY.md`.

## 15. Deployment Process

Standard deployment flow:

1. Build storefront:

```bash
cd frontend
npm run lint
npm run build
```

2. Build admin:

```bash
cd saas-panel
npm run build
```

3. Copy built storefront into `backend/public`.
4. Copy built admin into `backend/public/admin`.
5. Build backend:

```bash
cd backend
npm run build
```

6. Create timestamped `.tgz` release excluding `node_modules`.
7. Upload release to `/opt/goldencreation/incoming`.
8. Run remote release script:
   - Backup active release.
   - Backup `.env`.
   - Backup database with `mysqldump`.
   - Backup OpenLiteSpeed vhost config.
   - Extract new release.
   - Preserve runtime files and `.well-known`.
   - Run `npm ci --omit=dev`.
   - Run build check and migrations.
   - Switch `/opt/goldencreation/current`.
   - Restart `goldencreation-api` with PM2.
   - Run health checks.

## 16. Verification Commands

Backend:

```bash
cd backend
npm run build
npm test
```

Storefront:

```bash
cd frontend
npm run lint
npm run build
```

Admin:

```bash
cd saas-panel
npm run lint
npm run build
```

Production smoke checks:

```bash
curl -I https://goldencreation.in/
curl -I https://goldencreation.in/home
curl -I https://admin.goldencreation.in/admin/
curl -I https://goldencreation.in/api/health
curl -I https://goldencreation.in/sitemap.xml
curl -I https://goldencreation.in/robots.txt
curl -I https://goldencreation.in/feeds/google-merchant.xml
```


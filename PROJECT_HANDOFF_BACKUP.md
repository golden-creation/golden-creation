# Lekhanmart / Golden Creation Project Handoff

Backup created: 2026-09-07

Chat backup link:
https://chatgpt.com/s/cx_6a9ea6d183848191a0251ffbd52e5d45

## Project Context

Project: Lekhanmart / Golden Creation ecommerce platform

Workspace:
`D:\lekhanmart-backend-frontend-hostinger`

Main stack:
- Main website: React
- Admin panel: React
- Backend: Node.js + Express
- Database: MySQL
- Mobile application planned/mentioned: Flutter

Live domains:
- Main website: `https://goldencreation.in`
- WWW: `https://www.goldencreation.in`
- Admin panel: `https://admin.goldencreation.in`

VPS:
- Provider/server: Hostinger VPS with CyberPanel/OpenLiteSpeed
- Server IP: `187.127.169.81`
- App path on VPS: `/opt/goldencreation/current`
- PM2 app: `goldencreation-api`

Sensitive values are intentionally not written here. Check the actual `.env` files, VPS note file, or the deployment environment for DB credentials, Google keys, DigitalOcean Spaces keys, reCAPTCHA keys, and API secrets.

## Important Deployment Notes

- Backend now uses a MySQL connection pool instead of a single connection to reduce `ECONNRESET` failures.
- Admin panel is served from `admin.goldencreation.in` with Vite `base: '/'`.
- Main website and admin assets were built locally and deployed to the VPS public folder.
- SSL was issued for `goldencreation.in`, `www.goldencreation.in`, and `admin.goldencreation.in`.
- Known live API checks were previously verified:
  - `/api/menus/navbar`
  - `/api/brands?limit=100`
  - `/api/products/variant-filters`
  - `/api/google-reviews`
  - `/api/admin/login`

## Recent Implemented Work

Admin and website:
- Fixed admin subdomain static routing.
- Fixed CORS behavior for live domains.
- Grouped admin sidebar menus into:
  - Website Management
  - Business Management
  - Account & Audit
- Updated footer social links:
  - Facebook
  - Instagram
  - LinkedIn
- Protected cart and wishlist routes for logged-in users only.
- Cleared cart/wishlist state on logout.
- Redirected unauthenticated add-to-cart, wishlist, bundle, and buy-now flows to login.

Product import:
- Shopify-style Excel import support was upgraded in admin product management.
- Backend import now supports Shopify-like columns including handle, title, category, tags, SKU, inventory, price, image URLs, status, and variant option columns.
- Import flow can download remote image URLs, upload them to DigitalOcean Spaces, and save the Spaces URLs in the database.
- Cleaned Excel file created:
  `C:\Users\My-PC-Win10\Downloads\products_export_cleaned_for_lekhanmart.xlsx`

Google reviews:
- Google reviews endpoint added/verified.
- Homepage review section was updated to fetch Google reviews, but it may need another live check if old fallback reviews still appear.

## Modules Added Or Expanded During This Project

- Staff Management
- Website Products
- Category Management
- Brand Management
- Tag Management
- Collection Management
- Menu Management
- Product Variants
- Warehouse Management
- Store Settings
- Shipping Management
- Billing Management
- Supplier Management
- Corporate Enquiries
- Bundle Shopping / Bundle Management
- Discount Management
- Reports
- Activity Log
- Google Reviews
- DigitalOcean Spaces media handling
- reCAPTCHA support planning/details

## Current User Request Before Backup

The user asked for DLT SMS templates after DLT registration. Needed output:
- Suggested sender headers.
- OTP templates.
- Order status templates.
- Payment templates.
- Prepaid COD templates.
- Invoice/review templates.
- Corporate enquiry templates.
- Admin/staff alert templates.
- Promotional/explicit consent templates.

Preferred sender header suggestions:
- `GLDCRN`
- `GOLDEN`
- `GCRNIN`
- `LKHNMT`
- `LKMART`

## Suggested Next Steps

1. Continue from this workspace, not from any unrelated project folder.
2. Verify latest live site behavior after hard refresh:
   - admin login
   - navbar/menu API
   - brands API
   - collection filters
   - Google reviews section
   - cart/wishlist login protection
3. If the user wants product upload, import:
   `C:\Users\My-PC-Win10\Downloads\products_export_cleaned_for_lekhanmart.xlsx`
4. For any deployment work:
   - Build backend/admin/main frontend.
   - Upload changed files to `/opt/goldencreation/current`.
   - Restart PM2 app `goldencreation-api`.
   - Test live URLs and API endpoints.

## Safety Notes For Next Account

- Do not expose secrets in normal replies.
- Do not overwrite user `.env` values without confirming.
- Do not revert unrelated working tree changes.
- The repo may be dirty from build artifacts and deployed patches.


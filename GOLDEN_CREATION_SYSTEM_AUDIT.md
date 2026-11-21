# Golden Creation system audit

Read-only audit of the current workspace. No packages were installed, no migrations were run, no production data was changed, and nothing was deployed.

Audit date: 21 November 2026.

Live references:

- Website: https://www.goldencreation.in
- Admin: https://admin.goldencreation.in
- Storefront source: `frontend/`
- API source: `backend/`
- Admin source: `saas-panel/`

Android application source is not in this repository.

## 1. System architecture

```text
Storefront (React + Vite, frontend/)
Admin panel (React + Vite, saas-panel/)
        |
        | HTTPS JSON
        v
Express API (backend/, Node 20, mysql2)
        |
        +-- MySQL  (menus, brands, categories, products, orders, customers, admins)
        +-- DigitalOcean Spaces (media, when configured)
        +-- Razorpay, Google, SMS, and mail providers
```

Production hosting is one Node process that serves:

- `https://www.goldencreation.in` from `backend/public`
- `https://admin.goldencreation.in` from `backend/public/admin`
- `/api/*` from the same process

Local development is three processes:

- API on port 5000
- Storefront Vite on port 5174
- Admin Vite on its default port, 5173

There is no Android module, Gradle project, or Kotlin/Java source in this workspace. Mobile support in the API is limited to Play Integrity helpers, `assetlinks.json`, and `MOBILE_APP_API_KEY`.

### Frontend

- React 19, React Router 7, Tailwind 3, Vite 8.
- Data access is concentrated in `frontend/src/lib/api.js`.
- Routes are declared in `frontend/src/App.jsx`.
- The live navbar is `frontend/src/components/Navbar.jsx`. It loads `GET /api/menus/navbar`, then replaces brand-titled items from `GET /api/brands`.
- Older page files still exist beside the connected pages (`Home.jsx` and `ConnectedHome.jsx`, `Cart.jsx` and `ConnectedCart.jsx`). The router uses the connected versions for cart, checkout, wishlist, orders, profile, and product detail.

### Backend

Route mounts in `backend/app.js`:

- `/api/products`, `/api/categories`, `/api/brands`
- `/api/auth`, `/api/customer`, `/api/orders`, `/api/checkout`
- `/api/admin` (login is public; later routes use `requireAdminAuth`)
- merchandising, media, content, referrals, affiliate, store, corporate, bundles, discounts

Schema is not a migration history. It is a set of idempotent Node scripts in `backend/scripts/ensure-*.js`. `npm run db:setup` is the entry point and also writes seed rows.

### Admin panel

`saas-panel/` has 53 page modules, including dashboard, products, brands, categories, menus, orders, customers, media, roles, warehouse, billing, SEO, referrals, and leads. It calls `/api/admin/*` using `saas-panel/src/lib/api.js`.

### Authentication

- Customers: JWT access and refresh tokens (`CUSTOMER_JWT_SECRET`).
- Admins: JWT (`JWT_SECRET`) plus optional login OTP. `backend/routes/admin.routes.js` applies `requireAdminAuth` after the login and password-reset routes. Salesman accounts are limited to a prefix allow-list. Deletes on many modules also pass `requireAdminDeleteApproval`.
- Android: app key and Play Integrity settings. The app binary is not here, so compatibility cannot be proven from this repo.

## 2. Current environment status

| Check | Result |
| --- | --- |
| Local API `GET /api/health` | Responds `{ "status": "ok" }`. This check does not touch MySQL. |
| Local MySQL port 3306 | Nothing is listening. MySQL, MariaDB, XAMPP, Laragon, WAMP, and Docker are not installed. |
| Local DB target | `DB_HOST=localhost`, `DB_PORT=3306`, `DB_NAME=lekhanmart`, `DB_USER=root`. Password is unset. |
| Local `NODE_ENV` | `development` |
| Local storefront API | `http://localhost:5000/api` |
| Local admin API | `http://localhost:5000/api` |
| Live website API | `https://www.goldencreation.in/api` |
| Live admin API | same-origin `/api` on `admin.goldencreation.in` |
| Live brand catalog | 108 active brands, first `3M`, last `Zoook` |
| Live navbar menu | 9 visible items. No category children. Shop By Brand is the only stored dropdown. |
| Git on this PC | `git` is not installed, so a checkpoint cannot be created here yet. |
| Project CI | No project workflow. Only dependency workflows under `node_modules`. |
| Backup jobs | No backup or restore script in the repository. |

Local and live databases are separate. This workspace cannot see the production database name or credentials, and it was not connected to them.

While MySQL is down, two development fallbacks are active:

- Public navbar: `backend/data/dev-navbar-menu.json`, used only by `GET /api/menus/navbar`.
- Public brands: `backend/data/dev-brand-catalog.json`.

Both run only when `NODE_ENV` is not `production` and the database connection fails. Admin menu reads do not use the navbar file. A successful database query skips both files. They are not cached.

Product reads use a different fallback: `backend/config/mock-store.js` returns nine demo products when the product query fails. That is why the local homepage can show Parker and Midori items that are not the live catalog.

## 3. Confirmed issues

| ID | Severity | Component | Root cause | Path | Production deploy needed |
| --- | --- | --- | --- | --- | --- |
| C1 | Critical | Local database | MySQL is not installed, so Admin Panel writes cannot be stored. | `backend/config/db.js`, `backend/.env` | No |
| C2 | Critical | Secrets | A local `.env` holds third-party credentials. The file is gitignored, but it is inside this downloaded project folder. | `backend/.env` | No. Do not commit it. |
| C3 | High | Live brand menu | The deployed storefront bundle requests `limit:100` once. Page 1 ends at TVS. Eight brands remain on page 2. | Live asset `Navbar-qBCUj7cL.js`. Source fix is already in `frontend/src/lib/api.js` and `frontend/src/components/Navbar.jsx`. | Yes, storefront only |
| C4 | High | Schema bootstrap | `npm run db:setup` always inserts roles, a local admin, settings, and menu rows. Matching menu titles are updated. Running it twice, or against a catalog import, rewrites navigation. Demo products are gated by `SEED_DEMO_DATA`, which is currently unset. | `backend/scripts/ensure-admin-modules-schema.js` | Must never be run on production |
| C5 | High | Local catalog fidelity | With the database down, products come from the mock store, not from Golden Creation's catalog. | `backend/controllers/product.fallback.controller.js`, `backend/config/mock-store.js` | No |
| C6 | Medium | Navbar behavior | Any menu title containing "brand" is treated as the brand dropdown. On the live site, "Brand Pen" opens the brand list instead of `/writing-essentials?category=440`. | `frontend/src/components/Navbar.jsx` (`isBrandMenuItem`) | Only if the behavior should change |
| C7 | Medium | Homepage merchandising | Sections pad to five products from the general list when keyword matches are short, so unrelated products appear. | `frontend/src/pages/ConnectedHome.jsx` (`showcaseProducts`) | Yes, if changed |
| C8 | Medium | Health check | `/api/health` returns ok when MySQL is down. | `backend/app.js` | Optional |
| C9 | Medium | Tooling | Git is not available on this machine. There is no project CI, backup script, or rollback runbook. | Repository root | Process, not a code deploy |
| C10 | Low | Empty descriptions | Catalog cards use "Premium stationery selected for everyday use." when a description is empty. | `frontend/src/pages/WritingEssentials.jsx` | Content, not required for the brand fix |
| C11 | Low | SEO host | `robots.txt` points the sitemap at `https://goldencreation.in/sitemap.xml` while the site is also served on `www`. | `backend/controllers/seo.controller.js` | Yes, if canonical host is standardized |

The live brand API itself is not limited to 100. `GET /api/brands?limit=500&sort=name` returns all 108 brands and a pagination total. The defect is the old frontend bundle.

## 4. Suspected issues that still need verification

These were not fully exercised. No orders or payments were created.

- Checkout, Razorpay, and webhooks on a local database. Payment code must not be changed until a test-mode checklist is approved.
- Customer OTP and SMS. Local config can expose a development OTP. Confirm production has that switch off.
- Admin CRUD for all 53 modules. The screens exist. They cannot be proven until MySQL is running.
- Whether production `NODE_ENV` is `production`. The client docs say it should be. If a backend deploy leaves it as `development`, the JSON snapshots could be served during a database outage.
- Product, price, and stock agreement between the website and the Android app. The app source is absent.
- Duplicate page modules (`Cart.jsx` versus `ConnectedCart.jsx`, and the same pattern elsewhere) may still be imported accidentally.
- `express.json({ limit: "12mb" })` accepts large JSON bodies, which is consistent with base64 image uploads and is also a denial-of-service surface.
- CORS allows requests that omit `Origin` when origins are configured, and allows every origin when `FRONTEND_URL` is empty. Mobile clients rely on the no-origin path. It should be confirmed against the production environment, not opened further.

## 5. Security findings

No penetration test was run.

- Admin routes after login require a bearer token and role checks. Login, OTP verification, and password reset are intentionally public and need rate limits. A general-purpose rate limiter was not found outside the mobile OTP settings.
- File uploads use Multer and an admin auth gate. Delete operations on media and drive files ask for a second approval. Upload type and size limits should be reviewed before any upload change.
- Secrets belong only in untracked `.env` files. `backend/.env.example` uses placeholders. The real local `.env` must stay untracked. Rotate any key that has been copied inside a shared zip.
- `db:setup` creates a known local admin account. Do not run that script on the production server.
- The development brand and menu snapshots contain public catalog names and links only. They must not be treated as a backup, and they must not be served when `NODE_ENV=production`.
- Customer, order, session, OTP, wallet, and payment tables must stay out of any development import.
- HTTPS is in place on the live site. This audit did not inspect the server certificate or firewall.

## 6. Database repair plan

Do not connect localhost to production MySQL.

MySQL 8.0 is compatible with `mysql2` 3.24, InnoDB, `utf8mb4_unicode_ci`, JSON columns, and the brand `GROUP BY brands.id` query under MySQL 8's default SQL mode.

Approved sequence, still not executed:

1. Install MySQL Server 8.0 on this PC only. Listen on port 3306. Use the default authentication plugin.
2. Set a local `DB_PASSWORD` in `backend/.env`. Keep `DB_HOST=localhost` and `DB_NAME=lekhanmart`.
3. On the empty local database, run, with `SEED_DEMO_DATA` unset:
   - `npm run db:setup`
   - `npm run db:commerce`
   - `npm run db:customer`
   - `node scripts/ensure-referral-affiliate-schema.js`
4. Do not run `ensure-orders-schema.js` first. Its smaller `orders` table would block the fuller definition because the scripts use `CREATE TABLE IF NOT EXISTS`.
5. Prove the API is reading MySQL: the navbar log must not mention the development menu, and a new `LOCAL-SETUP-CHECK` menu item must survive an API restart.
6. Do not run `db:setup` again after a catalog import. The menu upsert rewrites matching titles.
7. Only with a separate approval, export a catalog-only dump from the production server. Include categories, brands, products, images, variants, tags, collections, menus, and bundles. Exclude users, admins, passwords, sessions, OTPs, orders, bills, payments, carts, addresses, wallets, reviews, and activity logs. Import that file into local `lekhanmart` only.

Until step 5 passes, keep the JSON fallback. Remove it in its own change after the database proof.

## 7. Admin Panel repair plan

The panel code is present. Reliability cannot be claimed while MySQL is down.

After the local database is up, test these with `LOCAL-SETUP-CHECK` records, then hide them instead of deleting production-like data:

- Login and role guard
- Menu create and update, then confirm the storefront navbar
- Brand, category, and product create, update, price, and stock
- Media upload and the displayed image URL
- Order list read-only against local test orders, not live orders
- Customer list remains empty until a local test customer is created
- Confirm none of these rows appear on the live site

Do not start this pass by editing payment, refund, or delete flows.

## 8. Website repair plan

Already in source, waiting for an approved storefront deploy:

- Load every brand page until `pagination.total` is reached. Callers no longer send `limit: 100`.
- Files: `frontend/src/lib/api.js`, `frontend/src/components/Navbar.jsx`, `frontend/src/pages/ConnectedHome.jsx`, `frontend/src/pages/Brands.jsx`, `frontend/src/pages/WritingEssentials.jsx`.
- After deploy, Shop By Brand on the live site must include Uniball through Zoook.
- This deploy does not require the JSON fallback files. Keep production `NODE_ENV=production`.

Later, after approval, and not in the same deploy:

- Decide whether "Brand Pen" should navigate to category 440 or keep opening the brand list. The live site currently opens the brand list.
- Stop homepage sections from padding with unrelated products.
- Replace empty descriptions from the catalog, not with a shared sentence.
- Re-test search, filters, wishlist, cart, checkout, and login on the local database. Those flows still fall through to mock products today.

The current visual design stays as it is unless a fix requires a layout change. The brand dropdown already scrolls.

## 9. Android compatibility plan

No Android source is in this repository, so no app update can be prepared or published from here.

The shared contract the app is expected to use:

- `GET /api/brands?page=&limit=&sort=name` with `pagination.total`
- `GET /api/categories`
- `GET /api/products`
- customer auth and order routes under `/api/customer` and `/api/orders`

The brand repair keeps that contract. It does not change the response shape. Clients that request `limit=100` still receive the first page; clients that follow `pagination.total`, which the new storefront does, receive the rest.

Before any app release, compare the app's base URL with `https://www.goldencreation.in/api` and run the product, category, brand, cart, auth, and order calls against a staging key. Do not point the app at localhost.

## 10. Prioritized roadmap

| Order | Work | Severity | Risk | Deploy |
| --- | --- | --- | --- | --- |
| 1 | Keep production data untouched. Keep secrets out of git. Rotate keys if the project zip was shared. | Critical | Low if limited to local files | No |
| 2 | Install local MySQL 8.0 and apply schema scripts once, on the empty local database. | Critical | Medium, because `db:setup` writes seed rows | No |
| 3 | Prove admin create/read/update for menu, brand, category, and product on local data. | High | Low | No |
| 4 | Deploy the storefront brand pagination fix only. | High | Low. API shape stays the same. | Yes, frontend |
| 5 | Optional catalog-only import, after a named table list is approved. | High | Medium | No |
| 6 | Remove JSON fallbacks only after step 3 passes. | Medium | Low | Local only |
| 7 | Homepage section padding, empty descriptions, sitemap host. | Medium / Low | Low to medium | Separate frontend or content deploy |
| 8 | Checkout, payment, OTP, and upload hardening. | High if defects are found | High | Separate, explicit approval |
| 9 | Android verification when source or a test build is available. | Medium | Do not publish automatically | No |

Each later batch needs a Git checkpoint, tests, a short change note, and a rollback. Git has to be installed on this PC before the first checkpoint.

## 11. Testing strategy

Already run during the navbar work:

- `node --test test/brand-list.test.js test/brand-fallback.test.js test/menu-fallback.test.js` in `backend/`
- `node --test src/lib/brandCatalog.test.js` in `frontend/`
- Local `GET /api/brands?limit=500&sort=name` returned 108 brands, `3M` through `Zoook`
- Local and live `GET /api/menus/navbar` returned the same nine titles and URLs
- Desktop and mobile storefront menus were checked in the browser
- No payment and no real order was submitted

Still required after MySQL exists:

- Admin login, then one create and one update for menu, brand, category, and product
- Restart the API and confirm the rows remain
- Confirm the live site does not show `LOCAL-SETUP-CHECK`
- Storefront search, filter, product detail, wishlist, and cart against local rows
- Checkout only in Razorpay test mode, after approval
- `npm test` in `backend/` and production builds of `frontend/` and `saas-panel/`

## 12. Deployment and rollback

Brand-menu deploy, when approved:

1. Build `frontend/` only.
2. Publish the storefront assets. Do not upload `backend/data/dev-*.json` and do not change production MySQL.
3. Confirm the new navbar asset does not contain `limit:100`.
4. Confirm Zoook is visible in Shop By Brand.
5. Rollback by restoring the previous `backend/public` storefront build. No database rollback is required for this change.

Local database rollback:

- Keep a dump of the local `lekhanmart` database before each schema or import step.
- Restore that dump into localhost only.
- Never restore a local dump onto the production server.

Production database rollback is out of scope until a server-level backup is identified. This repository does not contain one.

## Approval gate

Implementation has not started. The next safe batch, after approval, is local MySQL installation and a single run of the schema scripts against empty `lekhanmart`. The storefront brand deploy can be approved separately and does not depend on that local database.

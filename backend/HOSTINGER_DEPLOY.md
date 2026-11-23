# Lekhanmart Hostinger Deploy

This backend is prepared to serve the built React frontend from the same domain.

What changed:
- `package.json` uses `node server.js` for production start
- `app.js` serves the built frontend from `public/`
- frontend API defaults now use the current site origin, so production calls go to `/api`

Before deploying:
1. Build the frontend
2. Copy the frontend `dist` contents into this backend's `public` folder
3. Set Hostinger environment variables from `.env.example`
4. Import your MySQL database into Hostinger

Recommended Hostinger setup:
- Type: `Node.js Web App`
- Node version: `20.x`
- Build command: `npm install && npm run build`
- Start command: `npm start`

`npm start` runs `node server.js`. It does not run `db:setup` or `db:seed`.

Do not add `npm run db:setup` or `npm run db:seed` to the production start or deploy command.

- `npm run db:setup` creates or alters tables only. It does not seed menus, accounts, permissions, warehouses, products, orders, or stock unless `ALLOW_DATA_SEED=yes` and `NODE_ENV` is not `production`. Production always refuses the seed.
- `npm run db:seed` is local only. It sets `ALLOW_DATA_SEED=yes` and exits immediately when `NODE_ENV=production`.

Remaining schema work, not run by this change:

- `db:setup` still applies additive `CREATE TABLE` and `ALTER TABLE` statements. Review those before running them on production.
- Two null-only backfills stay on the schema path: `products.gst_inclusive` where the value is null, and `users.otp_expires_at` where an OTP exists and the expiry is null. They do not replace an existing value.
- `npm run db:commerce`, `npm run db:customer`, and the other `ensure-*.js` scripts are separate. They are not part of `npm start`. Do not run them on production until each one is reviewed.
- `ensure-expansion-schema.js` still contains an unreachable `if (false)` warehouse-stock migration. It does not run.
- Domain: `lekhanmart.online`

Important:
- If `lekhanmart.online` is currently a Website Builder website, replace/remove that website first before adding the Node.js app.
- After changing environment variables in Hostinger, use `Settings and redeploy`.

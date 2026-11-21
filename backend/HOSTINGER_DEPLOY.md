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
- Domain: `lekhanmart.online`

Important:
- If `lekhanmart.online` is currently a Website Builder website, replace/remove that website first before adding the Node.js app.
- After changing environment variables in Hostinger, use `Settings and redeploy`.

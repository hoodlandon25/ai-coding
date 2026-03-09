# Deploy PixelCode Hub On GitHub + Public Backend

## Important
GitHub Pages can host the frontend only (HTML/CSS/JS).  
Your real-time Socket.io server must run on a backend host (Render, Railway, Fly.io, VPS, etc.).

## 1) Deploy backend (`server.js`)
1. Push this repo to GitHub.
2. Create a web service on Render (or similar) from the repo.
3. Use:
- Build command: `npm install`
- Start command: `npm start`
4. Set environment vars:
- `PORT=3000` (or leave default platform port)
- `CORS_ORIGIN=https://<your-github-username>.github.io`  
  If project page URL is used, include that full origin too.
5. Confirm backend is live:
- `https://<your-backend-domain>/healthz` should return `{ "ok": true }`.

## 2) Deploy frontend to GitHub Pages
This repo includes `.github/workflows/deploy-pages.yml` and publishes from `public/`.

1. In GitHub repo settings, open `Pages`.
2. Set source to `GitHub Actions`.
3. Push to `main` and wait for workflow `Deploy Frontend To GitHub Pages`.

## 3) Connect frontend to backend
Open your GitHub Pages URL once with:

`https://<your-github-username>.github.io/<repo-name>/?socket=https://<your-backend-domain>`

This stores the backend URL in localStorage for future visits.

## 4) Local dev still works
Run backend locally:

`npm start`

Then open:
- `http://localhost:3000`


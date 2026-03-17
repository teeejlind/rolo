# Web Deployment

This project can ship as a lightweight web app for friend testing before we deal with App Store packaging.

## Recommended path

Use **Cloudflare Workers Static Assets** for the web frontend.

Why this is the best current fit:

- Cloudflare now recommends Workers with static assets for new projects instead of starting on Pages.
- It works well with GitHub auto-deploys.
- It fits Expo web well once we export the app as a single-page web build.
- We can keep the frontend and the static transit API on the same Cloudflare domain.

## What is already wired

- `apps/mobile/app.json` sets `web.output` to `single`
- `apps/mobile/wrangler.jsonc` is ready for Cloudflare
- `apps/mobile/cloudflare-proxy.js` now serves the public MVP API directly from Cloudflare
- `apps/mobile/cloudflare-api-data/` contains the repo-tracked static transit data bundle used by the Worker
- `infra/scripts/generate-cloudflare-api-data.mjs` rebuilds that bundle when the GTFS source changes

## Commands

From the repo root:

```sh
npm run build:web
```

From `apps/mobile`:

```sh
npm run build:web
npm run serve:web
npm run deploy:web:cloudflare
```

## Local Cloudflare-style preview

1. Run:

```sh
cd apps/mobile
npm run build:web
npx wrangler dev
```

That gives you:

- the exported Expo web app
- SPA routing
- `/api/*` served by the same Worker using the embedded static transit dataset

Optional:

- if you want to test an experimental remote backend, copy `apps/mobile/.dev.vars.example` to `apps/mobile/.dev.vars` and set `API_ORIGIN`

## Production deploy without GitHub

1. Create a Cloudflare account
2. Run `npx wrangler login`
3. Run `cd apps/mobile`
4. Deploy:

```sh
npm run deploy:web:cloudflare
```

## Git-based deploy later

For GitHub auto-deploys, the working Cloudflare build settings are:

- Root directory: `apps/mobile`
- Build command: `npm run build:web`
- Deploy command: `npx wrangler deploy`

## Current architecture

The public web MVP is now fully usable without a laptop tunnel:

- Cloudflare serves the Expo web frontend
- Cloudflare serves the static GTFS-based API for search, places, journeys, stops, and departures
- the local Node API remains useful for development and future realtime work, but it is no longer required for the public share link

## Refreshing the Cloudflare transit dataset

If the Bogotá GTFS feed changes and you want the public Worker updated:

```sh
npm run refresh:static
npm run build:cloudflare-api-data
git add apps/mobile/cloudflare-api-data
git commit -m "Refresh Cloudflare transit data"
git push origin main
```

Cloudflare will rebuild automatically from GitHub.

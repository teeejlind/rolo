# Web Deployment

This project can ship as a lightweight web app for friend testing before we deal with App Store packaging.

## Recommended path

Use **Cloudflare Workers Static Assets** for the web frontend.

Why this is the best current fit:

- Cloudflare now recommends Workers with static assets for new projects instead of starting on Pages.
- It gives us a direct deploy path from your laptop, so GitHub is optional.
- It fits Expo web well once we export the app as a single-page web build.
- We can proxy `/api/*` through the same Cloudflare domain later, which keeps the public app URL simple.

## What is already wired

- `apps/mobile/app.json` sets `web.output` to `single`
- `apps/mobile/wrangler.jsonc` is ready for Cloudflare
- `apps/mobile/cloudflare-proxy.js` proxies `/api/*` to a public backend
- `apps/mobile/.dev.vars.example` shows the one local variable the proxy needs

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

1. Copy `apps/mobile/.dev.vars.example` to `apps/mobile/.dev.vars`
2. Make sure `API_ORIGIN` points at the running backend
3. Run:

```sh
cd apps/mobile
npm run build:web
npx wrangler dev
```

That gives you:

- the exported Expo web app
- SPA routing
- `/api/*` proxying to your API server

## Production deploy without GitHub

1. Create a Cloudflare account
2. Run `npx wrangler login`
3. Run `cd apps/mobile`
4. Set the backend origin:

```sh
npx wrangler secret put API_ORIGIN
```

5. Deploy:

```sh
npm run deploy:web:cloudflare
```

## Git-based deploy later

If we connect this repo to GitHub later, the easiest Cloudflare build settings are:

- Root directory: repo root
- Build command: `npm run build:web --workspace @transito-bogota/mobile`
- Build output directory: `apps/mobile/dist`

## Important architecture note

The frontend can be deployed right now, but **the transit API still needs a public home** if friends outside your Wi-Fi network are going to use it.

Right now the cleanest shape is:

- Cloudflare for the web frontend
- a public API host for `services/api`
- the Cloudflare proxy forwarding `/api/*` to that backend

## Best next step

Make the web build stable first, then choose where the API should live publicly.

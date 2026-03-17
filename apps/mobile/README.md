# Mobile App

Expo Router app for the Transito Bogota phone and web MVP.

## Current focus

- English-first UI
- calm transit-inspired layout
- screen shells for Home, Search, Saved, Settings, Trip Results, Trip Detail, Guided Trip, and Stop Detail
- ready to connect to the local API
- exportable as a static web build

## Run it

From the repo root:

```sh
npm run dev:mobile
```

For web:

```sh
npm run web
```

## Important note for phone testing

If you are using a physical iPhone, `localhost` will not reach your laptop's API server.

Use the root command:

```sh
npm run local-ip
```

Then put that IP into `EXPO_PUBLIC_API_BASE_URL` in the root `.env` file.

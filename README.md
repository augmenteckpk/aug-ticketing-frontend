# Staff console (Angular)

OPD staff web app for the Guyana Ticketing project. Built with [Angular](https://angular.dev/) 21 and the application builder (`@angular/build:application`).

## Requirements

- Node.js compatible with the Angular version in use (see `package.json` engines if present)
- npm (project uses `packageManager: npm@10.9.3`)

## Install

```bash
npm ci
```

For day-to-day work, `npm install` is fine if you are not reproducing CI exactly.

## Development server

```bash
npm start
```

Same as `ng serve`. The dev server listens on **all interfaces** (`0.0.0.0`) so other devices on your LAN can open `http://<your-pc-ip>:4200`.

When you open the app by **LAN IP** (e.g. from a phone), API calls target the same host on port **3001** automatically in development—see `src/environments/api-base.ts` and `resolveApiBaseUrl()`.

## Configuration

Angular bakes environment values at **build time**. There is **no** runtime `.env` in the static bundle.

| Context | Where to set API base URL |
|--------|---------------------------|
| Local dev (`ng serve`) | `src/environments/environment.development.ts` (`apiUrl`) |
| Production build (`ng build`) | `src/environments/environment.ts` (`apiUrl`) — also overwritten in Docker (below) |
| Docker image | Build argument **`API_URL`** or legacy **`VITE_API_URL`** — `API_URL` wins if both are set ([Docker](#docker)) |

The API base URL must be the origin only (no `/api/v1`, no trailing slash), e.g. `http://localhost:3001` or `https://api.example.com`.

For a checklist of variable names used in deployment tools, see **`.env.example`** (reference only; not loaded by Angular).

## Build

Production build (default configuration):

```bash
npm run build
```

Output for static hosting: **`dist/web/browser/`** (copy this folder to your web server or use the Docker image below).

## Docker

Build the image from this directory:

```bash
docker build --build-arg API_URL=https://api.yourdomain.com -t staff-console .
# Still works if your platform only defines the old Vite name:
docker build --build-arg VITE_API_URL=https://api.yourdomain.com -t staff-console .
```

- **`API_URL`** / **`VITE_API_URL`** — public URL of the backend API, written into `environment.ts` during the image build. Prefer **`API_URL`**; **`VITE_API_URL`** is kept for existing production env vars from the former Vite app.
- The runtime stage serves the built app with **nginx** (`nginx.conf`); SPA routes use `try_files` → `index.html`.

## Tests

Unit tests (Vitest via Angular CLI):

```bash
npm test
```

## Project notes

This app replaced the earlier React staff console. It keeps route and API parity for login, waiting display, appointments, queue, reports, registration, and related staff flows. Token storage uses `opd_token`; HTTP calls use an auth interceptor (`Authorization: Bearer …`).

### Smoke checklist (after changes)

1. Confirm `apiUrl` / Docker `API_URL` (or legacy `VITE_API_URL`) for your environment.
2. `npm run build`
3. Exercise: login, appointments, queue, reports, waiting display (SSE / fallback).

## Further reading

- [Angular CLI](https://angular.dev/tools/cli)

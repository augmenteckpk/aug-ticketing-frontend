# OPD Ticketing — Staff Web App

React + Vite + Tailwind CSS SPA for hospital staff: dashboard, hospitals/centers/departments CRUD, users and roles, appointments, queue and batches, reports, and CSV exports.

## Stack

- **React** 19, **React Router** 7
- **Vite** 8
- **Tailwind CSS** 4
- **Lucide** icons

Staff sign-in uses the backend JWT. Patient accounts are intended for the mobile app, not this console.

## Prerequisites

- Node.js 18+
- Backend API running (default `http://localhost:3001`)

## Environment

Create `.env` in this folder (or set variables in your shell):

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Base URL of the API **without** trailing slash | `http://localhost:3001` |

If unset, the client defaults to `http://localhost:3001` (see `src/api/client.ts`).

## Setup

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development server with HMR |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run lint` | ESLint |

## Features (high level)

- Light-themed UI with shared layout and permission-based navigation
- Admin-style tables and modals for hospitals, centers, departments, users, roles
- Appointments and queue pages with patient/center/department context
- Reports with filters and CSV export options

## Production build

```bash
npm run build
```

Deploy the `dist/` folder behind any static host. Configure `VITE_API_URL` at build time to point at your production API and ensure CORS allows your staff app origin.

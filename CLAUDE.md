# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
yarn dev           # Next.js dev server (http://localhost:3000)

# Production build (local — also generates PWA icons)
yarn build && yarn start

# Vercel build (skips pwa-asset-generator, used by CI)
yarn vercel-build

# Regenerate PWA icons from brand logo
yarn icons
```

No test suite is configured.

## Environment Variables

Create a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=
```

## Architecture

**Stack:** Next.js 15 (Pages Router) · React 19 · Supabase · Tailwind CSS v4 · Formik/Yup · Redux (devtools only) · SweetAlert2

**Path alias:** `@/*` maps to the repo root (configured in `jsconfig.json`).

### Data flow

All frontend data access goes through Next.js API routes — never directly to Supabase from the client. The `axiosClient` in `config/axios.js` has `baseURL: '/api/'`, so every helper call like `axiosClient.get('/clients')` hits a local API route.

Two Supabase clients exist:
- `lib/supabaseBrowser.js` — uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`, for client-side use if needed.
- `lib/supabaseServer.js` — uses `SUPABASE_SERVICE_ROLE` (elevated), used exclusively in API route handlers.

API handlers follow a consistent pattern: snake_case columns from Supabase are mapped to camelCase before returning to the frontend.

### Authentication & permissions

Auth is entirely custom — no Supabase Auth. Login hits `POST /api/auth/login`, which queries the `users_app` table and does a plain-text password comparison. On success the user object is stored in `localStorage` under `userData` and `isAuth: 'true'`.

`_app.js` wraps every page in `<AuthGuard>` which reads localStorage on each route change and redirects unauthenticated users to `/login`.

The full RBAC system lives in `helpers/permissions.js`:
- `PERMISSIONS_SCHEMA` defines all modules (`clients`, `orders`, `products`, `sales`, `users`) and their allowed actions.
- `ROLE_TEMPLATES` maps roles (`admin`, `vendedor`, `repartidor`, `supervisor`) to permission sets.
- Use `can('module.action')` or `can('module', 'action')` to gate UI/logic. Admins always return `true`.
- `normalizeUser()` / `getCurrentUser()` are the canonical way to read the current user with guaranteed permission shape.

### Pages & layout

Every authenticated page wraps its content in the `<Layout>` component (`components/Layout`), which provides the fixed `<Sidebar>` and `<Header>`. The sidebar is responsive: hidden on mobile behind a hamburger toggle, fixed at `w-64` on `sm:` and above.

### Supabase schema (key tables)

| Table | Notes |
|---|---|
| `users_app` | App users; `role`, `is_admin`, `permissions` (JSON), plain-text `password` |
| `clients` | `owner_id` (seller FK), `client_type` (`b2b`\|`b2c`), `client_owner` (`rucapellan`\|`cecil`) |
| `orders` | `status` values: `pendiente`, `entregado`. Related `order_items` table joined via Supabase select. |
| `products` | `sku`, `category`, `cost`, `weight`, `image_url` |

Sales view (`/api/sales`) is derived from `orders` filtered to `status = 'entregado'`.

### File uploads

`POST /api/upload` uses `multer` and writes files to `public/uploads/`. Images are served at `/uploads/<filename>`.

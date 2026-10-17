# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yagnika is an Expo Router (React Native) + FastAPI + MongoDB app for pooja booking with automatic priest assignment. It is **a production app being prepared for publication** — treat every change as shipping to real users (see "Working on a production app" and "Known gaps before release"). Roles: `devotee`, `priest`, `admin` (one seeded account, `admin@yagnika.com` / `Admin@123` — a release blocker, see below). `memory/` holds in-repo product docs (`PRD.md`, `test_credentials.md`) and is unrelated to Claude's memory system.

- **The first release is the priest-only build**: priests register and manage bookings; the devotee and admin flows are built and work against the API but are intentionally hidden for now, not abandoned (see Frontend).
- **`backend/server.py` is the source of truth; the Markdown docs are stale.** `INTEGRATION.md`, `README.md` and `memory/PRD.md` predate: role-scoped login/password reset, per-`(email, role)` uniqueness, the expanded priest registration, the `busy` flag, duration-based overlap, the service catalog, the `ENVIRONMENT`/`CORS_ORIGINS` env vars, rate limiting, startup no longer wiping data, and the current frontend flow. `TESTING.md` (curl recipes) is current.

## Commands

Backend (Python 3.11+, a running MongoDB, and `backend/.env` — `cp .env.example .env` is a working local config):
```bash
cd backend
pip install -r requirements.txt                          # includes pytest + requests
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
`MONGO_URL`, `DB_NAME`, `JWT_SECRET_KEY` are required (import fails without them). `ENVIRONMENT` defaults to `production`, which drops `reset_token` from the forgot-password response — set `development` **only on local/throwaway setups** (the tests need it), never on a deployed server. `CORS_ORIGINS` is a comma-separated list (default `*`).

Tests are integration tests that hit a **live server** and create real users/poojas/bookings — only point them at a throwaway database:
```bash
pytest tests/test_scenarios.py -v                              # from backend/, server on :8001
pytest tests/test_scenarios.py -v -k test_full_reset_flow      # single test
# YAGNIKA_TEST_BASE_URL overrides the target (default http://localhost:8001)
```
- **Restart the server between full runs.** Rate limits are in-memory per client IP (login 10/5 min, register 50/h, forgot-password 5/h); one run exhausts the login and forgot-password buckets and uses ~40 registrations.
- Priest bodies come from `priest_payload()`, which mirrors `PriestRegister`'s mandatory fields — update it when that model changes.
- `EmailStr` rejects special-use domains (`.test`, `.local`, …); the suite uses `@mailinator.com`.

Frontend (`frontend/.env` needs `EXPO_PUBLIC_API_URL` = backend base URL, no trailing slash, no `/api`; use the LAN IP, not `localhost`, for devices/emulators):
```bash
cd frontend
yarn install
yarn start           # or: yarn web / yarn android / yarn ios
yarn lint            # expo lint
npx tsc --noEmit     # strict type-check; `yarn start` generates expo-env.d.ts and .expo/types
```
- `EXPO_PUBLIC_*` values are inlined at bundle time — restart with `yarn start -c` after changing `.env`.
- `packageManager` declares yarn 1.22 (and the `resolutions` pins only apply under yarn), but the committed lockfile is npm's `package-lock.json`. Don't mix package managers in one change.
- No frontend test suite.
- Per `INTEGRATION.md`, native builds go through Emergent's Publish → Build flow, not the EAS CLI — ask before running `eas build`.

## Working on a production app

- **Real users and data exist.** Never point the test suite or the `TESTING.md` recipes at anything but a throwaway database — they create users, poojas and bookings.
- **Data persists across deploys** (`seed_database` no longer wipes anything). Any schema or field change needs a backfill/migration in `seed_database` (follow the existing index-migration and `busy` backfill pattern) and read paths must tolerate old documents (pattern: optional model fields like `duration_minutes`, `doc.get(key, default)`).
- **Published app versions keep calling the API.** Keep endpoint and field changes backwards compatible: add fields, don't rename/remove them or tighten request validation without a plan for older installed clients.
- **Deployed backend config**: `ENVIRONMENT=production` (the default), a strong random `JWT_SECRET_KEY`, and an explicit `CORS_ORIGINS` list.
- **Builds and store submissions are outward-facing**: ask before `eas build` / `eas submit` (see the Emergent note under Commands).

## Known gaps before release

Current state, verified against the code — remove items as they are fixed.

Release blockers for the priest-only launch:
- **Priests can't sign back in.** `home.tsx` has no login button and the splash (`app/index.tsx`) ignores the saved session, so after logout, reinstall or on a new device a priest can only re-register — which fails with 400 on their existing email.
- **Hard-coded admin password.** `seed_database` creates `admin@yagnika.com` / `Admin@123` (also prefilled in `login.tsx` and printed in the docs); it must be changed or made env-driven before any deployment.
- **Password reset has no delivery channel.** In production the token is only written to the server log (which is itself a secret-in-logs problem); no email/SMS is wired up.
- **Priest actions fail silently.** `act()` in `priest-dashboard.tsx` only `console.warn`s accept/reject/complete errors (lost race, busy, conflict), and `LogBox.ignoreAllLogs(true)` in `app/_layout.tsx` hides even that.
- **Rate limiter keys on `request.client.host`.** Behind a proxy/ingress every user shares one bucket (e.g. 50 registrations per hour across all users), and state is per-process.

Should fix:
- No auth guards on any screen — screens assume `useAuth()` has a user and token.
- `GET /api/download-source` serves a source zip whenever `backend/downloads/yagnika_source.zip` exists — remove it for production.
- PII: Aadhaar number and DOB are stored in plaintext in both `users` and `priest_registration`; photos are inline base64 on the user doc.
- App identity is still scaffold/Emergent defaults in `app.json` (`name`/`slug`/`scheme` = `frontend`, bundle id/package `com.emergent.yagnikafirestore.gjsbb9`) — settle before store submission, since the bundle id can't change after publishing.
- The Panchangam WebView points at a dev host (`panchangam-frontend-dev.onrender.com`).
- Admin edits to `svc-*` catalog services revert on every restart, and demo poojas `p1`–`p10` can never match an app-registered priest (see Backend).

## Backend (`backend/server.py`, one file)

- Everything is on an `APIRouter` with the `/api` prefix. JWT HS256 (7 days) + bcrypt, `Authorization: Bearer`. Role checks are inline (`if current.role != "priest": raise HTTPException(403)`); admin routes use `Depends(require_admin)`. Declare new static `/bookings/...` GET routes above the `/bookings/{booking_id}` catch-all.
- Docs carry their own string `id` (uuid4 for users/bookings; `"admin"`; `p1`–`p10` demo poojas, `p_<hex>` admin-created, `svc-<cat>-<n>` catalog). Reads project out `_id`; inserts use a copy (`insert_one(dict(doc))`) because Motor writes `_id` into the dict, which is then returned through a Pydantic model.
- **Accounts**: unique index on `(email, role)` — one email can hold separate devotee and priest accounts, so `/auth/login` and `/auth/forgot-password` require `role`. Deactivated users get 403 at login and 401 on any token use. The admin can't be deactivated and never gets a reset token. Reset tokens expire after 30 min and are always written to the server log.
- **Priest registration** stores the full profile on the `users` doc and mirrors it into the `priest_registration` audit collection (`GET /api/admin/priest-registrations`); `users` stays authoritative. Photos are inline base64 JPEG data URIs in `photo_url` (capped by `MAX_PHOTO_DATA_URI_LEN`). Changing a field touches the `PriestRegister` model, the manual checks and `profile` dict in `register_priest`, and `FormState`/`EMPTY`, the `req` checklist and the payload in `frontend/app/priest-register.tsx`.
- **Two pooja families share the `poojas` collection**: demo poojas `p1`–`p10` (duration and price, no category) and the `SERVICE_CATALOG` services `svc-*` (`category`/`subcategory`, empty duration → 120-min fallback, price 0). Priest registration only offers catalog services (filters on `category`), the devotee dashboard lists every active row, and the tests book `p1`–`p10` directly — so an app-registered priest never matches a `p1`–`p10` booking.
- **Startup (`seed_database`) runs on every boot, including each `--reload`**: migrates indexes, inserts missing poojas/catalog/admin, backfills `busy`, and re-sets `name`/`category`/`subcategory`/`is_active=True` on every `svc-*` row (admin edits to catalog services revert on restart). It does **not** wipe users or bookings (that code is commented out).

### Booking lifecycle

`Pending Priest Assignment` → `Priest Assigned` → `Completed` (`Cancelled` is in the enum but nothing sets it).

1. `POST /bookings` (devotees only) rejects past dates (UTC) and unparseable times (`"08:00 AM"` or `"14:30"`), stores `duration_minutes` parsed from the pooja's `duration` string (fallback `SLOT_MINUTES=120`), and snapshots `eligible_priest_ids`: active priests whose `services` include the pooja, who are not `busy`, and who have no `Priest Assigned`/`Completed` booking that overlaps on the same date. None → 409.
2. `GET /bookings/priest/inbox`: pending bookings where the priest is eligible, hasn't rejected, and still has no overlap. `/reject` only adds the priest to `rejected_by`.
3. `/accept`: 409 if the priest is busy or overlapping; otherwise an atomic `update_one` filtered on the pending status — race losers get 409. The winner becomes `busy=True`.
4. `/complete` (assigned priest only) → `Completed`; clears `busy` once the priest has no `Priest Assigned` bookings left.

## Frontend (`frontend/`)

Expo SDK 54, React Native 0.81, React 19, new architecture, typed routes. `@/` resolves to `frontend/` (e.g. `@/src/theme`). Terminology: the customer is the **devotee** ("Yajmana" in the UI); the priest is the "Yagnika".

### Route map

| Route (file in `app/`) | Role | Linked in this build? |
|---|---|---|
| `/` (`index.tsx`) – splash | all | yes (entry) |
| `/home` (`home.tsx`) – launcher | all | only after logout; devotee/admin cards are disabled placeholders, only "Register as Priest" works |
| `/priest-register` | priest | yes |
| `/priest-dashboard` | priest | yes |
| `/register` | devotee | no |
| `/dashboard`, `/book/[poojaId]`, `/booking-confirmation/[id]` (`(devotee)/` group, plain Stack) | devotee | no |
| `/login?role=devotee\|priest\|admin` | all | no |
| `/forgot-password?role=…` | devotee, priest | no (only from login) |
| `/admin-dashboard` | admin | no |

The first release ships this priest-only routing. Unlinked screens are complete and work against the API. On web you can open them by URL (e.g. `/login?role=admin`). To re-enable them, change the splash button (`router.replace('/priest-register')` → `/home`) **and** restore real buttons for the disabled cards in `home.tsx`; `home.tsx` currently has no login button for any role. There is no auth guard anywhere: screens assume `useAuth()` has a user and token, and the splash never resumes a saved session.

### Priest flow (live)

1. **Splash** (`index.tsx`): the "॥ स्वागतम् ॥" button goes straight to `/priest-register`. A logged-in priest who reopens the app lands on registration again.
2. **Registration** (`priest-register.tsx`): one screen of collapsible sections, with one section open at a time.
   - **A Personal:** photo via `pickProfilePhoto`, name, Aadhaar, mobile, DOB typed as `YYYY-MM-DD`, address with "Use current location" (`expo-location` permission plus reverse geocode, which also stores lat/lng), and email/password for login.
   - **B Lineage:** Sampradaya and Agama chips with "Other" → free text, Veda chips, shakha, sutra, gotra, pravara, abhivadanam.
   - **C Professional:** years, a multi-select language list, independent vs temple priest. "Temple" reveals temple name (required), address, deity and designation.
   - **D Services:** `GET /poojas` filtered to rows that have a `category` (the catalog only). Grouped category → subcategory in `CATEGORY_ORDER`, with per-category select-all.
   - **E Optional:** extra details.

   `submit()` validates on the client and lists every missing field in one error banner. It then calls `registerPriest(payload)` (AuthContext → `POST /auth/register-priest`, session persisted) and `router.replace('/priest-dashboard')`. Server errors (e.g. duplicate email → 400) appear in the same banner.
3. **Dashboard** (`priest-dashboard.tsx`): the Pending / Accepted / Completed chips (with counts) map to `/bookings/priest/inbox`, `/accepted` and `/completed`. All three are polled every 6 s.
   - **Pending** cards show pooja, devotee name (mobile hidden), date/time, sankalp, gothram, place and notes, with **Accept** / **Reject**.
   - **Accepted** cards reveal the devotee's mobile and offer **Mark Completed**.
   - **Completed** cards are read-only.
   - A failed action (a 409 for a lost race, being busy or a time conflict) is only `console.warn`ed before the list reloads. The priest sees no message, and LogBox is muted.
   - The header has the avatar → "My Profile" modal (name, email, change photo via `PATCH /auth/me`), a moon icon → Panchangam WebView modal, and logout → `/home`.

### Devotee (customer) flow (built, not linked)

Intended entry: `/home` → `/register`, or `/login?role=devotee`.

1. **Register** (`register.tsx`): Mr./Mrs. `TitlePicker` (required, drives the default avatar), name, email, mobile, and a password of at least 6 characters. Then `registerDevotee` → `/(devotee)/dashboard`.
2. **Dashboard** (`(devotee)/dashboard.tsx`): a bottom tab bar (component state, not routes). Pooja and booking data refresh every 8 s.
   - **Home:** every active row from `GET /poojas` with a **Book** button. That includes the ~170 catalog services, which show an empty duration and ₹0. Also shows the 3 most recent bookings.
   - **Bookings:** all of `GET /bookings/mine`, each with a status pill and the assigned priest's name and mobile.
   - **Panchangam:** a WebView.
   - **Profile:** avatar with change-photo, email, mobile, logout.
3. **Book** (`(devotee)/book/[poojaId].tsx`): date chips for the next 14 days (device-local dates), fixed time slots (`TIMES`: 06:00 AM … 06:30 PM), sankalp prefilled with the user's name, gothram, place, and optional notes. Then `POST /bookings` → `router.replace` to the confirmation. A 409 "No Priests Available" shows in the error banner.
4. **Confirmation** (`(devotee)/booking-confirmation/[id].tsx`): polls `GET /bookings/{id}` every 5 s. It shows "Booking Request Submitted / waiting for a priest" until the status becomes `Priest Assigned`, then the priest's name and mobile.

There is no cancel, reschedule or payment step anywhere.

### Admin flow (built, not linked)

`/login?role=admin` (the seeded credentials are prefilled) → `admin-dashboard.tsx`, with these tabs:
- **Overview:** `/admin/stats`.
- **Poojas:** every pooja including inactive ones, an enable/disable toggle, and a create/edit modal for name, Sanskrit name, description, duration and price.
- **Bookings:** status chips plus a date filter.
- **Priests / Devotees:** search and activate/deactivate.

Every tab except Poojas polls every 8 s. There is no UI for `/admin/priest-registrations` or the extended priest profile.

### Shared auth screens

- **Login** (`login.tsx`): reads the role from `?role=` (default devotee), sends the lower-cased email plus role, and routes by the returned role to the priest dashboard, admin dashboard, or `/(devotee)/dashboard`. For admins it hides the "Forgot password?" and "Register" links.
- **Forgot password** (`forgot-password.tsx?role=`):
  - Step 1 requests a token. In `development` the returned `reset_token` is prefilled. In `production` the field stays empty and the token must be pasted from the server log.
  - Step 2 takes the token and a new password, then links back to login.

### Shared plumbing

- Every screen calls the API through `apiFetch(path, opts, token)` in `src/context/AuthContext.tsx` (which also owns auth state). It prefixes `${EXPO_PUBLIC_API_URL}/api` — or a relative `/api` if unset, which only works on web behind a proxy — and returns the raw `Response`; callers handle `res.ok` and FastAPI's `detail` themselves.
- Persistence only through the `storage` singleton (`@/src/utils/storage`). Metro picks `index.ts` (native) vs `index.web.ts` (web) — don't add `Platform.OS` checks. Reads need a `fallback`, values are JSON-serialized for you, and helpers never throw (they only `console.warn`). `yagnika_token` uses `secure*` (SecureStore on native, AsyncStorage on web); `yagnika_user` uses `getItem`/`setItem`. A key read through a different namespace than it was written with silently returns the fallback.
- No websockets: dashboards and booking confirmation poll via `useFocusEffect` + `setInterval` every 5–8 s.
- `app/_layout.tsx` calls `LogBox.ignoreAllLogs(true)`, so warnings only show in the Metro/browser console. `ICON_VECTOR_VERSION` in `src/hooks/use-icon-fonts.ts` must match the `@expo/vector-icons` version.

## Unrelated files

`panchangam.py` (`compute_panchangam`; `swisseph_rs` + `astral`) and `panchangam - Copy.py` (`calculate_panchangam`; `pyswisseph` + `pytz`) are standalone Hindu-calendar calculators. Nothing imports them, and their dependencies aren't in `requirements.txt`. The in-app "Panchangam" (devotee and priest dashboards) is a WebView of an externally hosted site.

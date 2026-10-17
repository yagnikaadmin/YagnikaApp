# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Yagnika is a production app, being prepared for publication, for booking poojas with automatic priest assignment. It is built with Expo Router (React Native) + FastAPI + MongoDB. Treat every change as shipping to real users (see "Working on a production app" and "Known gaps before release").

- **One frontend codebase, two apps**: a **priest app** ("Yagnika") and a **customer app** (devotee, "Yajmana"). The flavor is chosen at runtime (see Frontend). **The first release is the priest app**; the customer app is built and runs in development, but ships later. Prioritise priest-app work and release blockers, and keep customer-flow changes from breaking the priest app (they share screens, AuthContext and the API).
- **Admin** has no mobile screens. It uses a single-page **Admin Web UI** served by the backend at `/admin`.
- **Panchangam** (Hindu calendar, muhurtam, kundali, sky view) is computed by the backend (`backend/panchangam/`) and rendered natively in both apps.
- **`backend/server.py` is the source of truth for the API.** `INTEGRATION.md`, `README.md` and `memory/PRD.md` are stale: they predate the approval workflow, admin username login, the availability model, the `sc-*` catalog, the two-flavor frontend, i18n and the in-app Panchangam. `TESTING.md` (curl recipes) is current. `memory/` holds in-repo product docs and is unrelated to Claude's memory system.

## Commands

Backend (Python 3.11+, a running MongoDB, `backend/.env`; `cp .env.example .env` is a working local config):
```bash
cd backend
pip install -r requirements.txt                          # includes pytest + requests
uvicorn server:app --host 0.0.0.0 --port 8001 --reload   # API under /api, Admin Web UI at /admin
```
- **Required env vars**: `MONGO_URL`, `DB_NAME` and `JWT_SECRET_KEY`. The import fails without them.
- **Admin account**: `ADMIN_USERNAME` / `ADMIN_PASSWORD` seed the single admin, and the password is re-synced on every startup. If either is unset, no admin is created and only a warning is logged.
- **`ENVIRONMENT`**: defaults to `production`, which drops `reset_token` from the forgot-password response. Set `development` **only on local or throwaway setups** (the tests need it).
- **`CORS_ORIGINS`**: a comma-separated list (default `*`).
- **Optional Panchangam defaults**: `PANCHANGAM_DEFAULT_LAT`, `_LON` and `_TZ_MIN` (Hyderabad/IST).

Tests:
```bash
pytest tests/test_panchangam.py -v                       # pure calculations vs Drik Panchang — no server/DB
pytest tests/test_scenarios.py -v                        # integration: needs a LIVE server on :8001
pytest tests/test_scenarios.py -v -k test_full_reset_flow
# YAGNIKA_TEST_BASE_URL overrides the target (default http://localhost:8001)
```
- **`test_scenarios.py` writes real data**: it creates users, poojas and bookings, so point it only at a throwaway database. It logs in as admin with `ADMIN_USERNAME` / `ADMIN_PASSWORD` (from the environment or `backend/.env`).
- **Restart the server between full runs.** Rate limits are kept in memory per client IP: login (shared by `/auth/login` and `/admin/login`) 10 per 5 min, register 50/h, forgot-password 5/h. One run exhausts the login and forgot-password buckets.
- **Test priests come from helpers.** `priest_payload()` mirrors `PriestRegister` and always adds one main-catalog service. `register_priest()` approves the priest through the admin API unless `approve=False`. Update both when the registration model changes.
- **Test email domains**: `EmailStr` rejects special-use domains (`.test`, `.local`, …), so the suite uses `@mailinator.com`.

Frontend (`frontend/.env`: `EXPO_PUBLIC_API_URL` = backend base URL with no trailing slash and no `/api`; use the LAN IP for devices and emulators):
```bash
cd frontend
yarn install
npx expo start                      # priest app (any port except 8101)
npx expo start --port 8101          # customer app (port 8101 selects the customer flavor)
yarn lint                           # expo lint
npx tsc --noEmit                    # strict type-check; `expo start` generates expo-env.d.ts and .expo/types
```
- **Changing `.env`**: `EXPO_PUBLIC_*` values are inlined at bundle time, so restart with `-c` after changing `.env`.
- **Standalone builds**: these must set `EXPO_PUBLIC_APP_FLAVOR=priest|customer`.
- **Package manager**: `packageManager` declares yarn 1.22, and its `resolutions` only apply under yarn. The committed lockfile, however, is npm's `package-lock.json`, so don't mix package managers in one change.
- **No frontend test suite.**
- **Native builds**: per `INTEGRATION.md`, these go through Emergent's Publish → Build flow, not the EAS CLI. Ask before `eas build` / `eas submit`.

## Working on a production app

- **Real users and data exist.** Never point `test_scenarios.py` or the `TESTING.md` recipes at a non-throwaway database.
- **Data persists across deploys.** Schema and field changes need a backfill or migration in `seed_database` (follow the existing patterns there: index migration, `busy` backfill, legacy-priest grandfathering, availability reset). Read paths must tolerate old documents: use optional model fields and `doc.get(key, default)`. `PriestRegister` keeps `veda`/`sutra`/`gotra`/`pravara` optional "for older clients and existing records" for exactly this reason.
- **Installed apps keep calling the API.** Keep endpoint and field changes backwards compatible: add fields; don't rename or remove them, or tighten validation, without a plan for older clients.
- **Validation lives in pairs.** Keep these in sync:
  - mobile/email rules: `MOBILE_RE`/`EMAIL_RE` in `server.py` ↔ `frontend/src/utils/validation.ts`;
  - the Dana rule: `DANA_CATEGORY` ↔ `frontend/src/i18n/catalog.ts`;
  - registration checks: `register_priest` / `update_me` ↔ `missingBySection` in `PriestProfileForm.tsx`.
- **Deployed backend**: `ENVIRONMENT=production`, a strong `JWT_SECRET_KEY`, strong `ADMIN_*` credentials, and an explicit `CORS_ORIGINS`.

## Backend (`backend/`)

`server.py` is one file covering auth, priest onboarding, availability, poojas, bookings, admin, metrics, seeding and the Admin Web UI route. `panchangam/` is a separate package mounted under `/api`.

- **Routing and roles**: all API routes sit under `/api`. Auth is JWT HS256 (7 days) + bcrypt, sent as `Authorization: Bearer`. Role checks are inline (`if current.role != "priest": raise HTTPException(403)`, or `_require_priest`). Admin routes use `Depends(require_admin)`. Declare new static `/bookings/...` GET routes above the `/bookings/{booking_id}` catch-all.
- **Documents**: each document carries its own string `id`:
  - users and bookings: uuid4;
  - the admin: `"admin"`;
  - demo poojas: `p1`–`p10`; admin-created poojas: `p_<hex>`; catalog services: `sc-<cat>-<n>`.

  Reads project out `_id`. Inserts use a copy (`insert_one(dict(doc))`) because Motor writes `_id` into the dict, and the original dict is then returned through a Pydantic model.
- **Accounts**:
  - **Uniqueness**: there is a unique index on `(email, role)`, so one email can hold a separate devotee account and priest account. That's why `/auth/login` and `/auth/forgot-password` require `role` (`devotee`|`priest`).
  - **Admin sign-in**: the admin signs in by **username** via `POST /api/admin/login`. The admin document also keeps the email `admin@yagnika.com`, for the unique index.
  - **Inactive accounts** get 401 on every endpoint guarded by `get_current_user`. The exception is `get_current_user_any`, used only by `/priest/my-registration`.
  - **Password reset**: tokens expire after 30 min and are always written to the server log. Admins never get one.
- **Priest onboarding**:
  - **Registration** (`POST /auth/register-priest`, rate-limited) requires:
    - an Aadhaar number (12 digits) and an Aadhaar proof (a JPEG/PNG/PDF data URI, at most `MAX_AADHAAR_PROOF_LEN`);
    - a valid Indian mobile and email, and a date of birth in the past;
    - sampradaya, agama, languages and priest type (temple priests also need a temple name);
    - services that include **at least one active catalog service from a non-Dana category** — Danas alone, or only `p1`–`p10`, are rejected.
  - **The new account starts inactive** (`is_active=False`, `approval_status="pending"`), but a token is still issued. The full profile (including proof documents) is stored on the `users` doc **and** mirrored into `priest_registration` with `status`/`stage`.
  - **Review**: `stage` runs `submitted → interview → approved | rejected`. The admin endpoints are `/admin/priest-registrations[/{id}/stage|approve|reject]`. Approving sets the user active and `approval_status="approved"`; rejecting deactivates the account (login then returns 403).
  - **Login**: `/auth/login` for a *pending* priest returns 200 with a token, so the app can show the pending screen.
  - **Profile edits**: `PATCH /auth/me` (`ProfileUpdate`) lets a priest edit every registration field (blank password = keep the current one), with the same validation, and syncs the changes into `priest_registration`. `GET /auth/me/full` returns the whole stored profile.
- **Availability** (inverted model: a priest is available unless they say otherwise):
  - **Stored data**: `users.availability` holds pause toggles (`offline_paused`, `epuja_paused`), `same_availability`, three weekly schedules (`weekly`, `weekly_inperson`, `weekly_epuja`, each per day `{off, unavailable:[{start,end}]}`) and `buffer_minutes`. Per-date overrides live in `availability_overrides` and are *positive* (`available`, `slots`).
  - **Resolution** for a date and mode: pause → override → weekly.
  - **Endpoints**: priests use `/priest/availability…`; devotees use `/priests/{id}/availability[/day]`.
  - **Not enforced: eligibility (`find_eligible_priests`) ignores availability and `working_status` entirely.**
- **Pooja catalog**: the `poojas` collection holds two families:
  - **Demo poojas** `p1`–`p10`: they have a duration and price but no category, and the customer app shows them as "featured".
  - **The `SERVICE_CATALOG`** (`sc-*`): 9 categories, with an empty duration (→ 120-min fallback) and price 0. Its order in `server.py` fixes the ids; display order comes from `CATEGORY_ORDER` in `frontend/src/i18n/catalog.ts`. Append new categories last to keep ids stable.

  Every startup **rebuilds the catalog**: it deletes old `svc-*` rows and `sc-*` ids no longer present, then upserts every `sc-*` row. Admin edits to catalog rows therefore revert, and priests' `services` may still reference deleted ids. `GET /poojas` adds a parsed `duration_minutes`.
- **Startup (`seed_database`) runs on every boot, including each `--reload`.** It:
  - migrates indexes and creates the collections (`priest_registration`, `availability_overrides`), dropping `eservice_slots`;
  - resets old-shape availability;
  - backfills `busy`, registration `stage` and `approval_status` (legacy priests are grandfathered as approved);
  - inserts missing demo poojas, rebuilds the catalog, and seeds/syncs the admin.

  It never wipes users or bookings.
- **Other endpoints**:
  - `POST /metrics/panchangam-view` is a public counter, shown in admin stats.
  - `GET /api/download-source` should be removed (see gaps).
  - The admin pooja endpoints exist, but the Admin Web UI has no pooja management.

### Booking lifecycle

`Pending Priest Assignment` → `Priest Assigned` → `Completed`. `Cancelled` is in the enum but nothing sets it, and there is no cancel or reschedule endpoint.

1. **Create**: `POST /bookings` (devotees only) takes `pooja_id`, `booking_date` (YYYY-MM-DD, not in the past by UTC), `booking_time` (`"08:00 AM"` or `"14:30"`), `sankalp_name`, `gothram` and `place`. It also accepts optional `notes`, `contact_mobile` (falls back to the account mobile) and `latitude`/`longitude` (the map pin). It stores `duration_minutes` (from the pooja; fallback `SLOT_MINUTES=120`) and snapshots `eligible_priest_ids`: active priests offering the pooja who are not `busy` and have no overlapping `Priest Assigned`/`Completed` booking on that date. If no priest qualifies, it returns 409.
2. **Inbox**: `GET /bookings/priest/inbox` lists pending bookings where the priest is eligible, hasn't rejected, and still has no overlap. `/reject` only adds the priest to `rejected_by`.
3. **Accept**: `/accept` returns 409 if the priest is busy or overlapping. Otherwise it does an atomic `update_one` filtered on the pending status, and race losers get 409. The winner becomes `busy=True`.
4. **Complete**: `/complete` (assigned priest only) moves the booking to `Completed` and clears `busy` once the priest has no `Priest Assigned` bookings left.

### Panchangam (`backend/panchangam/`)

- **What it is**: public, no-auth, no-DB calculators ported from the standalone Panchangam service.
- **Endpoints**: `GET /api/panchangam?date&calendar_type=amanta|purnimanta|suryamana&latitude&longitude&tz_offset_min`, `GET /api/panchangam/festivals?year…`, and `POST /api/panchangam/muhurtam|kundali|sky-view`.
- **Structure**: `router.py` → `service.py` (input parsing, Hyderabad/IST defaults) → the math modules (`panchangam.py`, `extended_panchangam.py`, `muhurtam.py`, `kundalini.py`, `sky_view.py`).
- **Dependencies**: `pyswisseph-rs` (imported as `swisseph_rs`) and `astral`.
- **Tests**: `tests/test_panchangam.py` pins results to Drik Panchang values (90 s tolerance). Run it after any change to the math.

## Frontend (`frontend/`)

Expo SDK 54, React Native 0.81, React 19, new architecture, typed routes. `@/` resolves to `frontend/`.

### Two flavors

`app/index.tsx` resolves the flavor at runtime from `EXPO_PUBLIC_APP_FLAVOR` (`priest`|`customer`), otherwise from the dev-server port (`:8101` → customer, anything else → priest).

- **One role per flavor**: each flavor serves exactly one role (customer → `devotee`, priest → `priest`). The splash drops a stored session that belongs to the other role, because Expo Go shares storage between the two.
- **Splash routing**: after about 1.5 s, the splash routes a saved session to that role's home (a pending priest goes to `/priest-pending`). Otherwise it goes to `/login?role=…`.
- **Shared screens**: both apps ship all screens, and only the entry point differs. `app/home.tsx` (the old role launcher) is no longer reachable from anywhere.
- **One identity in `app.json`**: there is a single `app.json`, so both flavors currently share one name and bundle id (see gaps).

### Route map

| Route (`app/…`) | Flavor | Purpose |
|---|---|---|
| `index.tsx` | both | splash + flavor/session routing |
| `login.tsx?role=devotee\|priest` | both | role-scoped login; links to forgot-password and register |
| `forgot-password.tsx?role=` | both | request token → set new password |
| `priest-register.tsx`, `priest-profile-edit.tsx` | priest | both render `src/components/PriestProfileForm.tsx` (`mode="register"` / `"edit"`) |
| `priest-pending.tsx` | priest | 3-step approval status |
| `priest-dashboard.tsx` | priest | tabbed home |
| `priest-availability.tsx` | priest | also embedded as a dashboard tab (`embedded` prop) |
| `register.tsx` | customer | devotee sign-up |
| `(devotee)/dashboard.tsx` | customer | tabbed home |
| `(devotee)/book/[poojaId].tsx`, `booking-confirmation/[id].tsx`, `booking-details/[id].tsx`, `profile-edit.tsx` | customer | booking + profile |

### Priest app flow

1. **Splash → `/login?role=priest`**, where "Register" links to `/priest-register`.
2. **Registration** (`PriestProfileForm`, register mode) is one screen of collapsible sections, each with a green tick when complete:
   - **A Personal**: photo, name, Aadhaar number + proof upload (`pickAadhaarProof`), mobile, DOB, address (GPS via `expo-location` + reverse geocode), email, password.
   - **B Lineage**: sampradaya and agama.
   - **C Professional**: experience, languages, independent/temple.
   - **D Services**: `ServiceCategoryPicker` over the catalog (rows with `category`), with the Dana rule applied.
   - **Optional**: includes the Agama certificate upload.

   `missingBySection` lists every missing field in one error banner. On success it calls `registerPriest` (session persisted) → `/priest-pending`.
3. **`/priest-pending`** shows submitted → interview → approved. It polls `/priest/my-registration` every 12 s, shows the admin's note, moves to `/priest-dashboard` once approved, and shows a rejected state otherwise. Logging in while pending lands here too.
4. **`/priest-dashboard`** uses swipeable tabs (`PagerView` inside a `ZoomView`, with a bottom tab bar). A `LanguagePicker` sits in the header (the customer dashboard has one too).
   - **Home**: a deity hero plus shortcut cards for Pending/Accepted/Completed, Availability and Edit Profile.
   - **Bookings**: a Pending/Accepted/Completed filter over `/bookings/priest/inbox|accepted|completed`, polled every 6 s. Pending cards offer Accept/Reject, Accepted cards offer Mark Completed, and the devotee's mobile is hidden until accepted.
   - **Availability**: `PriestAvailability` (pause toggles, weekly unavailability per mode with a buffer, per-date overrides through `MiniCalendar`).
   - **Panchangam**: `PanchangamScreen`.
   - **Profile**: photo, Edit Profile (`/priest-profile-edit`, which loads `/auth/me/full` and saves with `PATCH /auth/me`), logout → `/login?role=priest`.

### Customer app flow

1. **Splash → `/login?role=devotee`** or **`/register`**. Registration takes a Mr./Mrs. title (required), name, email, mobile and password → dashboard.
2. **`(devotee)/dashboard.tsx`** uses swipeable tabs (Home / Categories / Bookings / Panchangam / Profile), polling `/poojas` and `/bookings/mine` every 8 s:
   - **Home**: the featured demo poojas `p1`–`p10`.
   - **Categories**: the catalog grouped by `CATEGORY_ORDER`, with search.
   - **Bookings**: tapping a booking opens `booking-details/[id]`, which polls every 6 s.
   - **Panchangam**: `PanchangamScreen`. Opening it posts `/metrics/panchangam-view`.
   - **Profile**: links to `profile-edit` (name, address with GPS, gothram, mobile, photo, email) and logout.
3. **`book/[poojaId]`** takes:
   - name/sankalp and gothram (prefilled from the profile);
   - a contact phone;
   - a date (`MiniCalendar`, today to +120 days) and a free start time (`TimeField`), with the end time shown from `duration_minutes`;
   - the venue: a `MapPicker` pin (Leaflet + OpenStreetMap in a WebView) and an address;
   - notes.

   It then calls `POST /bookings` → `booking-confirmation/[id]`, which polls every 5 s until `Priest Assigned` and then shows the priest's name and mobile. The priest's availability is not consulted.

### Shared plumbing

- **API calls**: `src/context/AuthContext.tsx` owns auth state and `apiFetch(path, opts, token)`, which prefixes `${EXPO_PUBLIC_API_URL}/api` and returns the raw `Response`. Use `messageFromDetail` / `readError` to turn FastAPI `detail` (a string, or a 422 array) into a readable message. `login` maps 401/403/429 to friendly text.
- **Persistence** only goes through the `storage` singleton (`@/src/utils/storage`):
  - Metro picks `index.ts` (native) vs `index.web.ts` (web), so don't add `Platform.OS` checks.
  - Reads need a `fallback`, and values are JSON-serialized automatically.
  - Helpers never throw; they only `console.warn`.
  - `yagnika_token` uses `secure*` (SecureStore on native); `yagnika_user` uses `getItem`/`setItem`.
  - The language choice is stored separately under the AsyncStorage key `yagnika_language`.
- **i18n**: `react-i18next` with `src/i18n/locales/{en,te,hi,ta,kn,ml}.json`. The initial language comes from the stored choice, otherwise the device locale, otherwise `en` (the fallback). All user-facing strings go through `t()`, and new keys belong in **all six** locale files (`en` currently has 3 keys the others lack). Catalog category and subcategory names are translated through helpers in `src/i18n/catalog.ts`, keyed by the backend's English names.
- **Panchangam UI**: `src/lib/panchangam.ts` is the API client. `src/components/panchangam/` holds `PanchangamScreen`, `KalaChakra` and `SkyMap`.
- **Polling**: there are no websockets; screens poll via `useFocusEffect` + `setInterval`.
- **Dependencies and logs**: `app/_layout.tsx` calls `LogBox.ignoreAllLogs(true)`. `ICON_VECTOR_VERSION` in `src/hooks/use-icon-fonts.ts` must match the `@expo/vector-icons` version.

## Known gaps before release

These are the current state, verified against the code. Remove each item as it is fixed.

Release blockers for the priest-app launch:
- **Priest booking actions fail silently.** `act()` in `priest-dashboard.tsx` ignores the response entirely, so a 409 (lost race, busy, conflict) or 403 shows no message.
- **Password reset has no delivery channel.** In production the token is only written to the server log, which is itself a secret-in-logs problem.
- **The rate limiter keys on `request.client.host`.** Behind a proxy or ingress every user shares one bucket (e.g. 50 registrations per hour in total), and the state is per-process.
- **App identity is still a scaffold.** `app.json` has `name`/`slug`/`scheme` = `frontend` and bundle id/package `com.emergent.yagnikafirestore.gjsbb9`, and the single config serves both flavors. The priest app needs its own final name, bundle id and package before the first store submission. Have the config pick identity by `EXPO_PUBLIC_APP_FLAVOR` (e.g. `app.config.js`), so the later customer app gets a separate one. The bundle id can't change after publishing.

Should fix:
- **Availability isn't used for booking eligibility.** Neither are pauses or `working_status`, so a paused or "on leave" priest still receives bookings.
- **PII in plaintext**: Aadhaar number, DOB and the Aadhaar proof / Agama certificate files (base64) are stored in plaintext in both `users` and `priest_registration`, and returned by `/auth/me/full` and the admin registration list.
- **Source download endpoint**: `GET /api/download-source` serves a source zip whenever `backend/downloads/yagnika_source.zip` exists. Remove it.
- **Map tiles**: `MapPicker` uses public OpenStreetMap tiles and the unpkg CDN. OSM's tile policy disallows heavy app use, so a tile provider is needed.
- **Logs are hidden**: `LogBox.ignoreAllLogs(true)` hides warnings in production builds too.
- **Catalog and the Admin Web UI**: admin edits to `sc-*` catalog rows revert on restart, and there's no pooja management in the Admin Web UI.

## Unrelated / legacy files

- **Root Panchangam scripts**: `panchangam.py` and `panchangam - Copy.py` at the repo root are standalone Panchangam calculators.
- **Standalone Panchangam site**: `panchangam_application/` is a separate FastAPI + Jinja web app (`app.py`, its own `requirements.txt`) for the standalone Panchangam website.

The backend's `backend/panchangam/` package is the ported copy the apps use. Change the math there, not in these files.

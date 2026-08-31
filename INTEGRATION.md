# Yagnika PoC — Integration Guide

Complete reference for wiring the Yagnika application: architecture, auth flow, API contracts, environment variables, dependencies, and deployment.

---

## 1. Architecture

```
┌────────────────────┐        HTTPS / JSON        ┌───────────────────┐
│  Expo React Native │  ────────────────────────► │  FastAPI (uvicorn)│
│  (iOS/Android/Web) │  ◄──────────────────────── │   :8001 /api/*    │
└────────────────────┘        Bearer JWT          └─────────┬─────────┘
        │                                                    │
        │  AsyncStorage                                Motor │
        │  (yagnika_token, yagnika_user)                     ▼
        │                                          ┌──────────────────┐
        └──────────────────────────────────────────│   MongoDB        │
                                                   │   (test_database) │
                                                   └──────────────────┘

Routing: Kubernetes ingress forwards `/api/*` → backend :8001, everything else → Expo dev server :3000.
```

**Roles**
- `devotee` — books poojas
- `priest`  — receives requests, accepts/rejects/completes
- `admin`   — single default account, manages catalogs & users

---

## 2. Tech stack

### Backend
| Package               | Version   | Purpose                              |
|-----------------------|-----------|--------------------------------------|
| fastapi               | 0.110.1   | ASGI HTTP framework                  |
| uvicorn[standard]     | 0.25.0    | ASGI server                          |
| motor                 | 3.3.1     | Async MongoDB driver                 |
| pymongo               | 4.6.3     | Sync MongoDB (transitive)            |
| pydantic              | ≥2.6      | Request/response validation          |
| python-jose[cryptography] | ≥3.3  | JWT signing & verification (HS256)   |
| passlib[bcrypt]       | ≥1.7      | bcrypt password hashing              |
| bcrypt                | 4.1.3     | bcrypt backend                       |
| python-dotenv         | ≥1.0      | Load `.env`                          |
| email-validator       | ≥2.2      | Pydantic `EmailStr` validation       |

### Frontend
| Package                                | Version | Purpose                       |
|----------------------------------------|---------|-------------------------------|
| expo                                   | 54.0.35 | Managed workflow / SDK        |
| expo-router                            | 6.0.24  | File-based routing            |
| expo-linear-gradient                   | 15.0.8  | Cards & CTA gradients         |
| expo-location                          | 19.0.8  | Priest address auto-fill      |
| expo-splash-screen                     | 31.0.13 | Splash control                |
| @expo/vector-icons                     | 15.1.1  | Ionicons                      |
| @react-native-async-storage/async-storage | 2.2.0 | JWT + user persistence        |
| react-native-safe-area-context         | 5.6.0   | Safe area on notched devices  |
| react-native-gesture-handler           | 2.28.0  | Root gesture handler          |
| react-native-reanimated                | 4.1.1   | (transitive)                  |

---

## 3. Environment variables

### Backend `.env`
```bash
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
JWT_SECRET_KEY="please-change-me-to-32+random-bytes"
```

### Frontend `.env`
```bash
EXPO_PUBLIC_API_URL=https://your-domain.com     # NO trailing slash, no /api
EXPO_PACKAGER_HOSTNAME=https://your-domain.com      # required by the platform preview
EXPO_PACKAGER_PROXY_URL=https://your-domain.com
```
The client always calls `${EXPO_PUBLIC_API_URL}/api/…`.

---

## 4. Authentication (JWT)

- **Algorithm:** HS256, symmetric secret in `JWT_SECRET_KEY`.
- **Token claims:** `{ sub: user_id, role: "devotee"|"priest"|"admin", exp: <7 days> }`.
- **Password hashing:** bcrypt (via `passlib.CryptContext`, work factor default 12).
- **Header:** `Authorization: Bearer <token>`.
- **Storage on device:** `AsyncStorage` keys `yagnika_token`, `yagnika_user` (JSON).

### Flow
1. `POST /api/auth/register` (devotee) or `POST /api/auth/register-priest` → returns `{ access_token, user }`, client persists both.
2. `POST /api/auth/login` → same shape.
3. On every protected request the client sends the token; the backend decodes it via `OAuth2PasswordBearer` and looks up the user in Mongo, rejecting inactive accounts.
4. Logout is client-side (`AsyncStorage.multiRemove`).

### Forgot password (PoC)
- `POST /api/auth/forgot-password { email }` → returns `{ reset_token }` (in production this would be emailed).
- `POST /api/auth/reset-password { reset_token, new_password }` → updates hash, marks token used.
- Admin passwords are **not resettable** via this flow.

---

## 5. REST API reference

Base URL: `{EXPO_PUBLIC_API_URL}/api`

### Auth
| Method | Path                        | Body / Query                                   | Auth        | Response                    |
|--------|-----------------------------|------------------------------------------------|-------------|-----------------------------|
| POST   | `/auth/register`            | `{name,email,mobile,password}` (devotee)       | none        | `{access_token,user}`       |
| POST   | `/auth/register-priest`     | `{name,email,mobile,password,address,latitude?,longitude?,services:[poojaIds]}` | none | `{access_token,user}` |
| POST   | `/auth/login`               | `{email,password}`                             | none        | `{access_token,user}`       |
| GET    | `/auth/me`                  | —                                              | any         | `UserPublic`                |
| POST   | `/auth/forgot-password`     | `{email}`                                      | none        | `{reset_token,message}`     |
| POST   | `/auth/reset-password`      | `{reset_token,new_password}`                   | none        | `{message}`                 |

### Poojas
| Method | Path                          | Body / Query                       | Auth   | Notes                          |
|--------|-------------------------------|------------------------------------|--------|--------------------------------|
| GET    | `/poojas`                     | `?include_inactive=true`           | none   | Active by default              |
| POST   | `/admin/poojas`               | `{name,sanskrit_name,description,duration,price}` | admin | Creates new pooja        |
| PATCH  | `/admin/poojas/{id}`          | any of the above fields + `is_active` | admin | Update / enable / disable   |

### Bookings — Devotee
| Method | Path                          | Body / Query                                 | Auth    |
|--------|-------------------------------|----------------------------------------------|---------|
| POST   | `/bookings`                   | `{pooja_id,booking_date,booking_time,sankalp_name,gothram,place,notes?}` | devotee |
| GET    | `/bookings/mine`              | —                                            | devotee |
| GET    | `/bookings/{id}`              | —                                            | owner/admin |

### Bookings — Priest
| Method | Path                                | Auth   | Description                            |
|--------|-------------------------------------|--------|----------------------------------------|
| GET    | `/bookings/priest/inbox`            | priest | Pending & eligible bookings            |
| GET    | `/bookings/priest/accepted`         | priest | Bookings this priest accepted          |
| GET    | `/bookings/priest/completed`        | priest | Bookings this priest completed         |
| POST   | `/bookings/{id}/accept`             | priest | Atomic assignment (409 if lost race)   |
| POST   | `/bookings/{id}/reject`             | priest | Adds priest to `rejected_by`           |
| POST   | `/bookings/{id}/complete`           | priest | Only after `Priest Assigned`           |

### Admin
| Method | Path                                | Query / Body                                                | Auth  |
|--------|-------------------------------------|-------------------------------------------------------------|-------|
| GET    | `/admin/bookings`                   | `?status=…&date=…&pooja_id=…&priest_id=…&user_id=…`         | admin |
| GET    | `/admin/priests`                    | `?search=…`                                                 | admin |
| GET    | `/admin/devotees`                   | `?search=…`                                                 | admin |
| PATCH  | `/admin/users/{id}/active`          | `{is_active:boolean}`                                       | admin |
| GET    | `/admin/stats`                      | —                                                           | admin |

### Booking status lifecycle
```
Pending Priest Assignment
   ├─(POST /accept by first eligible priest, atomic)─►  Priest Assigned
   │                                                        │
   │                                                        └─(POST /complete)─► Completed
   └─(POST /reject by a priest)─► removed from that priest's inbox only
```
Race safety: `db.bookings.update_one({id, status:"Pending Priest Assignment"}, {$set:{...}})` — only the first winner mutates the doc, everyone else gets `modified_count=0` → HTTP 409.

### Availability rule
Assumes each booking blocks a **2-hour slot** (`SLOT_MINUTES=120` in `server.py`). A priest is excluded from `eligible_priest_ids` if they already have a `Priest Assigned` or `Completed` booking on the same date whose start time is within 120 minutes of the requested time.

---

## 6. Data model (MongoDB)

Collections stored under `${DB_NAME}` (default `test_database`).

### `users`
```
id: str (uuid or "admin")
name: str
email: str (unique)
mobile: str
role: "devotee" | "priest" | "admin"
hashed_password: str  (bcrypt)
is_active: bool
# priest-only:
address: str
latitude, longitude: float | null
services: [poojaId]
created_at: ISO string
```
`_id` (ObjectId) is always excluded on read.

### `poojas`
```
id: str        # "p1"…"p10" seeded, "p_<hex>" for admin-created
name, sanskrit_name, description, duration: str
price: int
is_active: bool
```

### `bookings`
```
id: str (uuid)
user_id, user_name, user_mobile: str        # devotee
pooja_id, pooja_name: str
booking_date: "YYYY-MM-DD"
booking_time: "hh:mm AM/PM"
sankalp_name, gothram, place, notes: str
status: "Pending Priest Assignment" | "Priest Assigned" | "Completed" | "Cancelled"
priest_id, priest_name, priest_mobile: str | null
rejected_by: [priestId]
eligible_priest_ids: [priestId]              # snapshot at creation
created_date: ISO string
```

### `password_resets`
```
token: str
user_id: str
used: bool
created_at: ISO string
```

---

## 7. Seed / bootstrap

On backend startup (`seed_database` in `server.py`):
1. Any legacy demo priests / devotees / bookings are wiped.
2. Legacy `priests` collection (from v1) is dropped.
3. 10 poojas are upserted (idempotent, backfills `is_active=true`).
4. Default admin created if missing:
   - `admin@yagnika.com` / `Admin@123`

Priests, devotees, and bookings are created via the app only.

---

## 8. Frontend routing map (Expo Router)

```
app/
├── _layout.tsx                          Root: SafeAreaProvider + AuthProvider + GestureHandlerRootView
├── index.tsx                            Splash (auto-forwards on session)
├── home.tsx                             Landing — Devotee / Priest / Admin entry points
├── register.tsx                         Devotee register
├── priest-register.tsx                  Priest register (checkbox poojas, GPS)
├── login.tsx                            `?role=devotee|priest|admin`
├── forgot-password.tsx                  Shared reset flow
├── (devotee)/
│   ├── _layout.tsx
│   ├── dashboard.tsx                    Home / Bookings / Profile tabs
│   ├── book/[poojaId].tsx               Date+time+sankalp+gothram+place
│   └── booking-confirmation/[id].tsx    Polls for Priest Assigned
├── priest-dashboard.tsx                 Pending / Accepted / Completed
└── admin-dashboard.tsx                  Overview / Poojas / Bookings / Priests / Devotees
```

State: single `AuthContext` (`src/context/AuthContext.tsx`) exposes `user`, `token`, `login`, `registerDevotee`, `registerPriest`, `logout`, `refreshUser` and helper `apiFetch(path, opts, token)`.

Real-time polling: `useFocusEffect` + `setInterval` (5–8 s) on the devotee dashboard, priest dashboard, admin dashboard, and booking confirmation screen.

---

## 9. Static assets

Under `frontend/assets/`:
- `images/icon.png`, `adaptive-icon.png`, `favicon.png`, `splash-image.png`, `app-image.png` — Expo default app icons/splash placeholders.
- `yagnika/splash-screen.png` — background of the app splash (extracted from the original design).
- `yagnika/registration-screen.png` — folded-hands illustration (still available if you re-add it to the register screen).

No CDN, no remote images required — everything ships in the app bundle.

---

## 10. Running locally

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install "passlib[bcrypt]" "python-jose[cryptography]"    # if not in requirements
cp .env.example .env                                         # then edit
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
Ensure MongoDB is running at `MONGO_URL`. First launch will seed poojas + admin.

### Frontend
```bash
cd frontend
yarn install
# Put your backend URL in .env:
echo 'EXPO_PUBLIC_API_URL=http://<LAN-IP>:8001' >> .env
yarn start
```
Press `w` for web, `i` for iOS Simulator, `a` for Android, or scan the QR with **Expo Go**.

⚠️ `expo-location` prompts natively for permission the first time a priest taps "Use current location". On web it falls back to browser geolocation.

---

## 11. Deployment notes

- **Emergent platform**: click the "Publish" button (top-right). Kubernetes ingress already routes `/api/*` → 8001 and everything else → the Expo build. No CORS changes needed inside the same origin.
- **Custom deployment**: build the Expo web export (`npx expo export --platform web`) and serve behind a reverse proxy that forwards `/api/*` to FastAPI. For native builds (iOS/Android APK/IPA) use the Emergent Publish → Build flow — never run EAS CLI directly.
- **Secrets**: change `JWT_SECRET_KEY` (32+ random bytes) and lock down CORS `allow_origins` in `server.py` before production.
- **Email delivery** for forgot-password: swap the `ForgotPasswordResponse` return with an SMTP / SendGrid call and remove the token from the HTTP body.

---

## 12. Testing quick reference

Backend E2E via curl (see `TESTING.md` snippet in this bundle):
```bash
curl -X POST $URL/api/auth/register-priest -H "Content-Type: application/json" -d '{"name":"A","email":"a@x.com","mobile":"1","password":"Test@123","address":"X","services":["p1"]}'
```

Frontend testIDs are exposed on every interactive element (`btn-*`, `input-*`, `chip-*`, `tab-*`, `admin-tab-*`, `pooja-check-*`, `pick-date-*`, `pick-time-*`, etc.) for Playwright / Detox.

---

## 13. Where things live in the code

| Concern                       | File                                                     |
|-------------------------------|----------------------------------------------------------|
| API routes + auth + seed      | `backend/server.py`                                      |
| Auth React context + fetch    | `frontend/src/context/AuthContext.tsx`                   |
| Theme (colors, radius)        | `frontend/src/theme.ts`                                  |
| Storage helper                | `frontend/src/utils/storage/`                            |
| Icon font prewarm             | `frontend/src/hooks/use-icon-fonts.ts`                   |
| Root providers                | `frontend/app/_layout.tsx`                               |
| All screens                   | `frontend/app/…`                                         |

That's the entire integration surface — three env variables, one JWT-secured API, and one polling loop.

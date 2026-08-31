# Yagnika PoC — Setup & Run Guide

React Native (Expo) + FastAPI + MongoDB proof-of-concept implementing the automatic-priest-assignment booking model.

## What's inside this bundle

```
backend/
├── server.py                      Full FastAPI app (auth, poojas, bookings, admin, seed)
├── requirements.txt
└── .env.example
frontend/
├── app/                           Expo Router screens
│   ├── _layout.tsx
│   ├── index.tsx                  Splash
│   ├── home.tsx                   Landing (Devotee / Priest / Admin)
│   ├── register.tsx               Devotee register
│   ├── priest-register.tsx        Priest register (checkbox poojas, GPS)
│   ├── login.tsx                  Role-aware login (?role=…)
│   ├── forgot-password.tsx        Reset flow (token-based)
│   ├── (devotee)/
│   │   ├── _layout.tsx
│   │   ├── dashboard.tsx          Home / Bookings / Profile tabs
│   │   ├── book/[poojaId].tsx     Date+time+sankalp+gothram+place
│   │   └── booking-confirmation/[id].tsx   Polls for Priest Assigned
│   ├── priest-dashboard.tsx       Pending / Accepted / Completed
│   └── admin-dashboard.tsx        Overview / Poojas / Bookings / Priests / Devotees
├── src/
│   ├── context/AuthContext.tsx    Auth + apiFetch helper
│   ├── theme.ts                   Colors + radii
│   ├── hooks/use-icon-fonts.ts    Icon font prewarm
│   └── utils/storage/             AsyncStorage helper
├── assets/
│   ├── images/                    Default Expo icons/splash
│   └── yagnika/                   splash-screen.png, registration-screen.png (original artwork preserved)
└── package.json, app.json, tsconfig.json, metro.config.js, eslint.config.js

memory/
├── PRD.md
└── test_credentials.md

INTEGRATION.md    Full API reference, auth model, data schema, deployment
TESTING.md        Copy-paste curl recipes for every flow
README_YAGNIKA_POC.md   ← you are here
```

## Prerequisites

- Python 3.11+, `pip`
- Node.js 20+, Yarn 1.22 (or npm)
- MongoDB 5+ running locally or in Atlas

## Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install "passlib[bcrypt]" "python-jose[cryptography]"
cp .env.example .env      # edit if needed
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

First launch seeds:
- **10 poojas** (`p1`…`p10`)
- **1 default admin** — `admin@yagnika.com` / `Admin@123`
- Everything else is empty. Register priests and devotees from the app.

## Frontend

```bash
cd frontend
yarn install
# tell the app where the backend lives (no trailing slash, no /api):
cat > .env <<EOF
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8001
EOF
yarn start
```
Press `w` (web), `i` (iOS Simulator), `a` (Android emulator), or scan the QR with **Expo Go**.

## Demo journey

1. **Devotee**: Home → *Register as Devotee* → Dashboard → tap **Book** on a pooja → pick date / time / place → *Book Pooja*.
2. **Priest**: Log out → Home → *Register as Priest* → fill form, tap *Use current location*, tick pooja checkboxes → Register.  
   (Register a second priest with overlapping poojas to see the race.)
3. Priest **Pending** tab shows the request → tap **Accept**.
4. Devotee dashboard auto-updates within a few seconds to show **Priest Assigned** + priest name & mobile.
5. Priest **Accepted** tab → **Mark Completed** → booking moves to **Completed**.
6. **Admin**: Home → *Admin Login* (fields prefilled) → tour Overview / Poojas / Bookings / Priests / Devotees, add or disable a pooja, deactivate a priest, filter bookings.
7. **Forgot password**: on a devotee/priest login screen, tap *Forgot password?* → get token → paste + set a new password → log in.

## Rebuilding the source zip

```bash
cd /app && rm -f yagnika_poc_source.zip
zip -rq yagnika_poc_source.zip \
  backend/server.py backend/requirements.txt backend/.env.example \
  frontend/app frontend/src frontend/assets frontend/package.json frontend/app.json \
  frontend/tsconfig.json frontend/eslint.config.js frontend/metro.config.js \
  memory/PRD.md memory/test_credentials.md \
  INTEGRATION.md TESTING.md README_YAGNIKA_POC.md \
  -x "*/node_modules/*" "*/.metro-cache/*" "*/.git/*" "*/.expo/*"
```

## Deep-dives

- Architecture, dependencies, env vars, endpoints, data model, auth: **INTEGRATION.md**
- End-to-end verification via curl: **TESTING.md**
- Product requirements & booking lifecycle: **memory/PRD.md**

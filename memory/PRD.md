# Yagnika — PoC PRD (v2, Auto-Assignment)

## Overview
Yagnika connects Devotees (Yajmanas) with Priests (Yagnikas) for pooja bookings. The v2 refactor replaces manual priest selection with an **Automatic Priest Assignment** model: devotees choose a pooja + date/time; the system fans the request out to all eligible priests, and the first to Accept becomes the assigned priest.

## Roles
- **Devotee** — books poojas, sees status updates
- **Priest** — self-registers, receives requests for chosen poojas, accepts / rejects / completes
- **Admin** — single default account (`admin@yagnika.com` / `Admin@123`), manages poojas / bookings / priests / devotees

## Stack
- Expo (React Native) + Expo Router + TypeScript
- FastAPI + Motor / MongoDB
- JWT (python-jose) + bcrypt (passlib)
- expo-location for optional priest address auto-fill

## Screens
- `/` Splash → `/home` (or resumes session)
- `/home` — 3 login/register options (Devotee, Priest, Admin)
- `/register` — Devotee (name, email, mobile, password)
- `/priest-register` — Priest (name, email, mobile, password, address+GPS, pooja checkboxes with Select-All)
- `/login?role=…` — role-specific login
- `/forgot-password?role=…` — request token + reset
- `/(devotee)/dashboard` — Home (pooja list), Bookings, Profile tabs
- `/(devotee)/book/[poojaId]` — date, time, sankalp, gothram, place, notes → creates booking
- `/(devotee)/booking-confirmation/[id]` — auto-polls until Priest Assigned
- `/priest-dashboard` — Pending / Accepted / Completed sections; auto-polls
- `/admin-dashboard` — Overview / Poojas / Bookings / Priests / Devotees tabs

## Backend endpoints
- Auth: `/api/auth/register`, `/api/auth/register-priest`, `/api/auth/login`, `/api/auth/me`, `/api/auth/forgot-password`, `/api/auth/reset-password`
- Poojas: `GET /api/poojas`, admin `POST /api/admin/poojas`, `PATCH /api/admin/poojas/{id}` (enable/disable/edit)
- Bookings devotee: `POST /api/bookings`, `GET /api/bookings/mine`
- Bookings priest: `GET /api/bookings/priest/inbox|accepted|completed`, `POST /api/bookings/{id}/accept|reject|complete`
- Admin: `GET /api/admin/bookings` (filters: status, date, pooja_id, priest_id, user_id), `/admin/priests`, `/admin/devotees`, `PATCH /api/admin/users/{id}/active`, `GET /api/admin/stats`

## Data model
- `users`: id, name, email, mobile, role (devotee|priest|admin), hashed_password, address, latitude, longitude, services (priest pooja ids), is_active
- `poojas`: id, name, sanskrit_name, description, duration, price, is_active
- `bookings`: id, user_id/name/mobile, pooja_id/name, booking_date, booking_time, sankalp_name, gothram, place, notes, status, priest_id/name/mobile (nullable), rejected_by (list), eligible_priest_ids (list), created_date
- `password_resets`: token, user_id, used, created_at

## Booking status lifecycle
`Pending Priest Assignment` → `Priest Assigned` (via priest Accept, atomic) → `Completed` (priest Complete). `Cancelled` reserved.

## Auto-assignment algorithm
1. Devotee submits booking with `pooja_id + date + time`
2. Backend computes `eligible_priest_ids` = active priests whose `services` include the pooja AND who have NO existing `Priest Assigned`/`Completed` booking overlapping the 2-hour slot on that date
3. If none → `409 No Priests Available`
4. Booking saved with status `Pending Priest Assignment` and the eligible list
5. Each eligible priest's `/inbox` filter returns bookings where they're eligible AND haven't rejected AND still available
6. First priest to hit `POST /accept` triggers an atomic `update_one({id, status:"Pending Priest Assignment"}, {$set: assigned + priest_info})` — only one wins. Others receive `409`.
7. Once assigned, priest's future `/inbox` calls skip conflicting time slots for their next assignments.

## Real-time behavior
Client polls every 5-8 s while a dashboard is focused (devotee dashboard, booking confirmation, priest dashboard, admin dashboard). No WebSockets — polling is sufficient for PoC.

## Seed data (startup)
- 10 poojas (idempotent; existing docs backfilled with `is_active=true`)
- 1 admin account
- All prior priest/devotee/booking documents are wiped on startup — clean slate

## Out of scope
Payments, notifications, chat, ratings, review, multi-language.

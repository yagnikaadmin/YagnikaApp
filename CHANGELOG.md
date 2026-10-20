# Changelog

## 2026-10-20 (uncommitted, on `dev`)

### Backend (`backend/server.py`)
- Booking requests now respect priest availability: pause toggles, weekly off days and blocked hours, per-date overrides, `working_status` (on leave / not available), and the priest's break/buffer between bookings.
- Applied at booking creation, in the priest inbox, and on accept (409 "You are marked unavailable at this time").
- `busy` no longer blocks a priest from all new bookings. Only overlapping times are blocked, so a priest with an accepted booking still gets requests for other dates and times. The `busy` field is still stored.

### Customer app (`frontend/src/components/TimeField.tsx`)
- Fixed the time picker: stepping past 11 now flips AM/PM (11 AM → 12 PM instead of 12 AM), so bookings are no longer saved at midnight by mistake.

### Tests and docs
- `backend/tests/test_scenarios.py`: rewrote the busy tests and added availability scenarios (not yet run).
- `CLAUDE.md`, `TESTING.md`: updated for the new eligibility rules.

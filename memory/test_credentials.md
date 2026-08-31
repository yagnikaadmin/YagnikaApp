# Yagnika PoC Test Credentials

## Admin (default, cannot be modified)
- Email: admin@yagnika.com
- Password: Admin@123

## Devotee & Priest
The database is empty on startup — all devotees and priests must register through the app.

Create a test priest via the "Register as Priest" flow on the landing page (must select at least one pooja checkbox).
Create a test devotee via the "Register as Devotee" flow.

## Forgot Password
- Available for devotee and priest accounts
- Backend returns reset_token in the POST /api/auth/forgot-password response (PoC — normally emailed)
- POST /api/auth/reset-password { reset_token, new_password }
- Admin passwords cannot be reset via this flow.

## Seed data
- Only 10 Poojas are seeded (they can be added/edited/disabled by admin)
- Everything else — priests, devotees, bookings — is created via the app

# Yagnika — E2E Test Recipes

Ready-to-copy test flows. Set `URL` to your backend base:

```bash
export URL=http://localhost:8001
# Bookings must be for today or later — use tomorrow:
export DATE=$(python3 -c "import datetime;print(datetime.date.today()+datetime.timedelta(days=1))")
```

Before you start:
- Run the backend with `ENVIRONMENT=development` in `backend/.env` (the default is `production`, which omits `reset_token` from the forgot-password response — section 4 needs it). The token is also always printed in the server log.
- Use a throwaway database. Emails are unique per `(email, role)`, so re-running these recipes against the same DB returns 400 on registration — change the emails or drop the DB.
- Rate limits are in-memory per client IP (login 10 / 5 min, register 50 / h, forgot-password 5 / h). Restart the server to reset them.
- Devotee/priest login and forgot-password require a `role` (`devotee` | `priest`). The admin signs in separately with a **username** via `POST /api/admin/login`, using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `backend/.env`.
- Priest registration requires the full profile, including an Aadhaar proof (a JPEG/PNG/PDF data URI) and a valid Indian mobile number. The shared mandatory fields are kept in `$PRIEST_FIELDS` below.
- `services` must include at least one catalog service from a main (non-Dana) category. The demo poojas `p1`–`p10` alone are rejected, so every priest below also offers `sc-1-1` (Suprabhata Seva).
- **New priests are inactive until an admin approves them**, so every gated priest call returns 401 until then. Use `approve_priest` below.

```bash
PRIEST_FIELDS='"aadhaar_number":"123412341234","aadhaar_proof":"data:image/png;base64,iVBORw0KGgo=","aadhaar_proof_name":"aadhaar.png","date_of_birth":"1980-01-15","sampradaya":"Smarta","agama":"Vaikhanasa","years_of_experience":10,"languages":["Sanskrit","Telugu"],"priest_type":"independent"'

# Admin token (username/password from backend/.env)
ATOKEN=$(curl -s -X POST $URL/api/admin/login -H "Content-Type: application/json" \
  -d '{"username":"<ADMIN_USERNAME>","password":"<ADMIN_PASSWORD>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# approve_priest <user_id>: find the priest's pending registration and approve it
approve_priest() {
  REG_ID=$(curl -s -H "Authorization: Bearer $ATOKEN" "$URL/api/admin/priest-registrations?status=pending" \
    | python3 -c "import sys,json;print(next(r['id'] for r in json.load(sys.stdin) if r['user_id']=='$1'))")
  curl -s -X POST $URL/api/admin/priest-registrations/$REG_ID/approve -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ATOKEN" -d '{"note":"ok"}'; echo
}
```

## 1. Full booking lifecycle (2 priests, 1 devotee)

```bash
# Register two priests (both offer pooja p1)
P1=$(curl -s -X POST $URL/api/auth/register-priest -H "Content-Type: application/json" \
  -d '{"name":"Pandit A","email":"pa@t.com","mobile":"+91 91111 11111","password":"Test@123","address":"Chennai","services":["p1","p2","sc-1-1"],'"$PRIEST_FIELDS"'}')
P1_TOKEN=$(echo $P1 | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
P2=$(curl -s -X POST $URL/api/auth/register-priest -H "Content-Type: application/json" \
  -d '{"name":"Pandit B","email":"pb@t.com","mobile":"+91 92222 22222","password":"Test@123","address":"Bangalore","services":["p1","p4","sc-1-1"],'"$PRIEST_FIELDS"'}')
P2_TOKEN=$(echo $P2 | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Both start pending (approval_status "pending", inactive) — approve them
approve_priest $(echo $P1 | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['id'])")
approve_priest $(echo $P2 | python3 -c "import sys,json;print(json.load(sys.stdin)['user']['id'])")

# Register devotee
D=$(curl -s -X POST $URL/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Ravi","email":"ravi@t.com","mobile":"+91 99999 99999","password":"Test@123"}')
D_TOKEN=$(echo $D | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Devotee books p1 → both priests eligible
BK=$(curl -s -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"'"$DATE"'","booking_time":"08:00 AM","sankalp_name":"Ravi","gothram":"Bharadwaja","place":"Chennai home"}')
BID=$(echo $BK | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# Both priests see it (expect 1 each)
curl -s -H "Authorization: Bearer $P1_TOKEN" $URL/api/bookings/priest/inbox | python3 -c "import sys,json;print('P1 inbox:',len(json.load(sys.stdin)))"
curl -s -H "Authorization: Bearer $P2_TOKEN" $URL/api/bookings/priest/inbox | python3 -c "import sys,json;print('P2 inbox:',len(json.load(sys.stdin)))"

# Priest A accepts (busy=true until completed; informational only, A still gets non-overlapping requests)
curl -s -X POST $URL/api/bookings/$BID/accept -H "Authorization: Bearer $P1_TOKEN" | python3 -c "import sys,json;print('status:',json.load(sys.stdin)['status'])"
curl -s -H "Authorization: Bearer $P1_TOKEN" $URL/api/auth/me | python3 -c "import sys,json;print('P1 busy:',json.load(sys.stdin)['busy'])"

# Priest B inbox now empty; second accept must 409
curl -s -H "Authorization: Bearer $P2_TOKEN" $URL/api/bookings/priest/inbox | python3 -c "import sys,json;print('P2 inbox after:',len(json.load(sys.stdin)))"
curl -s -o /dev/null -w "P2 accept HTTP: %{http_code}\n" -X POST $URL/api/bookings/$BID/accept -H "Authorization: Bearer $P2_TOKEN"

# Devotee sees priest info
curl -s -H "Authorization: Bearer $D_TOKEN" $URL/api/bookings/mine | python3 -c "import sys,json;b=json.load(sys.stdin)[0];print(b['status'],'-',b['priest_name'],b['priest_mobile'])"

# Priest A completes (busy flag clears)
curl -s -X POST $URL/api/bookings/$BID/complete -H "Authorization: Bearer $P1_TOKEN" | python3 -c "import sys,json;print('final status:',json.load(sys.stdin)['status'])"
```

## 2. Time-slot conflict

```bash
# After the above, priest A has a Completed p1 booking at 08:00 (p1 lasts 2 hours → 08:00–10:00).
# Try 09:00 the same day — it overlaps for A, so only priest B should be eligible.
curl -s -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"'"$DATE"'","booking_time":"09:00 AM","sankalp_name":"Ravi","gothram":"X","place":"Y"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('eligible=',len(d['eligible_priest_ids']))"
# Expected: eligible=1
```

Overlap uses each pooja's own `duration` (unparseable or empty durations fall back to 120 minutes), and each existing booking is widened by the priest's `buffer_minutes`. `busy` does not exclude a priest; only an overlap does. The priest's availability (`/api/priest/availability…`: pause toggles, weekly off days/unavailable windows, per-date overrides, `working_status`) is applied in person mode when choosing eligible priests, in the inbox and on accept (409 "You are marked unavailable at this time").

```bash
# Priest B pauses in-person poojas → no longer eligible
curl -s -X PATCH $URL/api/priest/availability -H "Content-Type: application/json" -H "Authorization: Bearer $P2_TOKEN" -d '{"offline_paused":true}' > /dev/null
curl -s -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"'"$DATE"'","booking_time":"04:00 PM","sankalp_name":"Ravi","gothram":"X","place":"Y"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('eligible=',len(d['eligible_priest_ids']))"
# Expected: eligible=1 (only A). Undo with {"offline_paused":false}.
```

## 3. No priests available

```bash
# Book a pooja that no priest offers → 409
curl -s -o /dev/null -w "HTTP: %{http_code}\n" -X POST $URL/api/bookings -H "Content-Type: application/json" \
  -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p10","booking_date":"'"$DATE"'","booking_time":"08:00 AM","sankalp_name":"X","gothram":"Y","place":"Z"}'
# Expected: HTTP: 409
```

## 4. Forgot password

```bash
FP=$(curl -s -X POST $URL/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"ravi@t.com","role":"devotee"}')
FTOK=$(echo $FP | python3 -c "import sys,json;print(json.load(sys.stdin)['reset_token'])")   # needs ENVIRONMENT=development
curl -s -o /dev/null -w "reset: %{http_code}\n" -X POST $URL/api/auth/reset-password -H "Content-Type: application/json" \
  -d "{\"reset_token\":\"$FTOK\",\"new_password\":\"NewPw@123\"}"
curl -s -o /dev/null -w "login-new: %{http_code}\n" -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"ravi@t.com","password":"NewPw@123","role":"devotee"}'
```

Reset tokens expire after 30 minutes and are single-use. Unknown emails and the admin account get the same generic response with no token.

## 5. Admin operations

The same operations are available in the Admin Web UI at `$URL/admin` (served by the backend).

```bash
# $ATOKEN comes from the setup block at the top (POST /api/admin/login)

# Priest registration review: submitted -> interview -> approved | rejected
curl -s -H "Authorization: Bearer $ATOKEN" "$URL/api/admin/priest-registrations?status=pending"
# curl -s -X POST $URL/api/admin/priest-registrations/<reg_id>/stage  -H "Content-Type: application/json" -H "Authorization: Bearer $ATOKEN" -d '{"stage":"interview"}'
# curl -s -X POST $URL/api/admin/priest-registrations/<reg_id>/reject -H "Content-Type: application/json" -H "Authorization: Bearer $ATOKEN" -d '{"note":"reason"}'

# Stats
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/stats

# All priests / devotees / bookings / priest registration records
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/priests
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/devotees
curl -s -H "Authorization: Bearer $ATOKEN" "$URL/api/admin/bookings?status=Priest%20Assigned"
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/priest-registrations

# Create + disable a pooja
NEW=$(curl -s -X POST $URL/api/admin/poojas -H "Content-Type: application/json" -H "Authorization: Bearer $ATOKEN" \
  -d '{"name":"Test Pooja","sanskrit_name":"॥ टेस्ट ॥","description":"Demo","duration":"1 hour","price":499}')
NID=$(echo $NEW | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X PATCH $URL/api/admin/poojas/$NID -H "Content-Type: application/json" -H "Authorization: Bearer $ATOKEN" \
  -d '{"is_active":false}' | python3 -c "import sys,json;print('active:',json.load(sys.stdin)['is_active'])"

# Deactivate a devotee (target by id)
DEV_ID=$(curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/devotees | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id']) if d else print('')")
[ -n "$DEV_ID" ] && curl -s -X PATCH $URL/api/admin/users/$DEV_ID/active -H "Content-Type: application/json" -H "Authorization: Bearer $ATOKEN" \
  -d '{"is_active":false}' | python3 -c "import sys,json;print('active:',json.load(sys.stdin)['is_active'])"
```

Note: the seeded service catalog (`sc-*` poojas) is rebuilt from `SERVICE_CATALOG` on every server restart, so admin edits to it are reset; edits to `p1`–`p10` and admin-created poojas persist.

## 6. Authorization / negative cases

```bash
# Unauthenticated
curl -s -o /dev/null -w "no-auth /me: %{http_code}\n" $URL/api/auth/me                      # 401

# Devotee tries priest endpoint
curl -s -o /dev/null -w "devotee->priest: %{http_code}\n" -H "Authorization: Bearer $D_TOKEN" $URL/api/bookings/priest/inbox   # 403

# Priest tries to create booking
curl -s -o /dev/null -w "priest->booking: %{http_code}\n" -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $P1_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"'"$DATE"'","booking_time":"08:00 AM","sankalp_name":"x","gothram":"y","place":"z"}'   # 403

# Non-admin tries admin
curl -s -o /dev/null -w "devotee->admin: %{http_code}\n" -H "Authorization: Bearer $D_TOKEN" $URL/api/admin/stats            # 403

# Login under the wrong role (devotee credentials on the priest login)
curl -s -o /dev/null -w "wrong-role login: %{http_code}\n" -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"ravi@t.com","password":"NewPw@123","role":"priest"}'                                 # 401
```

## Automated suite

The same scenarios (plus race, dual-role, busy-state, priest-approval and rate-limit cases) are in `backend/tests/test_scenarios.py`. It reads the admin credentials from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (environment or `backend/.env`):

```bash
cd backend
pytest tests/test_scenarios.py -v          # server running on :8001; restart it between full runs (rate limits)
pytest tests/test_panchangam.py -v         # pure calculation tests — no server or database needed
```

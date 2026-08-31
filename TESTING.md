# Yagnika PoC — E2E Test Recipes

Ready-to-copy test flows. Set `URL` to your backend base:

```bash
export URL=https://yagnika-firestore.preview.emergentagent.com
# or locally: export URL=http://localhost:8001
```

## 1. Full booking lifecycle (2 priests, 1 devotee)

```bash
# Register two priests (both offer pooja p1)
P1=$(curl -s -X POST $URL/api/auth/register-priest -H "Content-Type: application/json" \
  -d '{"name":"Pandit A","email":"pa@t.com","mobile":"+91 91111 11111","password":"Test@123","address":"Chennai","services":["p1","p2"]}')
P1_TOKEN=$(echo $P1 | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
P2=$(curl -s -X POST $URL/api/auth/register-priest -H "Content-Type: application/json" \
  -d '{"name":"Pandit B","email":"pb@t.com","mobile":"+91 92222 22222","password":"Test@123","address":"Bangalore","services":["p1","p4"]}')
P2_TOKEN=$(echo $P2 | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Register devotee
D=$(curl -s -X POST $URL/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Ravi","email":"ravi@t.com","mobile":"+91 99999 99999","password":"Test@123"}')
D_TOKEN=$(echo $D | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Devotee books p1 → both priests eligible
BK=$(curl -s -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"2026-08-15","booking_time":"08:00 AM","sankalp_name":"Ravi","gothram":"Bharadwaja","place":"Chennai home"}')
BID=$(echo $BK | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# Both priests see it (expect 1 each)
curl -s -H "Authorization: Bearer $P1_TOKEN" $URL/api/bookings/priest/inbox | python3 -c "import sys,json;print('P1 inbox:',len(json.load(sys.stdin)))"
curl -s -H "Authorization: Bearer $P2_TOKEN" $URL/api/bookings/priest/inbox | python3 -c "import sys,json;print('P2 inbox:',len(json.load(sys.stdin)))"

# Priest A accepts
curl -s -X POST $URL/api/bookings/$BID/accept -H "Authorization: Bearer $P1_TOKEN" | python3 -c "import sys,json;print('status:',json.load(sys.stdin)['status'])"

# Priest B inbox now empty; second accept must 409
curl -s -H "Authorization: Bearer $P2_TOKEN" $URL/api/bookings/priest/inbox | python3 -c "import sys,json;print('P2 inbox after:',len(json.load(sys.stdin)))"
curl -s -o /dev/null -w "P2 accept HTTP: %{http_code}\n" -X POST $URL/api/bookings/$BID/accept -H "Authorization: Bearer $P2_TOKEN"

# Devotee sees priest info
curl -s -H "Authorization: Bearer $D_TOKEN" $URL/api/bookings/mine | python3 -c "import sys,json;b=json.load(sys.stdin)[0];print(b['status'],'-',b['priest_name'],b['priest_mobile'])"

# Priest A completes
curl -s -X POST $URL/api/bookings/$BID/complete -H "Authorization: Bearer $P1_TOKEN" | python3 -c "import sys,json;print('final status:',json.load(sys.stdin)['status'])"
```

## 2. Availability conflict

```bash
# After the above, priest A is booked at 08:00. Try 09:00 same day — only priest B should be eligible.
curl -s -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"2026-08-15","booking_time":"09:00 AM","sankalp_name":"Ravi","gothram":"X","place":"Y"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('eligible=',len(d['eligible_priest_ids']))"
# Expected: eligible=1
```

## 3. No priests available

```bash
# Book a pooja that no priest offers → 409
curl -s -o /dev/null -w "HTTP: %{http_code}\n" -X POST $URL/api/bookings -H "Content-Type: application/json" \
  -H "Authorization: Bearer $D_TOKEN" \
  -d '{"pooja_id":"p10","booking_date":"2026-08-15","booking_time":"08:00 AM","sankalp_name":"X","gothram":"Y","place":"Z"}'
# Expected: HTTP: 409
```

## 4. Forgot password

```bash
FP=$(curl -s -X POST $URL/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"ravi@t.com"}')
FTOK=$(echo $FP | python3 -c "import sys,json;print(json.load(sys.stdin)['reset_token'])")
curl -s -o /dev/null -w "reset: %{http_code}\n" -X POST $URL/api/auth/reset-password -H "Content-Type: application/json" \
  -d "{\"reset_token\":\"$FTOK\",\"new_password\":\"NewPw@123\"}"
curl -s -o /dev/null -w "login-new: %{http_code}\n" -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"ravi@t.com","password":"NewPw@123"}'
```

## 5. Admin operations

```bash
ATOKEN=$(curl -s -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@yagnika.com","password":"Admin@123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# Stats
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/stats

# All priests / devotees / bookings
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/priests
curl -s -H "Authorization: Bearer $ATOKEN" $URL/api/admin/devotees
curl -s -H "Authorization: Bearer $ATOKEN" "$URL/api/admin/bookings?status=Priest%20Assigned"

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

## 6. Authorization / negative cases

```bash
# Unauthenticated
curl -s -o /dev/null -w "no-auth /me: %{http_code}\n" $URL/api/auth/me                      # 401

# Devotee tries priest endpoint
curl -s -o /dev/null -w "devotee->priest: %{http_code}\n" -H "Authorization: Bearer $D_TOKEN" $URL/api/bookings/priest/inbox   # 403

# Priest tries to create booking
curl -s -o /dev/null -w "priest->booking: %{http_code}\n" -X POST $URL/api/bookings -H "Content-Type: application/json" -H "Authorization: Bearer $P1_TOKEN" \
  -d '{"pooja_id":"p1","booking_date":"2026-09-01","booking_time":"08:00 AM","sankalp_name":"x","gothram":"y","place":"z"}'   # 403

# Non-admin tries admin
curl -s -o /dev/null -w "devotee->admin: %{http_code}\n" -H "Authorization: Bearer $D_TOKEN" $URL/api/admin/stats            # 403
```

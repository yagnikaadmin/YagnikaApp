"""Real-world scenario tests for the Yagnika booking backend.

Run against a live server pointed at a throwaway local MongoDB — never
point YAGNIKA_TEST_BASE_URL at a production database, since these tests
create real users, poojas, and bookings.

    uvicorn server:app --host 0.0.0.0 --port 8001   # in one terminal
    pytest tests/test_scenarios.py -v                # in another
"""
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("YAGNIKA_TEST_BASE_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()

ADMIN_EMAIL = "admin@yagnika.com"
ADMIN_PASSWORD = "Admin@123"


def unique_email(prefix: str) -> str:
    # pydantic's EmailStr does a live deliverability check, which rejects
    # reserved/special-use domains (.local, .test, example.com, ...) — use a
    # real domain with MX records so registration isn't blocked on that.
    return f"{prefix}-{uuid.uuid4().hex[:10]}@mailinator.com"


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def session():
    return requests.Session()


@pytest.fixture(scope="session")
def poojas(session):
    r = session.get(f"{API}/poojas", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1, "expected seed poojas to be present"
    return {p["id"]: p for p in data}


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "role": "admin"}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def register_devotee(session, name="Test Devotee"):
    r = session.post(f"{API}/auth/register", json={
        "name": name, "email": unique_email("devotee"), "mobile": "9000000000", "password": "password123",
    }, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


def register_priest(session, services, name="Test Priest"):
    r = session.post(f"{API}/auth/register-priest", json={
        "name": name, "email": unique_email("priest"), "mobile": "9111111111", "password": "password123",
        "address": "123 Test Street", "latitude": 17.4, "longitude": 78.5, "services": services,
    }, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


class TestRegistrationAndAuth:
    def test_duplicate_email_registration_rejected(self, session):
        email = unique_email("dup")
        payload = {"name": "A", "email": email, "mobile": "9000000001", "password": "password123"}
        assert session.post(f"{API}/auth/register", json=payload, timeout=10).status_code == 200
        assert session.post(f"{API}/auth/register", json=payload, timeout=10).status_code == 400

    def test_concurrent_duplicate_registration_only_one_succeeds(self):
        # Fires two registrations with the SAME email as close to
        # simultaneously as possible — exactly the race the unique index
        # on users.email is meant to close.
        email = unique_email("race")
        payload = {"name": "Racer", "email": email, "mobile": "9000000002", "password": "password123"}

        def do_register():
            return requests.post(f"{API}/auth/register", json=payload, timeout=10)

        with ThreadPoolExecutor(max_workers=2) as ex:
            results = [f.result() for f in [ex.submit(do_register) for _ in range(2)]]
        statuses = sorted(r.status_code for r in results)
        assert statuses == [200, 400], f"expected exactly one winner, got {statuses}"

    def test_login_wrong_password_rejected(self, session):
        d = register_devotee(session)
        r = session.post(f"{API}/auth/login", json={"email": d["user"]["email"], "password": "wrong", "role": "devotee"}, timeout=10)
        assert r.status_code == 401

    def test_deactivated_user_cannot_authenticate(self, session, admin_token):
        d = register_devotee(session)
        toggle_off = session.patch(f"{API}/admin/users/{d['user']['id']}/active", json={"is_active": False},
                                    headers=auth_headers(admin_token), timeout=10)
        assert toggle_off.status_code == 200
        me = session.get(f"{API}/auth/me", headers=auth_headers(d["access_token"]), timeout=10)
        assert me.status_code == 401
        session.patch(f"{API}/admin/users/{d['user']['id']}/active", json={"is_active": True},
                       headers=auth_headers(admin_token), timeout=10)


class TestForgotPassword:
    def test_unknown_and_known_email_get_identical_response_shape(self, session):
        unknown = session.post(f"{API}/auth/forgot-password", json={"email": unique_email("nobody"), "role": "devotee"}, timeout=10)
        assert unknown.status_code == 200, "must not 404 — that would leak whether the email is registered"
        d = register_devotee(session)
        known = session.post(f"{API}/auth/forgot-password", json={"email": d["user"]["email"], "role": "devotee"}, timeout=10)
        assert known.status_code == 200
        assert unknown.json()["message"] == known.json()["message"]

    def test_full_reset_flow(self, session):
        d = register_devotee(session)
        email = d["user"]["email"]
        r = session.post(f"{API}/auth/forgot-password", json={"email": email, "role": "devotee"}, timeout=10)
        assert r.status_code == 200
        token = r.json().get("reset_token")
        assert token, "ENVIRONMENT=development should still return the token for local testing"

        reset = session.post(f"{API}/auth/reset-password", json={"reset_token": token, "new_password": "newpassword123"}, timeout=10)
        assert reset.status_code == 200

        old = session.post(f"{API}/auth/login", json={"email": email, "password": "password123", "role": "devotee"}, timeout=10)
        assert old.status_code == 401
        new = session.post(f"{API}/auth/login", json={"email": email, "password": "newpassword123", "role": "devotee"}, timeout=10)
        assert new.status_code == 200

    def test_reset_token_cannot_be_reused(self, session):
        d = register_devotee(session)
        email = d["user"]["email"]
        token = session.post(f"{API}/auth/forgot-password", json={"email": email, "role": "devotee"}, timeout=10).json()["reset_token"]
        first = session.post(f"{API}/auth/reset-password", json={"reset_token": token, "new_password": "abcdef12"}, timeout=10)
        assert first.status_code == 200
        second = session.post(f"{API}/auth/reset-password", json={"reset_token": token, "new_password": "ghijkl34"}, timeout=10)
        assert second.status_code == 400

    def test_invalid_token_rejected(self, session):
        r = session.post(f"{API}/auth/reset-password", json={"reset_token": "not-a-real-token", "new_password": "abcdef12"}, timeout=10)
        assert r.status_code == 400

    def test_admin_password_cannot_be_reset(self, session):
        r = session.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL, "role": "admin"}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("reset_token") is None, "admin must never get a reset token, even in dev mode"


class TestBookingLifecycle:
    def test_full_happy_path(self, session, poojas):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        devotee = register_devotee(session)

        booking = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "09:00 AM",
            "sankalp_name": "Test Sankalp", "gothram": "Bharadwaja", "place": "Home",
        }, headers=auth_headers(devotee["access_token"]), timeout=10)
        assert booking.status_code == 200, booking.text
        b = booking.json()
        assert b["status"] == "Pending Priest Assignment"
        assert priest["user"]["id"] in b["eligible_priest_ids"]

        accept = session.post(f"{API}/bookings/{b['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept.status_code == 200
        assert accept.json()["status"] == "Priest Assigned"
        assert accept.json()["priest_id"] == priest["user"]["id"]

        complete = session.post(f"{API}/bookings/{b['id']}/complete", headers=auth_headers(priest["access_token"]), timeout=10)
        assert complete.status_code == 200
        assert complete.json()["status"] == "Completed"

    def test_past_date_booking_rejected(self, session, poojas):
        pooja_id = next(iter(poojas))
        register_priest(session, [pooja_id])
        devotee = register_devotee(session)
        r = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": YESTERDAY, "booking_time": "09:00 AM",
            "sankalp_name": "X", "gothram": "Y", "place": "Z",
        }, headers=auth_headers(devotee["access_token"]), timeout=10)
        assert r.status_code == 400

    def test_no_priests_available_returns_409(self, session, admin_token):
        # A brand-new pooja via admin is guaranteed to have zero registered
        # priests, rather than relying on shared seed-data state.
        pooja = session.post(f"{API}/admin/poojas", json={
            "name": "Isolated Test Pooja", "sanskrit_name": "", "description": "", "duration": "1 hour", "price": 100,
        }, headers=auth_headers(admin_token), timeout=10).json()
        devotee = register_devotee(session)
        r = session.post(f"{API}/bookings", json={
            "pooja_id": pooja["id"], "booking_date": TOMORROW, "booking_time": "07:00 AM",
            "sankalp_name": "X", "gothram": "Y", "place": "Z",
        }, headers=auth_headers(devotee["access_token"]), timeout=10)
        assert r.status_code == 409

    def test_only_devotee_can_create_booking(self, session, poojas):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        r = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "09:00 AM",
            "sankalp_name": "X", "gothram": "Y", "place": "Z",
        }, headers=auth_headers(priest["access_token"]), timeout=10)
        assert r.status_code == 403

    def test_two_priests_race_to_accept_only_one_wins(self, session, poojas):
        pooja_id = next(iter(poojas))
        p1 = register_priest(session, [pooja_id])
        p2 = register_priest(session, [pooja_id])
        devotee = register_devotee(session)
        booking = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "11:00 AM",
            "sankalp_name": "Race", "gothram": "G", "place": "P",
        }, headers=auth_headers(devotee["access_token"]), timeout=10).json()

        def do_accept(token):
            return requests.post(f"{API}/bookings/{booking['id']}/accept", headers=auth_headers(token), timeout=10)

        with ThreadPoolExecutor(max_workers=2) as ex:
            results = [f.result() for f in [
                ex.submit(do_accept, p1["access_token"]), ex.submit(do_accept, p2["access_token"]),
            ]]
        statuses = sorted(r.status_code for r in results)
        assert statuses == [200, 409], f"expected exactly one winner, got {statuses}"

        final = session.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(p1["access_token"]), timeout=10).json()
        assert final["status"] == "Priest Assigned"
        assert final["priest_id"] in (p1["user"]["id"], p2["user"]["id"])

    def test_reject_removes_from_that_priests_inbox_not_others(self, session, poojas):
        pooja_id = next(iter(poojas))
        p1 = register_priest(session, [pooja_id])
        p2 = register_priest(session, [pooja_id])
        devotee = register_devotee(session)
        booking = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "12:30 PM",
            "sankalp_name": "Reject test", "gothram": "G", "place": "P",
        }, headers=auth_headers(devotee["access_token"]), timeout=10).json()

        reject = session.post(f"{API}/bookings/{booking['id']}/reject", headers=auth_headers(p1["access_token"]), timeout=10)
        assert reject.status_code == 200

        inbox1 = session.get(f"{API}/bookings/priest/inbox", headers=auth_headers(p1["access_token"]), timeout=10).json()
        assert booking["id"] not in [b["id"] for b in inbox1]
        inbox2 = session.get(f"{API}/bookings/priest/inbox", headers=auth_headers(p2["access_token"]), timeout=10).json()
        assert booking["id"] in [b["id"] for b in inbox2]

    def test_non_assigned_priest_cannot_complete(self, session, poojas):
        pooja_id = next(iter(poojas))
        p1 = register_priest(session, [pooja_id])
        p2 = register_priest(session, [pooja_id])
        devotee = register_devotee(session)
        booking = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "02:00 PM",
            "sankalp_name": "X", "gothram": "Y", "place": "Z",
        }, headers=auth_headers(devotee["access_token"]), timeout=10).json()
        session.post(f"{API}/bookings/{booking['id']}/accept", headers=auth_headers(p1["access_token"]), timeout=10)
        r = session.post(f"{API}/bookings/{booking['id']}/complete", headers=auth_headers(p2["access_token"]), timeout=10)
        assert r.status_code == 403

    def test_devotee_cannot_see_others_booking(self, session, poojas):
        pooja_id = next(iter(poojas))
        register_priest(session, [pooja_id])
        d1 = register_devotee(session)
        d2 = register_devotee(session)
        booking = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "03:00 PM",
            "sankalp_name": "X", "gothram": "Y", "place": "Z",
        }, headers=auth_headers(d1["access_token"]), timeout=10).json()
        r = session.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(d2["access_token"]), timeout=10)
        assert r.status_code == 403


class TestDurationAwareConflicts:
    def test_long_pooja_blocks_overlapping_shorter_slot(self, session):
        # Navagraha Homam (p5) is 3 hours — the old hardcoded-2-hour check
        # would have missed this conflict. Accept it 08:00-11:00, then
        # verify a 10:15 AM start (inside that window, outside the OLD
        # fixed 2h window) is now correctly excluded for the same priest.
        long_pooja_id, short_pooja_id = "p5", "p2"  # Navagraha Homam (3h), Ganapathi Homam (1.5h)
        priest = register_priest(session, [long_pooja_id, short_pooja_id])
        devotee = register_devotee(session)

        b1 = session.post(f"{API}/bookings", json={
            "pooja_id": long_pooja_id, "booking_date": TOMORROW, "booking_time": "08:00 AM",
            "sankalp_name": "Long", "gothram": "G", "place": "P",
        }, headers=auth_headers(devotee["access_token"]), timeout=10).json()
        accept1 = session.post(f"{API}/bookings/{b1['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept1.status_code == 200

        b2 = session.post(f"{API}/bookings", json={
            "pooja_id": short_pooja_id, "booking_date": TOMORROW, "booking_time": "10:15 AM",
            "sankalp_name": "Short", "gothram": "G", "place": "P",
        }, headers=auth_headers(devotee["access_token"]), timeout=10)
        if b2.status_code == 200:
            assert priest["user"]["id"] not in b2.json()["eligible_priest_ids"], \
                "priest is booked 08:00-11:00 for the long pooja; must not be eligible for a 10:15 slot"
        else:
            assert b2.status_code == 409  # only fails open if literally no other priest exists for p2 either


class TestDualRoleAccounts:
    def test_same_email_can_register_as_both_devotee_and_priest(self, session, poojas):
        pooja_id = next(iter(poojas))
        email = unique_email("dual")
        password = "password123"

        as_devotee = session.post(f"{API}/auth/register", json={
            "name": "Dual Person", "email": email, "mobile": "9222222222", "password": password,
        }, timeout=10)
        assert as_devotee.status_code == 200, as_devotee.text

        as_priest = session.post(f"{API}/auth/register-priest", json={
            "name": "Dual Person", "email": email, "mobile": "9222222222", "password": password,
            "address": "1 Test Rd", "latitude": 17.4, "longitude": 78.5, "services": [pooja_id],
        }, timeout=10)
        assert as_priest.status_code == 200, as_priest.text
        assert as_devotee.json()["user"]["id"] != as_priest.json()["user"]["id"], \
            "same email, but two distinct accounts (one per role)"

    def test_registering_the_same_role_twice_for_one_email_is_still_rejected(self, session):
        email = unique_email("dupdevotee")
        payload = {"name": "A", "email": email, "mobile": "9000000001", "password": "password123"}
        assert session.post(f"{API}/auth/register", json=payload, timeout=10).status_code == 200
        assert session.post(f"{API}/auth/register", json=payload, timeout=10).status_code == 400

    def test_login_is_scoped_to_the_selected_role_not_whichever_account_matches_email(self, session, poojas):
        # This is the exact bug report: register as devotee, then log in on
        # the Priest Login screen with those same credentials — it must NOT
        # silently authenticate the devotee account instead.
        pooja_id = next(iter(poojas))
        email = unique_email("scoped")
        password = "password123"
        session.post(f"{API}/auth/register", json={
            "name": "Scoped Person", "email": email, "mobile": "9333333333", "password": password,
        }, timeout=10)

        priest_login_attempt = session.post(f"{API}/auth/login", json={"email": email, "password": password, "role": "priest"}, timeout=10)
        assert priest_login_attempt.status_code == 401, "must not log into the devotee account under a priest login"

        devotee_login = session.post(f"{API}/auth/login", json={"email": email, "password": password, "role": "devotee"}, timeout=10)
        assert devotee_login.status_code == 200
        assert devotee_login.json()["user"]["role"] == "devotee"

        session.post(f"{API}/auth/register-priest", json={
            "name": "Scoped Person", "email": email, "mobile": "9333333333", "password": password,
            "address": "1 Test Rd", "latitude": 17.4, "longitude": 78.5, "services": [pooja_id],
        }, timeout=10)

        priest_login = session.post(f"{API}/auth/login", json={"email": email, "password": password, "role": "priest"}, timeout=10)
        assert priest_login.status_code == 200
        assert priest_login.json()["user"]["role"] == "priest"
        assert priest_login.json()["user"]["id"] != devotee_login.json()["user"]["id"]


class TestPriestBusyState:
    def test_priest_goes_busy_on_accept_and_free_again_on_complete(self, session, poojas):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        d1 = register_devotee(session)
        d2 = register_devotee(session)

        b1 = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "04:00 PM",
            "sankalp_name": "Busy1", "gothram": "G", "place": "P",
        }, headers=auth_headers(d1["access_token"]), timeout=10).json()
        assert priest["user"]["id"] in b1["eligible_priest_ids"]

        accept = session.post(f"{API}/bookings/{b1['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept.status_code == 200

        me = session.get(f"{API}/auth/me", headers=auth_headers(priest["access_token"]), timeout=10).json()
        assert me["busy"] is True

        # A second, non-conflicting booking (different time, same day) must
        # not offer this priest — they're busy until b1 is completed, even
        # though the time slots themselves don't overlap.
        b2 = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "07:00 PM",
            "sankalp_name": "Busy2", "gothram": "G", "place": "P",
        }, headers=auth_headers(d2["access_token"]), timeout=10)
        if b2.status_code == 200:
            assert priest["user"]["id"] not in b2.json()["eligible_priest_ids"]
        else:
            assert b2.status_code == 409  # only fails open if no other priest covers this pooja either

        complete = session.post(f"{API}/bookings/{b1['id']}/complete", headers=auth_headers(priest["access_token"]), timeout=10)
        assert complete.status_code == 200

        me_after = session.get(f"{API}/auth/me", headers=auth_headers(priest["access_token"]), timeout=10).json()
        assert me_after["busy"] is False

    def test_busy_priest_cannot_accept_a_second_already_offered_booking(self, session, poojas):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        devotee = register_devotee(session)

        # Both created while the priest is still free, so both list them
        # as eligible up front.
        b1 = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "05:00 PM",
            "sankalp_name": "First", "gothram": "G", "place": "P",
        }, headers=auth_headers(devotee["access_token"]), timeout=10).json()
        b2 = session.post(f"{API}/bookings", json={
            "pooja_id": pooja_id, "booking_date": TOMORROW, "booking_time": "11:00 AM",
            "sankalp_name": "Second", "gothram": "G", "place": "P",
        }, headers=auth_headers(devotee["access_token"]), timeout=10).json()
        assert priest["user"]["id"] in b1["eligible_priest_ids"]
        assert priest["user"]["id"] in b2["eligible_priest_ids"]

        accept1 = session.post(f"{API}/bookings/{b1['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept1.status_code == 200

        # b2 doesn't time-conflict with b1, but the priest is now busy —
        # must still be rejected.
        accept2 = session.post(f"{API}/bookings/{b2['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept2.status_code == 409


class TestRateLimiting:
    def test_login_rate_limit_kicks_in(self):
        email = unique_email("ratelimit")
        got_429 = any(
            requests.post(f"{API}/auth/login", json={"email": email, "password": "whatever", "role": "devotee"}, timeout=10).status_code == 429
            for _ in range(15)
        )
        assert got_429, "expected a 429 after enough rapid login attempts from one IP"

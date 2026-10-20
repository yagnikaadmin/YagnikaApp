"""Real-world scenario tests for the Yagnika booking backend.

Run against a live server pointed at a throwaway local MongoDB — never
point YAGNIKA_TEST_BASE_URL at a production database, since these tests
create real users, poojas, and bookings.

    uvicorn server:app --host 0.0.0.0 --port 8001   # in one terminal
    pytest tests/test_scenarios.py -v                # in another

Admin credentials are read from ADMIN_USERNAME / ADMIN_PASSWORD in the
environment, falling back to backend/.env (the same values the server
seeds the admin account from).
"""
import functools
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = os.environ.get("YAGNIKA_TEST_BASE_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()

_DOTENV = dotenv_values(Path(__file__).resolve().parent.parent / ".env")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME") or _DOTENV.get("ADMIN_USERNAME") or ""
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or _DOTENV.get("ADMIN_PASSWORD") or ""
# The seeded admin keeps this email for the (email, role) unique index.
ADMIN_EMAIL = "admin@yagnika.com"
DANA_CATEGORY = "Danas (Accepted Ritual Offerings)"
# Smallest valid Aadhaar-proof data URI (the server only checks the prefix and size).
AADHAAR_PROOF = "data:image/png;base64,iVBORw0KGgo="


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


@functools.lru_cache(maxsize=None)
def get_admin_token() -> str:
    # Cached: admin sign-in shares the login rate-limit bucket (10 per 5 min).
    assert ADMIN_USERNAME and ADMIN_PASSWORD, "set ADMIN_USERNAME / ADMIN_PASSWORD (env or backend/.env)"
    r = requests.post(f"{API}/admin/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    return get_admin_token()


@functools.lru_cache(maxsize=None)
def main_catalog_service() -> str:
    """A catalog service from a non-Dana category. Priest registration requires
    at least one, so every test priest offers it alongside the test's poojas."""
    rows = requests.get(f"{API}/poojas", timeout=10).json()
    for p in rows:
        if p.get("category") and p["category"] != DANA_CATEGORY:
            return p["id"]
    raise AssertionError("no main-category catalog service seeded")


def approve_priest(user_id: str, admin_token: str) -> None:
    regs = requests.get(f"{API}/admin/priest-registrations?status=pending",
                        headers=auth_headers(admin_token), timeout=10).json()
    reg = next(r for r in regs if r["user_id"] == user_id)
    r = requests.post(f"{API}/admin/priest-registrations/{reg['id']}/approve", json={"note": "test"},
                      headers=auth_headers(admin_token), timeout=10)
    assert r.status_code == 200, r.text


def register_devotee(session, name="Test Devotee"):
    r = session.post(f"{API}/auth/register", json={
        "name": name, "email": unique_email("devotee"), "mobile": "9000000000", "password": "password123",
    }, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


def priest_payload(email, services, name="Test Priest", mobile="9111111111", password="password123"):
    # Mirrors the mandatory fields of PriestRegister / register_priest in server.py.
    return {
        "name": name, "email": email, "mobile": mobile, "password": password,
        "address": "123 Test Street", "latitude": 17.4, "longitude": 78.5,
        "services": list(services) + [main_catalog_service()],
        "aadhaar_number": "123412341234", "aadhaar_proof": AADHAAR_PROOF, "aadhaar_proof_name": "aadhaar.png",
        "date_of_birth": "1980-01-15", "sampradaya": "Smarta", "agama": "Vaikhanasa",
        "years_of_experience": 10, "languages": ["Sanskrit", "Telugu"], "priest_type": "independent",
    }


def register_priest(session, services, name="Test Priest", approve=True):
    """Registers a priest and (by default) approves them via the admin API —
    new priests are inactive until approved."""
    r = session.post(f"{API}/auth/register-priest", json=priest_payload(unique_email("priest"), services, name=name), timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    if approve:
        approve_priest(data["user"]["id"], get_admin_token())
    return data


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

        as_priest = session.post(f"{API}/auth/register-priest", json=priest_payload(
            email, [pooja_id], name="Dual Person", mobile="9222222222", password=password,
        ), timeout=10)
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

        as_priest = session.post(f"{API}/auth/register-priest", json=priest_payload(
            email, [pooja_id], name="Scoped Person", mobile="9333333333", password=password,
        ), timeout=10)
        assert as_priest.status_code == 200, as_priest.text

        priest_login = session.post(f"{API}/auth/login", json={"email": email, "password": password, "role": "priest"}, timeout=10)
        assert priest_login.status_code == 200
        assert priest_login.json()["user"]["role"] == "priest"
        assert priest_login.json()["user"]["id"] != devotee_login.json()["user"]["id"]


@pytest.fixture(scope="session")
def devotee(session):
    # Shared by the tests below: registration is rate-limited (50/h per IP).
    return register_devotee(session)


def days_ahead(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def book(session, devotee, pooja_id, booking_date, booking_time):
    return session.post(f"{API}/bookings", json={
        "pooja_id": pooja_id, "booking_date": booking_date, "booking_time": booking_time,
        "sankalp_name": "X", "gothram": "G", "place": "P",
    }, headers=auth_headers(devotee["access_token"]), timeout=10)


def offered_to(priest, response) -> bool:
    """Whether a POST /bookings response offered the booking to `priest`.
    A 409 means no priest at all qualified — so not this one either."""
    if response.status_code == 409:
        return False
    assert response.status_code == 200, response.text
    return priest["user"]["id"] in response.json()["eligible_priest_ids"]


class TestPriestBusyState:
    # `busy` is recorded but no longer blocks: only a real time clash does.
    def test_busy_flag_tracks_accept_and_complete_but_does_not_block(self, session, poojas, devotee):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])

        b1 = book(session, devotee, pooja_id, TOMORROW, "04:00 PM")
        assert offered_to(priest, b1)
        accept = session.post(f"{API}/bookings/{b1.json()['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept.status_code == 200
        me = session.get(f"{API}/auth/me", headers=auth_headers(priest["access_token"]), timeout=10).json()
        assert me["busy"] is True

        # Non-overlapping times the same day, and another date, still reach them.
        assert offered_to(priest, book(session, devotee, pooja_id, TOMORROW, "08:00 AM"))
        assert offered_to(priest, book(session, devotee, pooja_id, days_ahead(2), "04:00 PM"))

        complete = session.post(f"{API}/bookings/{b1.json()['id']}/complete", headers=auth_headers(priest["access_token"]), timeout=10)
        assert complete.status_code == 200
        me_after = session.get(f"{API}/auth/me", headers=auth_headers(priest["access_token"]), timeout=10).json()
        assert me_after["busy"] is False

    def test_priest_can_accept_a_second_non_overlapping_booking(self, session, poojas, devotee):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        b1 = book(session, devotee, pooja_id, TOMORROW, "05:00 PM").json()
        b2 = book(session, devotee, pooja_id, days_ahead(2), "11:00 AM").json()

        accept1 = session.post(f"{API}/bookings/{b1['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept1.status_code == 200
        accept2 = session.post(f"{API}/bookings/{b2['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10)
        assert accept2.status_code == 200

    def test_overlapping_request_not_offered_but_other_dates_are(self, session, devotee):
        # Priest A holds 11 AM-2 PM (Navagraha Homam, 3h): a 10 AM-1 PM
        # request that day must not reach them; the next day, or 3 PM, does.
        priest = register_priest(session, ["p5"])
        day = days_ahead(3)
        b1 = book(session, devotee, "p5", day, "11:00 AM").json()
        assert session.post(f"{API}/bookings/{b1['id']}/accept", headers=auth_headers(priest["access_token"]), timeout=10).status_code == 200

        assert not offered_to(priest, book(session, devotee, "p5", day, "10:00 AM"))
        assert offered_to(priest, book(session, devotee, "p5", day, "03:00 PM"))
        assert offered_to(priest, book(session, devotee, "p5", days_ahead(4), "10:00 AM"))


class TestAvailabilityEligibility:
    def test_paused_in_person_priest_not_offered(self, session, poojas, devotee):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        r = session.patch(f"{API}/priest/availability", json={"offline_paused": True},
                          headers=auth_headers(priest["access_token"]), timeout=10)
        assert r.status_code == 200
        assert not offered_to(priest, book(session, devotee, pooja_id, TOMORROW, "09:00 AM"))

        session.patch(f"{API}/priest/availability", json={"offline_paused": False},
                      headers=auth_headers(priest["access_token"]), timeout=10)
        assert offered_to(priest, book(session, devotee, pooja_id, TOMORROW, "09:00 AM"))

    def test_weekly_off_day_and_unavailable_window(self, session, devotee):
        priest = register_priest(session, ["p2"])  # Ganapathi Homam, 1.5h
        off_day, part_day = days_ahead(5), days_ahead(6)
        key = lambda d: WEEKDAY_KEYS[date.fromisoformat(d).weekday()]
        h = auth_headers(priest["access_token"])
        assert session.put(f"{API}/priest/availability/weekly/{key(off_day)}", json={"mode": "both", "off": True},
                           headers=h, timeout=10).status_code == 200
        assert session.put(f"{API}/priest/availability/weekly/{key(part_day)}", json={
            "mode": "both", "unavailable": [{"start": "06:00 AM", "end": "09:00 AM"}],
        }, headers=h, timeout=10).status_code == 200

        assert not offered_to(priest, book(session, devotee, "p2", off_day, "10:00 AM"))
        assert not offered_to(priest, book(session, devotee, "p2", part_day, "08:00 AM"))
        assert offered_to(priest, book(session, devotee, "p2", part_day, "10:00 AM"))

    def test_date_override(self, session, devotee):
        priest = register_priest(session, ["p5"])  # Navagraha Homam, 3h
        closed, limited = days_ahead(7), days_ahead(8)
        h = auth_headers(priest["access_token"])
        assert session.put(f"{API}/priest/availability/overrides/{closed}", json={"available": False},
                           headers=h, timeout=10).status_code == 200
        assert session.put(f"{API}/priest/availability/overrides/{limited}", json={
            "available": True, "slots": [{"start": "10:00 AM", "end": "02:00 PM"}],
        }, headers=h, timeout=10).status_code == 200

        assert not offered_to(priest, book(session, devotee, "p5", closed, "10:00 AM"))
        assert offered_to(priest, book(session, devotee, "p5", limited, "10:30 AM"))       # 10:30-13:30 fits
        assert not offered_to(priest, book(session, devotee, "p5", limited, "11:30 AM"))   # runs to 14:30

    def test_pausing_after_booking_hides_it_and_blocks_accept(self, session, poojas, devotee):
        pooja_id = next(iter(poojas))
        priest = register_priest(session, [pooja_id])
        b = book(session, devotee, pooja_id, TOMORROW, "06:00 PM")
        assert offered_to(priest, b)
        h = auth_headers(priest["access_token"])
        session.patch(f"{API}/priest/availability", json={"offline_paused": True}, headers=h, timeout=10)

        inbox = session.get(f"{API}/bookings/priest/inbox", headers=h, timeout=10).json()
        assert b.json()["id"] not in [x["id"] for x in inbox]
        assert session.post(f"{API}/bookings/{b.json()['id']}/accept", headers=h, timeout=10).status_code == 409

    def test_buffer_extends_accepted_booking(self, session, devotee):
        priest = register_priest(session, ["p2"])  # Ganapathi Homam, 1.5h
        day = days_ahead(9)
        h = auth_headers(priest["access_token"])
        # Saving any weekday carries buffer_minutes; use a different weekday than `day`.
        other = WEEKDAY_KEYS[(date.fromisoformat(day).weekday() + 1) % 7]
        assert session.put(f"{API}/priest/availability/weekly/{other}", json={"mode": "both", "buffer_minutes": 30},
                           headers=h, timeout=10).status_code == 200

        b1 = book(session, devotee, "p2", day, "08:00 AM").json()   # 08:00-09:30
        assert session.post(f"{API}/bookings/{b1['id']}/accept", headers=h, timeout=10).status_code == 200
        assert not offered_to(priest, book(session, devotee, "p2", day, "09:45 AM"))
        assert offered_to(priest, book(session, devotee, "p2", day, "10:00 AM"))


class TestPriestApproval:
    def test_new_priest_is_pending_until_approved(self, session, admin_token):
        priest = register_priest(session, [], approve=False)
        assert priest["user"]["approval_status"] == "pending"
        token = priest["access_token"]

        # The token works for the pending screen only; gated endpoints reject it.
        reg = session.get(f"{API}/priest/my-registration", headers=auth_headers(token), timeout=10)
        assert reg.status_code == 200
        assert reg.json()["stage"] == "submitted"
        assert session.get(f"{API}/bookings/priest/inbox", headers=auth_headers(token), timeout=10).status_code == 401

        # Login while pending still succeeds (so the app can show the pending screen).
        login = session.post(f"{API}/auth/login", json={"email": priest["user"]["email"], "password": "password123", "role": "priest"}, timeout=10)
        assert login.status_code == 200
        assert login.json()["user"]["approval_status"] == "pending"

        approve_priest(priest["user"]["id"], admin_token)
        assert session.get(f"{API}/bookings/priest/inbox", headers=auth_headers(token), timeout=10).status_code == 200
        assert session.get(f"{API}/priest/my-registration", headers=auth_headers(token), timeout=10).json()["stage"] == "approved"

    def test_rejected_priest_cannot_log_in(self, session, admin_token):
        priest = register_priest(session, [], approve=False)
        regs = session.get(f"{API}/admin/priest-registrations?status=pending", headers=auth_headers(admin_token), timeout=10).json()
        reg = next(r for r in regs if r["user_id"] == priest["user"]["id"])
        r = session.post(f"{API}/admin/priest-registrations/{reg['id']}/reject", json={"note": "test"},
                         headers=auth_headers(admin_token), timeout=10)
        assert r.status_code == 200
        login = session.post(f"{API}/auth/login", json={"email": priest["user"]["email"], "password": "password123", "role": "priest"}, timeout=10)
        assert login.status_code == 403

    def test_dana_only_registration_rejected(self, session):
        rows = session.get(f"{API}/poojas", timeout=10).json()
        dana = next(p["id"] for p in rows if p.get("category") == DANA_CATEGORY)
        payload = priest_payload(unique_email("dana"), [])
        payload["services"] = [dana]
        r = session.post(f"{API}/auth/register-priest", json=payload, timeout=10)
        assert r.status_code == 400


class TestRateLimiting:
    def test_login_rate_limit_kicks_in(self):
        email = unique_email("ratelimit")
        got_429 = any(
            requests.post(f"{API}/auth/login", json={"email": email, "password": "whatever", "role": "devotee"}, timeout=10).status_code == 429
            for _ in range(15)
        )
        assert got_429, "expected a 429 after enough rapid login attempts from one IP"

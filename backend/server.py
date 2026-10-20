from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError, OperationFailure, CollectionInvalid
import os
import logging
import uuid
import secrets
import re
from collections import defaultdict
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Literal, Optional
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# "production" (the default) is the secure posture: no insecure fallbacks, no
# reset tokens echoed back over the API. Set ENVIRONMENT=development locally
# to get developer-convenience behavior (see forgot_password below).
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'production').lower()

# No insecure default — an unset secret fails startup loudly instead of
# silently signing tokens (including admin tokens) with a secret that's
# sitting in plain sight in this source file.
JWT_SECRET_KEY = os.environ['JWT_SECRET_KEY']
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
RESET_TOKEN_TTL_MINUTES = 30

# Configurable so a real deployment can lock this down to its actual
# frontend origin(s) without a code change — set CORS_ORIGINS to a
# comma-separated list. Defaults to "*" (matches prior behavior) with a
# loud startup warning so it isn't silently left open.
_cors_origins_env = os.environ.get('CORS_ORIGINS', '').strip()
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(',') if o.strip()] or ["*"]
if CORS_ORIGINS == ["*"]:
    logger.warning("CORS_ORIGINS not set — allowing all origins. Set CORS_ORIGINS before real production traffic.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

app = FastAPI()
api_router = APIRouter(prefix="/api")

Role = Literal["devotee", "priest", "admin"]
BookingStatus = Literal[
    "Pending Priest Assignment",
    "Priest Assigned",
    "Completed",
    "Cancelled",
]


# ============ Models ============
class UserPublic(BaseModel):
    id: str
    name: str
    email: EmailStr
    mobile: str
    role: Role
    address: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    services: Optional[List[str]] = []
    is_active: bool = True
    title: Optional[Literal["mr", "mrs"]] = None
    photo_url: Optional[str] = None
    # Devotee-facing profile field (also captured per-booking as `gothram`).
    gothram: Optional[str] = None
    # Priest-only: pending | approved | rejected (None for legacy/devotee).
    approval_status: Optional[str] = None
    # Priest-only: true while they have a "Priest Assigned" booking that
    # hasn't been marked Completed yet (see accept_booking / complete_booking).
    # Informational only: it no longer blocks new bookings — eligibility uses
    # time overlap and the priest's availability instead. Distinct from
    # is_active, which gates login.
    busy: bool = False


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class DevoteeRegister(BaseModel):
    name: str
    email: EmailStr
    mobile: str
    password: str = Field(min_length=6)
    title: Optional[Literal["mr", "mrs"]] = None


# Data-URI photo payload cap: ~1.5MB of base64, comfortably above a
# 400x400 JPEG at quality 0.6 (typically tens of KB) with headroom, while
# still bounding request size against abuse. (Defined here too because the
# priest photo field below is declared before ProfileUpdate.)
MAX_PHOTO_DATA_URI_LEN = 1_500_000
# Aadhaar proof: 2 MB binary ~= 2.67 MB of base64; allow headroom for the
# data-URI prefix and whitespace.
MAX_AADHAAR_PROOF_LEN = 2_900_000
# Uploaded documents (Aadhaar proof, Agama certificate): JPEG / PNG / PDF data URIs.
PROOF_PREFIXES = ("data:image/jpeg", "data:image/jpg", "data:image/png", "data:application/pdf")


class PriestRegister(BaseModel):
    # --- Account (needed for login; email doubles as the optional contact
    #     email from the spec) ---
    email: EmailStr
    password: str = Field(min_length=6)

    # --- A. Personal Information (mandatory) ---
    name: str
    photo_url: Optional[str] = Field(default=None, max_length=MAX_PHOTO_DATA_URI_LEN)
    aadhaar_number: str
    aadhaar_proof: str = Field(max_length=MAX_AADHAAR_PROOF_LEN)  # data URI (JPEG/PNG/PDF)
    aadhaar_proof_name: Optional[str] = ""
    mobile: str
    address: str
    date_of_birth: str  # YYYY-MM-DD
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # --- B. Religious Lineage & Vedic Details (mandatory; abhivadanam optional) ---
    sampradaya: str
    agama: str
    # Vedic details are no longer collected at registration (kept optional for
    # older clients and existing records).
    veda: Optional[str] = ""
    sutra: Optional[str] = ""
    gotra: Optional[str] = ""
    pravara: Optional[str] = ""
    abhivadanam: Optional[str] = ""

    # --- C. Professional Details (mandatory) ---
    years_of_experience: int = Field(ge=0)
    languages: List[str] = Field(min_length=1)
    priest_type: Literal["independent", "temple"]
    temple_name: Optional[str] = ""
    temple_address: Optional[str] = ""
    temple_deity: Optional[str] = ""
    temple_designation: Optional[str] = ""

    # --- D. Service Categories (mandatory) — list of poojas.id values ---
    services: List[str] = Field(min_length=1)

    # --- Optional Information ---
    alt_mobile: Optional[str] = ""
    optional_email: Optional[str] = ""
    certifications: Optional[str] = ""
    agama_certification: Optional[str] = ""
    agama_certificate: Optional[str] = Field(default=None, max_length=MAX_AADHAAR_PROOF_LEN)  # data URI (JPEG/PNG/PDF)
    agama_certificate_name: Optional[str] = ""
    veda_patashala: Optional[str] = ""
    guru_name: Optional[str] = ""
    awards: Optional[str] = ""
    years_temple_service: Optional[int] = None
    availability: Optional[str] = ""
    travel_availability: Optional[bool] = None
    online_consultation: Optional[bool] = None


class ProfileUpdate(BaseModel):
    # Personal
    name: Optional[str] = None
    title: Optional[Literal["mr", "mrs"]] = None
    photo_url: Optional[str] = Field(default=None, max_length=MAX_PHOTO_DATA_URI_LEN)
    # Devotee profile field (gothram / gotra).
    gothram: Optional[str] = None
    # Contact information
    email: Optional[EmailStr] = None
    mobile: Optional[str] = None
    alt_mobile: Optional[str] = None
    optional_email: Optional[str] = None
    # Address
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Temple assignment / details
    priest_type: Optional[Literal["independent", "temple"]] = None
    temple_name: Optional[str] = None
    temple_address: Optional[str] = None
    temple_deity: Optional[str] = None
    temple_designation: Optional[str] = None
    # Service categories (list of poojas.id)
    services: Optional[List[str]] = None
    # Experience
    years_of_experience: Optional[int] = Field(default=None, ge=0)
    years_temple_service: Optional[int] = Field(default=None, ge=0)
    # Languages
    languages: Optional[List[str]] = None
    # Availability
    availability: Optional[str] = None
    travel_availability: Optional[bool] = None
    online_consultation: Optional[bool] = None
    # Working status
    working_status: Optional[Literal["available", "on_leave", "not_available"]] = None
    # Certifications
    certifications: Optional[str] = None
    agama_certification: Optional[str] = None
    veda_patashala: Optional[str] = None
    guru_name: Optional[str] = None
    awards: Optional[str] = None
    # Priest registration fields — the priest Edit Profile screen is the
    # registration form in edit mode, so every registration field is editable
    # with the same validation (see update_me).
    aadhaar_number: Optional[str] = None
    aadhaar_proof: Optional[str] = Field(default=None, max_length=MAX_AADHAAR_PROOF_LEN)
    aadhaar_proof_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    sampradaya: Optional[str] = None
    agama: Optional[str] = None
    agama_certificate: Optional[str] = Field(default=None, max_length=MAX_AADHAAR_PROOF_LEN)  # "" removes it
    agama_certificate_name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)  # new password; omit to keep


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    # Required: the same email can now hold a separate devotee account and
    # a separate priest account (see the (email, role) unique index below).
    # Without this, login-by-email-alone would be ambiguous and could sign
    # someone into the wrong one of their two accounts.
    role: Role


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    role: Role


class ForgotPasswordResponse(BaseModel):
    message: str
    # Only ever populated when ENVIRONMENT != production (local/dev testing
    # convenience, since no email/SMS provider is wired up yet). A real
    # deployment must never return this — anyone who knew a user's email
    # could otherwise request a token and take over that account without
    # ever touching their inbox.
    reset_token: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=6)


class Pooja(BaseModel):
    id: str
    name: str
    sanskrit_name: str = ""
    description: str = ""
    duration: str = ""
    # Parsed from `duration` on the way out (see pooja_out) so the apps have a
    # reliable number for slot / end-time math without re-implementing the
    # free-text parser. Falls back to SLOT_MINUTES for blank/unparseable.
    duration_minutes: int = 0
    price: int = 0
    is_active: bool = True
    # Service catalog grouping (present on the seeded priest-service
    # catalog; absent/None on the original demo poojas p1..p10).
    category: Optional[str] = None
    subcategory: Optional[str] = None


class PoojaCreate(BaseModel):
    name: str
    sanskrit_name: str = ""
    description: str = ""
    duration: str = "1 hour"
    price: int = 0


class PoojaUpdate(BaseModel):
    name: Optional[str] = None
    sanskrit_name: Optional[str] = None
    description: Optional[str] = None
    duration: Optional[str] = None
    price: Optional[int] = None
    is_active: Optional[bool] = None


class BookingCreate(BaseModel):
    pooja_id: str
    booking_date: str  # YYYY-MM-DD
    booking_time: str  # e.g. "08:00 AM"
    sankalp_name: str
    gothram: str
    place: str
    notes: Optional[str] = ""
    # Devotee contact for this booking — pre-filled from the profile in the
    # app but editable per booking; blank/absent falls back to the account's
    # mobile. `latitude`/`longitude` are the venue pin from the map picker.
    contact_mobile: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class Booking(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_mobile: str
    pooja_id: str
    pooja_name: str
    booking_date: str
    booking_time: str
    sankalp_name: str
    gothram: str
    place: str
    notes: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: BookingStatus
    priest_id: Optional[str] = None
    priest_name: Optional[str] = None
    priest_mobile: Optional[str] = None
    rejected_by: List[str] = []
    eligible_priest_ids: List[str] = []
    duration_minutes: Optional[int] = None  # absent on bookings created before this field existed
    created_date: str


class ActiveToggle(BaseModel):
    is_active: bool


# ============ Rate limiting ============
# Minimal in-memory sliding-window limiter, keyed by client IP + bucket name.
# Deliberately dependency-free: fine for a single-process deployment,
# but state is per-process and resets on restart — a multi-instance
# deployment would need a shared store (e.g. Redis) instead.
_rate_limit_buckets: dict[str, list[float]] = defaultdict(list)


async def _check_rate_limit(request: Request, bucket: str, limit: int, window_seconds: int) -> None:
    client_ip = request.client.host if request.client else "unknown"
    key = f"{bucket}:{client_ip}"
    now = datetime.now(timezone.utc).timestamp()
    timestamps = _rate_limit_buckets[key]
    cutoff = now - window_seconds
    while timestamps and timestamps[0] < cutoff:
        timestamps.pop(0)
    if len(timestamps) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    timestamps.append(now)


# ============ Helpers ============
def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    return pwd_context.verify(pw, hashed)


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "role": role, "exp": expire}, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def user_doc_to_public(doc: dict) -> UserPublic:
    return UserPublic(
        id=doc["id"],
        name=doc.get("name", ""),
        email=doc["email"],
        mobile=doc.get("mobile", ""),
        role=doc.get("role", "devotee"),
        address=doc.get("address", ""),
        latitude=doc.get("latitude"),
        longitude=doc.get("longitude"),
        services=doc.get("services", []),
        is_active=doc.get("is_active", True),
        title=doc.get("title"),
        photo_url=doc.get("photo_url"),
        gothram=doc.get("gothram"),
        approval_status=doc.get("approval_status"),
        busy=doc.get("busy", False),
    )


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserPublic:
    exc = HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account not active" if user else "User not found")
    return user_doc_to_public(user)


async def require_admin(current: UserPublic = Depends(get_current_user)) -> UserPublic:
    if current.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current


async def get_current_user_any(token: str = Depends(oauth2_scheme)) -> dict:
    """Like get_current_user but does NOT reject an inactive account. Used by
    the priest "pending" screen so a not-yet-approved priest can still poll
    their own registration status. Every other endpoint keeps using
    get_current_user, which stays locked to active accounts only."""
    exc = HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# Fallback duration for bookings that predate the duration_minutes field
# (legacy documents) or whose pooja's duration string couldn't be parsed.
SLOT_MINUTES = 120


def parse_time_to_minutes(t: str) -> int:
    """Parses a time string like '08:00 AM' or '14:30' into minutes from
    midnight. Raises ValueError on anything unrecognized — silently treating
    a malformed time as midnight (the old behavior) could make two bookings
    look non-conflicting when they actually overlap."""
    s = t.strip().upper()
    for fmt in ("%I:%M %p", "%H:%M"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.hour * 60 + dt.minute
        except ValueError:
            continue
    raise ValueError(f"Unrecognized time format: {t!r}")


def parse_duration_to_minutes(duration: str) -> int:
    """Parses pooja duration strings like '2 hours', '1.5 hours', '30 mins',
    '1 hour' into minutes. Falls back to SLOT_MINUTES if unparseable."""
    m = re.search(r'(\d+(?:\.\d+)?)\s*(hour|hr|min)', duration.strip().lower())
    if not m:
        return SLOT_MINUTES
    value = float(m.group(1))
    unit = m.group(2)
    return int(round(value * (60 if unit in ("hour", "hr") else 1)))


def pooja_out(row: dict) -> "Pooja":
    """Serialize a pooja doc for the API, injecting the parsed duration_minutes."""
    return Pooja(**{**row, "duration_minutes": parse_duration_to_minutes(row.get("duration") or "")})


def intervals_overlap(start_a: int, dur_a: int, start_b: int, dur_b: int) -> bool:
    return start_a < start_b + dur_b and start_b < start_a + dur_a


async def priest_has_conflict(priest_id: str, date: str, time_str: str, duration_minutes: int,
                              buffer_minutes: int = 0) -> bool:
    """True if [time_str, +duration) overlaps one of the priest's accepted or
    completed bookings that date, each widened by buffer_minutes on both sides."""
    start = parse_time_to_minutes(time_str)
    accepted = await db.bookings.find({
        "priest_id": priest_id,
        "booking_date": date,
        "status": {"$in": ["Priest Assigned", "Completed"]},
    }, {"_id": 0, "booking_time": 1, "duration_minutes": 1}).to_list(1000)
    for b in accepted:
        other_start = parse_time_to_minutes(b["booking_time"]) - buffer_minutes
        other_dur = (b.get("duration_minutes") or SLOT_MINUTES) + 2 * buffer_minutes
        if intervals_overlap(start, duration_minutes, other_start, other_dur):
            return True
    return False


def _buffer_of(priest_doc: dict) -> int:
    try:
        return max(0, int((priest_doc.get("availability") or {}).get("buffer_minutes") or 0))
    except (TypeError, ValueError):
        return 0


async def priest_can_take(priest_doc: dict, override: Optional[dict], date: str, time_str: str,
                          duration_minutes: int) -> bool:
    """Eligibility for one priest and slot: their own availability settings
    allow it and it doesn't clash (± their buffer) with a booking they hold.
    The `busy` flag is deliberately NOT consulted — overlap covers real clashes."""
    if not _fits_availability(priest_doc, override, date, parse_time_to_minutes(time_str), duration_minutes):
        return False
    return not await priest_has_conflict(priest_doc["id"], date, time_str, duration_minutes, _buffer_of(priest_doc))


async def find_eligible_priests(pooja_id: str, date: str, time_str: str, duration_minutes: int) -> List[dict]:
    priests = await db.users.find({
        "role": "priest",
        "is_active": True,
        "services": pooja_id,
    }, {"_id": 0, "hashed_password": 0}).to_list(1000)
    overrides = {o["priest_id"]: o for o in await db.availability_overrides.find(
        {"priest_id": {"$in": [p["id"] for p in priests]}, "date": date}, {"_id": 0}).to_list(1000)}
    eligible = []
    for p in priests:
        if await priest_can_take(p, overrides.get(p["id"]), date, time_str, duration_minutes):
            eligible.append(p)
    return eligible


# ============ Auth ============
@api_router.post("/auth/register", response_model=Token)
async def register_devotee(payload: DevoteeRegister, request: Request):
    await _check_rate_limit(request, "register", limit=50, window_seconds=3600)
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "name": payload.name,
        "email": payload.email,
        "mobile": payload.mobile,
        "role": "devotee",
        "is_active": True,
        "title": payload.title,
        "hashed_password": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="A devotee account with this email already exists.")
    user_pub = UserPublic(id=uid, name=payload.name, email=payload.email, mobile=payload.mobile, role="devotee", is_active=True, title=payload.title)
    return Token(access_token=create_access_token(uid, "devotee"), user=user_pub)


AADHAAR_RE = re.compile(r"\D")

# Indian mobile: 10 digits starting 6-9, optionally prefixed with +91 / 91 / 0.
# Spaces and dashes are ignored. Mirrors frontend src/utils/validation.ts.
MOBILE_RE = re.compile(r"^(?:\+91|91|0)?[6-9]\d{9}$")
# name@domain.tld — a period and a 2+ letter top-level domain are required.
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")
INVALID_MOBILE_DETAIL = "Enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9)."


def is_valid_mobile(value: str) -> bool:
    return bool(MOBILE_RE.match(re.sub(r"[\s-]", "", value or "")))


def is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match((value or "").strip()))

# Danas can't be offered on their own: a priest must also select at least one
# service from another category (mirrors frontend src/i18n/catalog.ts).
DANA_CATEGORY = "Danas (Accepted Ritual Offerings)"
DANA_ONLY_DETAIL = "Danas can only be selected together with at least one service from another category."


@api_router.post("/auth/register-priest", response_model=Token)
async def register_priest(payload: PriestRegister, request: Request):
    await _check_rate_limit(request, "register", limit=50, window_seconds=3600)

    # --- Mandatory field checks (beyond the type-level ones in the model) ---
    mandatory_text = {
        "name": payload.name, "address": payload.address,
        "sampradaya": payload.sampradaya, "agama": payload.agama,
    }
    missing = [k for k, v in mandatory_text.items() if not (v or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")

    aadhaar = AADHAAR_RE.sub("", payload.aadhaar_number or "")
    if len(aadhaar) != 12:
        raise HTTPException(status_code=400, detail="Aadhaar Number must be 12 digits")

    if not is_valid_mobile(payload.mobile):
        raise HTTPException(status_code=400, detail=INVALID_MOBILE_DETAIL)
    if (payload.alt_mobile or "").strip() and not is_valid_mobile(payload.alt_mobile):
        raise HTTPException(status_code=400, detail="Alternative mobile: " + INVALID_MOBILE_DETAIL)
    if not is_valid_email(payload.email):
        raise HTTPException(status_code=400, detail="Enter a valid email address, e.g. name@gmail.com.")
    if (payload.optional_email or "").strip() and not is_valid_email(payload.optional_email):
        raise HTTPException(status_code=400, detail="Alternate email: enter a valid email address, e.g. name@gmail.com.")

    proof = (payload.aadhaar_proof or "").strip()
    if not proof.startswith(PROOF_PREFIXES):
        raise HTTPException(status_code=400, detail="Aadhaar ID Proof must be a JPEG, PNG or PDF file.")
    if len(proof) > MAX_AADHAAR_PROOF_LEN:
        raise HTTPException(status_code=400, detail="Aadhaar ID Proof exceeds the 2 MB limit.")

    agama_cert = (payload.agama_certificate or "").strip()
    if agama_cert and not agama_cert.startswith(PROOF_PREFIXES):
        raise HTTPException(status_code=400, detail="Agama certificate must be a JPEG, PNG or PDF file.")
    if len(agama_cert) > MAX_AADHAAR_PROOF_LEN:
        raise HTTPException(status_code=400, detail="Agama certificate exceeds the 2 MB limit.")

    try:
        dob = datetime.strptime(payload.date_of_birth.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date of Birth must be in YYYY-MM-DD format")
    if dob >= datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Date of Birth must be in the past")

    if payload.priest_type == "temple" and not (payload.temple_name or "").strip():
        raise HTTPException(status_code=400, detail="Temple Name is required for a Temple Priest")

    # Validate the selected services against the live catalog and make sure
    # at least one main category is covered.
    rows = await db.poojas.find(
        {"id": {"$in": payload.services}, "is_active": True}, {"_id": 0, "id": 1, "category": 1}).to_list(5000)
    valid_ids = {r["id"] for r in rows}
    services = [s for s in payload.services if s in valid_ids]
    categories = {r.get("category") for r in rows if r.get("category")}
    if not services or not categories:
        raise HTTPException(status_code=400, detail="Select at least one service from a main category.")
    if not categories - {DANA_CATEGORY}:
        raise HTTPException(status_code=400, detail=DANA_ONLY_DETAIL)

    uid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Full profile — schemaless, so the whole registration payload is kept
    # on the users doc as well as the dedicated collection below.
    profile = {
        "photo_url": payload.photo_url,
        "aadhaar_number": aadhaar,
        "aadhaar_proof": proof,
        "aadhaar_proof_name": (payload.aadhaar_proof_name or "").strip(),
        "date_of_birth": payload.date_of_birth.strip(),
        "sampradaya": payload.sampradaya.strip(),
        "agama": payload.agama.strip(),
        "veda": (payload.veda or "").strip(),
        "sutra": (payload.sutra or "").strip(),
        "gotra": (payload.gotra or "").strip(),
        "pravara": (payload.pravara or "").strip(),
        "abhivadanam": (payload.abhivadanam or "").strip(),
        "years_of_experience": payload.years_of_experience,
        "languages": payload.languages,
        "priest_type": payload.priest_type,
        "temple_name": (payload.temple_name or "").strip(),
        "temple_address": (payload.temple_address or "").strip(),
        "temple_deity": (payload.temple_deity or "").strip(),
        "temple_designation": (payload.temple_designation or "").strip(),
        "alt_mobile": (payload.alt_mobile or "").strip(),
        "optional_email": (payload.optional_email or "").strip(),
        "certifications": (payload.certifications or "").strip(),
        "agama_certification": (payload.agama_certification or "").strip(),
        "agama_certificate": agama_cert or None,
        "agama_certificate_name": (payload.agama_certificate_name or "").strip() if agama_cert else "",
        "veda_patashala": (payload.veda_patashala or "").strip(),
        "guru_name": (payload.guru_name or "").strip(),
        "awards": (payload.awards or "").strip(),
        "years_temple_service": payload.years_temple_service,
        "availability": (payload.availability or "").strip(),
        "travel_availability": payload.travel_availability,
        "online_consultation": payload.online_consultation,
    }

    doc = {
        "id": uid,
        "name": payload.name.strip(),
        "email": payload.email,
        "mobile": payload.mobile.strip(),
        "role": "priest",
        "address": payload.address.strip(),
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "services": services,
        # New priests are inactive until an admin approves the registration
        # (login stays blocked with a "pending approval" message meanwhile).
        "is_active": False,
        "approval_status": "pending",
        "hashed_password": hash_password(payload.password),
        "created_at": now_iso,
        **profile,
    }
    try:
        await db.users.insert_one(dict(doc))
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="A priest account with this email already exists.")

    # Mirror every successful priest signup into a dedicated collection so
    # priest registrations can be viewed on their own (in Compass or via
    # /api/admin/priest-registrations) without filtering the shared users
    # collection. This is the record/audit table — the users doc above
    # stays the source of truth for auth and eligibility.
    reg_doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "name": payload.name.strip(),
        "email": payload.email,
        "mobile": payload.mobile.strip(),
        "address": payload.address.strip(),
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "services": services,
        "status": "pending",           # pending | approved | rejected
        "stage": "submitted",          # submitted -> interview -> approved | rejected
        "registered_at": now_iso,
        "reviewed_at": None,
        "review_note": "",
        **profile,
    }
    await db.priest_registration.insert_one(dict(reg_doc))

    user_pub = UserPublic(id=uid, name=payload.name.strip(), email=payload.email, mobile=payload.mobile.strip(), role="priest",
                          address=payload.address.strip(), latitude=payload.latitude, longitude=payload.longitude,
                          services=services, is_active=False, approval_status="pending", photo_url=payload.photo_url)
    # Token is still issued (so the app can show a "pending" screen), but the
    # account can't be used until approved.
    return Token(access_token=create_access_token(uid, "priest"), user=user_pub)


@api_router.post("/auth/login", response_model=Token)
async def login(payload: UserLogin, request: Request):
    await _check_rate_limit(request, "login", limit=10, window_seconds=300)
    # Scoped to (email, role): the same email can hold a separate devotee
    # account and a separate priest account, so email alone is ambiguous.
    user = await db.users.find_one({"email": payload.email, "role": payload.role})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", True):
        if user.get("approval_status") == "pending":
            # Still issue a token so the app can show the 3-step "pending"
            # screen and poll registration status. Every gated endpoint
            # continues to reject the inactive account.
            user_pub = user_doc_to_public(user)
            return Token(access_token=create_access_token(user["id"], user["role"]), user=user_pub)
        if user.get("approval_status") == "rejected":
            raise HTTPException(status_code=403, detail="Your registration was not approved. Please contact the admin.")
        raise HTTPException(status_code=403, detail="Account is deactivated. Please contact admin.")
    user_pub = user_doc_to_public(user)
    return Token(access_token=create_access_token(user["id"], user["role"]), user=user_pub)


class AdminLogin(BaseModel):
    username: str
    password: str


@api_router.post("/admin/login", response_model=Token)
async def admin_login(payload: AdminLogin, request: Request):
    """Admin signs in with a username (not an email) — kept separate from the
    devotee/priest email+role login above."""
    await _check_rate_limit(request, "login", limit=10, window_seconds=300)
    user = await db.users.find_one({"role": "admin", "username": payload.username})
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return Token(access_token=create_access_token(user["id"], "admin"), user=user_doc_to_public(user))


@api_router.get("/auth/me", response_model=UserPublic)
async def me(current: UserPublic = Depends(get_current_user)):
    return current


@api_router.get("/auth/me/full")
async def me_full(current: UserPublic = Depends(get_current_user)):
    """Complete stored profile (all fields), for pre-filling the edit form."""
    doc = await db.users.find_one({"id": current.id}, {"_id": 0, "hashed_password": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return doc


@api_router.patch("/auth/me", response_model=UserPublic)
async def update_me(payload: ProfileUpdate, current: UserPublic = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

    if "mobile" in updates and not is_valid_mobile(updates["mobile"]):
        raise HTTPException(status_code=400, detail=INVALID_MOBILE_DETAIL)
    if (updates.get("alt_mobile") or "").strip() and not is_valid_mobile(updates["alt_mobile"]):
        raise HTTPException(status_code=400, detail="Alternative mobile: " + INVALID_MOBILE_DETAIL)
    if "email" in updates and not is_valid_email(str(updates["email"])):
        raise HTTPException(status_code=400, detail="Enter a valid email address, e.g. name@gmail.com.")
    if (updates.get("optional_email") or "").strip() and not is_valid_email(updates["optional_email"]):
        raise HTTPException(status_code=400, detail="Alternate email: enter a valid email address, e.g. name@gmail.com.")

    # Priest registration fields: same rules as register_priest.
    for key, label in (("name", "Full Name"), ("address", "Residential Address"), ("sampradaya", "Sampradaya"), ("agama", "Agama")):
        if key in updates and not str(updates[key]).strip():
            raise HTTPException(status_code=400, detail=f"{label} cannot be empty")
    if "aadhaar_number" in updates:
        aadhaar = AADHAAR_RE.sub("", updates["aadhaar_number"] or "")
        if len(aadhaar) != 12:
            raise HTTPException(status_code=400, detail="Aadhaar Number must be 12 digits")
        updates["aadhaar_number"] = aadhaar
    if "aadhaar_proof" in updates and not updates["aadhaar_proof"].strip().startswith(PROOF_PREFIXES):
        raise HTTPException(status_code=400, detail="Aadhaar ID Proof must be a JPEG, PNG or PDF file.")
    if "agama_certificate" in updates:
        if not updates["agama_certificate"].strip():
            updates["agama_certificate"], updates["agama_certificate_name"] = None, ""
        elif not updates["agama_certificate"].strip().startswith(PROOF_PREFIXES):
            raise HTTPException(status_code=400, detail="Agama certificate must be a JPEG, PNG or PDF file.")
    if "date_of_birth" in updates:
        try:
            dob = datetime.strptime(updates["date_of_birth"].strip(), "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Date of Birth must be in YYYY-MM-DD format")
        if dob >= datetime.now(timezone.utc).date():
            raise HTTPException(status_code=400, detail="Date of Birth must be in the past")
    if updates.get("priest_type") == "temple" and "temple_name" in updates and not updates["temple_name"].strip():
        raise HTTPException(status_code=400, detail="Temple Name is required for a Temple Priest")
    # A new password is stored hashed on the account only — never copied into
    # the priest_registration record below.
    new_password = updates.pop("password", None)

    # Email doubles as the login identifier (scoped to (email, role)), so a
    # change has to stay unique for this role and is normalised the same way
    # registration/login normalise it (lower-cased) before any comparison.
    if "email" in updates:
        new_email = str(updates["email"]).strip().lower()
        updates["email"] = new_email
        if new_email != (current.email or "").lower():
            clash = await db.users.find_one(
                {"email": new_email, "role": current.role, "id": {"$ne": current.id}},
                {"_id": 0, "id": 1},
            )
            if clash:
                raise HTTPException(status_code=409, detail="An account with this email already exists.")

    # Validate service-category changes against the live catalog.
    if "services" in updates:
        svc = updates["services"] or []
        rows = await db.poojas.find(
            {"id": {"$in": svc}, "is_active": True}, {"_id": 0, "id": 1, "category": 1}).to_list(5000)
        valid = {r["id"] for r in rows}
        updates["services"] = [s for s in svc if s in valid]
        categories = {r.get("category") for r in rows if r.get("category")}
        if not updates["services"] or not categories:
            raise HTTPException(status_code=400, detail="Select at least one service from a main category.")
        if not categories - {DANA_CATEGORY}:
            raise HTTPException(status_code=400, detail=DANA_ONLY_DETAIL)

    for k, v in list(updates.items()):
        if isinstance(v, str):
            updates[k] = v.strip()

    if updates or new_password:
        account = dict(updates)
        if new_password:
            account["hashed_password"] = hash_password(new_password)
        try:
            await db.users.update_one({"id": current.id}, {"$set": account})
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        # Keep the dedicated priest_registration record in sync (no password).
        if updates:
            await db.priest_registration.update_one({"user_id": current.id}, {"$set": updates})

    user = await db.users.find_one({"id": current.id}, {"_id": 0, "hashed_password": 0})
    return user_doc_to_public(user)


@api_router.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    await _check_rate_limit(request, "forgot-password", limit=5, window_seconds=3600)
    generic_message = "If an account with that email exists, a password reset link has been sent."
    # Scoped to (email, role) for the same reason as login — with dual
    # devotee/priest accounts on one email, resetting by email alone could
    # silently reset the wrong account's password.
    user = await db.users.find_one({"email": payload.email, "role": payload.role})
    # Identical response whether the account doesn't exist or is an admin —
    # never confirm/deny account existence or role over this endpoint.
    if not user or user.get("role") == "admin":
        return ForgotPasswordResponse(message=generic_message)

    token = secrets.token_urlsafe(24)
    await db.password_resets.insert_one({
        "token": token,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False,
    })
    # A real deployment must email/SMS this token to the account owner —
    # never return it over the API (see ForgotPasswordResponse docstring).
    # Logged server-side so local/dev testing can still retrieve it without
    # a real email provider wired up.
    logger.info(f"Password reset token for user {user['id']} ({user['email']}): {token}")
    if ENVIRONMENT != "production":
        return ForgotPasswordResponse(message=generic_message, reset_token=token)
    return ForgotPasswordResponse(message=generic_message)


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    entry = await db.password_resets.find_one({"token": payload.reset_token, "used": False})
    if not entry:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    created = datetime.fromisoformat(entry["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(minutes=RESET_TOKEN_TTL_MINUTES):
        raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    await db.users.update_one({"id": entry["user_id"]}, {"$set": {"hashed_password": hash_password(payload.new_password)}})
    await db.password_resets.update_one({"token": payload.reset_token}, {"$set": {"used": True}})
    return {"message": "Password updated successfully"}


# ============ Priest registration status (3-step workflow) ============
# stage: submitted -> interview -> approved | rejected
REG_STAGES = ("submitted", "interview", "approved", "rejected")


def _reg_stage(reg: dict) -> str:
    if reg.get("stage") in REG_STAGES:
        return reg["stage"]
    st = reg.get("status")
    return "approved" if st == "approved" else "rejected" if st == "rejected" else "submitted"


@api_router.get("/priest/my-registration")
async def my_registration(user: dict = Depends(get_current_user_any)):
    """The signed-in priest's own registration progress — drives the
    3-step pending screen. Works while the account is still inactive."""
    if user.get("role") != "priest":
        raise HTTPException(status_code=403, detail="Priests only")
    reg = await db.priest_registration.find_one({"user_id": user["id"]}, {"_id": 0})
    if not reg:
        approved = user.get("approval_status") == "approved"
        return {"stage": "approved" if approved else "submitted",
                "status": user.get("approval_status") or "pending",
                "review_note": "", "reviewed_at": None}
    return {
        "stage": _reg_stage(reg),
        "status": reg.get("status", "pending"),
        "review_note": reg.get("review_note", ""),
        "reviewed_at": reg.get("reviewed_at"),
        "registered_at": reg.get("registered_at"),
    }


# ============ Metrics ============
class MetricPing(BaseModel):
    source: Optional[str] = "app"


@api_router.post("/metrics/panchangam-view")
async def track_panchangam_view(payload: MetricPing, request: Request):
    """Counts taps on the Yagnika Panchangam (yagnika.in) link from inside
    the apps. Public + lightly rate-limited; shown on the admin dashboard."""
    await _check_rate_limit(request, "metrics", limit=240, window_seconds=60)
    await db.metrics.update_one(
        {"id": "panchangam_views"},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


# ============ Availability (Poojas & E-Poojas) ============
# INVERTED model: a priest is AVAILABLE all week by default. They record the
# days/times they are NOT available.
#   users.availability = {
#     offline_paused: bool,    -- pause ALL offline poojas until untoggled
#     epuja_paused:   bool,    -- pause ALL e-poojas until untoggled
#     same_availability: bool, -- one weekly schedule for both modes? (default off)
#     weekly:          {mon:{off:bool, unavailable:[{start,end}]}, ... sun:{}},
#     weekly_inperson: {...}, weekly_epuja: {...},   -- used when NOT "same"
#     buffer_minutes:  int,
#   }
# A per-date override in `availability_overrides` states the priest's exact
# availability for that date (positive) and beats the weekly schedule:
#   {id, priest_id, date, available: bool, slots: [{start,end}]}
# Resolution order for a date+mode: pause toggle -> override -> weekly.
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _empty_day() -> dict:
    return {"off": False, "unavailable": []}


def _empty_weekly() -> dict:
    return {d: _empty_day() for d in DAYS}


def _default_availability() -> dict:
    return {
        "offline_paused": False, "epuja_paused": False, "same_availability": False,
        "weekly": _empty_weekly(), "weekly_inperson": _empty_weekly(),
        "weekly_epuja": _empty_weekly(), "buffer_minutes": 0,
    }


def _passthru_slots(raw) -> list[dict]:
    out = []
    for s in raw or []:
        if isinstance(s, dict) and s.get("start") and s.get("end"):
            out.append({"start": str(s["start"]), "end": str(s["end"])})
    return out


def _norm_day(v) -> dict:
    if isinstance(v, dict):
        return {"off": bool(v.get("off")), "unavailable": _passthru_slots(v.get("unavailable"))}
    return _empty_day()  # legacy list (positive "available" windows) -> reset


def _norm_availability(a) -> dict:
    base = _default_availability()
    if not isinstance(a, dict):
        return base
    for k in ("offline_paused", "epuja_paused", "same_availability", "buffer_minutes"):
        if k in a:
            base[k] = a[k]
    for key in ("weekly", "weekly_inperson", "weekly_epuja"):
        base[key] = {d: _norm_day((a.get(key) or {}).get(d)) for d in DAYS}
    return base


class AvSlot(BaseModel):
    start: str
    end: str


class AvModes(BaseModel):
    offline_paused: Optional[bool] = None
    epuja_paused: Optional[bool] = None
    same_availability: Optional[bool] = None


class AvWeeklyDay(BaseModel):
    mode: Literal["both", "inperson", "epuja"] = "both"
    off: bool = False                    # unavailable all day
    unavailable: List[AvSlot] = []       # unavailable windows (when not "off")
    buffer_minutes: Optional[int] = Field(default=None, ge=0, le=240)


class AvOverride(BaseModel):
    available: bool = True
    slots: List[AvSlot] = []


def _require_priest(current: UserPublic) -> None:
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")


def _clean_slots(slots: List[AvSlot]) -> list[dict]:
    """Validate a time-slot list: 'HH:MM AM/PM' (or 24h), end after start,
    no overlap. Returned sorted."""
    parsed: list[tuple[int, int, str, str]] = []
    for s in slots:
        st, en = (s.start or "").strip(), (s.end or "").strip()
        try:
            a, b = parse_time_to_minutes(st), parse_time_to_minutes(en)
        except ValueError:
            raise HTTPException(status_code=400, detail="Times must look like '06:00 AM'")
        if b <= a:
            raise HTTPException(status_code=400, detail="Each slot's end time must be after its start time")
        parsed.append((a, b, st, en))
    parsed.sort()
    for i in range(1, len(parsed)):
        if parsed[i][0] < parsed[i - 1][1]:
            raise HTTPException(status_code=409, detail="Time slots must not overlap")
    return [{"start": p[2], "end": p[3]} for p in parsed]


def _resolve_day(avail: dict, override: Optional[dict], d, mode: str) -> dict:
    """Resolved availability for one date+mode. Priority: pause toggle ->
    per-date override -> weekly unavailability. `avail` is normalized."""
    is_offline = mode.lower() in ("inperson", "offline")
    if (is_offline and avail["offline_paused"]) or (not is_offline and avail["epuja_paused"]):
        return {"date": d.isoformat(), "available": False, "off": True,
                "unavailable": [], "slots": [], "source": "paused"}
    if override is not None:
        return {"date": d.isoformat(), "available": bool(override.get("available")),
                "off": (not override.get("available")), "unavailable": [],
                "slots": override.get("slots") or [], "source": "override"}
    key = "weekly" if avail["same_availability"] else (
        "weekly_inperson" if is_offline else "weekly_epuja")
    day = avail[key][DAYS[d.weekday()]]
    if day["off"]:
        return {"date": d.isoformat(), "available": False, "off": True,
                "unavailable": [], "slots": [], "source": "weekly"}
    return {"date": d.isoformat(), "available": True, "off": False,
            "unavailable": day["unavailable"], "slots": [], "source": "weekly"}


def _window_minutes(slot: dict) -> Optional[tuple[int, int]]:
    """(start, end) minutes of a stored {start,end} slot, or None if malformed."""
    try:
        return parse_time_to_minutes(slot["start"]), parse_time_to_minutes(slot["end"])
    except (KeyError, TypeError, ValueError):
        return None


def _fits_availability(priest_doc: dict, override: Optional[dict], date: str, start: int,
                       duration_minutes: int, mode: str = "inperson") -> bool:
    """Whether the priest's own settings allow a booking at [start, +duration)
    on `date`. Bookings carry no mode yet and are all in person. A booking
    running past midnight is checked against its start date only."""
    if priest_doc.get("working_status") in ("on_leave", "not_available"):
        return False
    try:
        d = datetime.strptime(date.strip(), "%Y-%m-%d").date()
    except ValueError:
        return True  # legacy booking date we can't read: don't hide it on that basis
    day = _resolve_day(_norm_availability(priest_doc.get("availability")), override, d, mode)
    if not day["available"]:
        return False
    end = start + duration_minutes
    if day["slots"]:  # positive override: must fit inside one available window
        windows = [w for w in map(_window_minutes, day["slots"]) if w]
        return any(a <= start and end <= b for a, b in windows)
    for w in map(_window_minutes, day["unavailable"]):
        if w and intervals_overlap(start, duration_minutes, w[0], w[1] - w[0]):
            return False
    return True


@api_router.get("/priest/availability")
async def get_availability(current: UserPublic = Depends(get_current_user)):
    _require_priest(current)
    p = await db.users.find_one({"id": current.id}, {"_id": 0})
    ovr = await db.availability_overrides.find({"priest_id": current.id}, {"_id": 0}).to_list(500)
    ovr.sort(key=lambda o: o["date"])
    return {"availability": _norm_availability(p.get("availability")), "overrides": ovr}


@api_router.patch("/priest/availability")
async def set_availability_modes(payload: AvModes, current: UserPublic = Depends(get_current_user)):
    """Set the pause toggles / same-availability flag. Never touches the
    weekly schedule or overrides."""
    _require_priest(current)
    p = await db.users.find_one({"id": current.id}, {"_id": 0})
    avail = _norm_availability(p.get("availability"))
    for k in ("offline_paused", "epuja_paused", "same_availability"):
        v = getattr(payload, k)
        if v is not None:
            avail[k] = v
    await db.users.update_one({"id": current.id}, {"$set": {"availability": avail}})
    return {"availability": avail}


@api_router.put("/priest/availability/weekly/{day}")
async def set_weekly_day(day: str, payload: AvWeeklyDay, current: UserPublic = Depends(get_current_user)):
    """Set one weekday's UNAVAILABILITY. off=True -> unavailable all day."""
    _require_priest(current)
    day = day.lower()
    if day not in DAYS:
        raise HTTPException(status_code=400, detail="Unknown weekday")
    daydoc = {"off": bool(payload.off),
              "unavailable": [] if payload.off else _clean_slots(payload.unavailable)}
    p = await db.users.find_one({"id": current.id}, {"_id": 0})
    avail = _norm_availability(p.get("availability"))
    if payload.mode == "both":
        targets = ("weekly", "weekly_inperson", "weekly_epuja")
    elif payload.mode == "inperson":
        targets = ("weekly_inperson",)
    else:
        targets = ("weekly_epuja",)
    for key in targets:
        avail[key][day] = daydoc
    if payload.buffer_minutes is not None:
        avail["buffer_minutes"] = payload.buffer_minutes
    await db.users.update_one({"id": current.id}, {"$set": {"availability": avail}})
    return {"availability": avail}


@api_router.put("/priest/availability/overrides/{date}")
async def upsert_override(date: str, payload: AvOverride, current: UserPublic = Depends(get_current_user)):
    _require_priest(current)
    try:
        d = datetime.strptime(date.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    if d < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Cannot override a past date")
    slots = _clean_slots(payload.slots) if payload.available else []
    existing = await db.availability_overrides.find_one(
        {"priest_id": current.id, "date": d.isoformat()}, {"_id": 0})
    doc = {"priest_id": current.id, "date": d.isoformat(),
           "available": payload.available, "slots": slots}
    if existing:
        doc["id"] = existing["id"]
        await db.availability_overrides.update_one(
            {"priest_id": current.id, "date": d.isoformat()}, {"$set": doc})
    else:
        doc["id"] = str(uuid.uuid4())
        await db.availability_overrides.insert_one(dict(doc))
    return doc


@api_router.delete("/priest/availability/overrides/{date}")
async def delete_override(date: str, current: UserPublic = Depends(get_current_user)):
    _require_priest(current)
    await db.availability_overrides.delete_one({"priest_id": current.id, "date": date.strip()})
    return {"deleted": date.strip()}


# ---- devotee side: resolved availability ----
@api_router.get("/priests/{priest_id}/availability")
async def priest_availability_public(priest_id: str, current: UserPublic = Depends(get_current_user)):
    p = await db.users.find_one({"id": priest_id, "role": "priest", "is_active": True}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Priest not found")
    ovr = await db.availability_overrides.find({"priest_id": priest_id}, {"_id": 0}).to_list(500)
    ovr.sort(key=lambda o: o["date"])
    return {"availability": _norm_availability(p.get("availability")), "overrides": ovr}


@api_router.get("/priests/{priest_id}/availability/day")
async def priest_availability_day(priest_id: str, date: str, mode: str = "epuja",
                                  current: UserPublic = Depends(get_current_user)):
    """Resolved availability for one date. Priority: pause toggle -> per-date
    override -> weekly unavailability."""
    p = await db.users.find_one({"id": priest_id, "role": "priest", "is_active": True}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Priest not found")
    try:
        d = datetime.strptime(date.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    o = await db.availability_overrides.find_one(
        {"priest_id": priest_id, "date": d.isoformat()}, {"_id": 0})
    return _resolve_day(_norm_availability(p.get("availability")), o, d, mode)


# ============ Poojas ============
@api_router.get("/poojas", response_model=List[Pooja])
async def list_poojas(include_inactive: bool = False):
    q = {} if include_inactive else {"is_active": True}
    rows = await db.poojas.find(q, {"_id": 0}).to_list(5000)
    return [pooja_out(r) for r in rows]


@api_router.post("/admin/poojas", response_model=Pooja)
async def create_pooja(payload: PoojaCreate, _: UserPublic = Depends(require_admin)):
    pid = "p_" + secrets.token_hex(4)
    doc = {"id": pid, **payload.dict(), "is_active": True}
    await db.poojas.insert_one(dict(doc))
    doc.pop("_id", None)
    return pooja_out(doc)


@api_router.patch("/admin/poojas/{pooja_id}", response_model=Pooja)
async def update_pooja(pooja_id: str, payload: PoojaUpdate, _: UserPublic = Depends(require_admin)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No changes")
    res = await db.poojas.update_one({"id": pooja_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pooja not found")
    row = await db.poojas.find_one({"id": pooja_id}, {"_id": 0})
    return pooja_out(row)


# ============ Bookings (Devotee) ============
@api_router.post("/bookings", response_model=Booking)
async def create_booking(payload: BookingCreate, current: UserPublic = Depends(get_current_user)):
    if current.role != "devotee":
        raise HTTPException(status_code=403, detail="Only devotees can create bookings")
    pooja = await db.poojas.find_one({"id": payload.pooja_id, "is_active": True}, {"_id": 0})
    if not pooja:
        raise HTTPException(status_code=404, detail="Pooja not found")

    try:
        booking_date = datetime.strptime(payload.booking_date.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="booking_date must be in YYYY-MM-DD format")
    # Approximate "today" as UTC — the app doesn't currently track a
    # per-user timezone, so this is a coarse but sufficient guard against
    # the clearly-wrong case (booking for yesterday or last week).
    if booking_date < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Cannot book a date in the past")

    try:
        parse_time_to_minutes(payload.booking_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="booking_time must look like '08:00 AM'")

    duration_minutes = parse_duration_to_minutes(pooja["duration"])
    eligible = await find_eligible_priests(payload.pooja_id, payload.booking_date, payload.booking_time, duration_minutes)
    if not eligible:
        raise HTTPException(status_code=409, detail="No Priests Available for the selected pooja / time slot.")

    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "user_id": current.id,
        "user_name": current.name,
        "user_mobile": (payload.contact_mobile or "").strip() or current.mobile,
        "pooja_id": pooja["id"],
        "pooja_name": pooja["name"],
        "booking_date": payload.booking_date,
        "booking_time": payload.booking_time,
        "sankalp_name": payload.sankalp_name,
        "gothram": payload.gothram,
        "place": payload.place,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "notes": payload.notes or "",
        "status": "Pending Priest Assignment",
        "priest_id": None,
        "priest_name": None,
        "priest_mobile": None,
        "rejected_by": [],
        "eligible_priest_ids": [p["id"] for p in eligible],
        "duration_minutes": duration_minutes,
        "created_date": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(dict(doc))
    doc.pop("_id", None)
    return Booking(**doc)


@api_router.get("/bookings/mine", response_model=List[Booking])
async def my_bookings(current: UserPublic = Depends(get_current_user)):
    rows = await db.bookings.find({"user_id": current.id}, {"_id": 0}).to_list(1000)
    rows.sort(key=lambda x: x.get("created_date", ""), reverse=True)
    return [Booking(**r) for r in rows]


# ============ Bookings (Priest) ============
@api_router.get("/bookings/priest/inbox", response_model=List[Booking])
async def priest_inbox(current: UserPublic = Depends(get_current_user)):
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")
    rows = await db.bookings.find({
        "status": "Pending Priest Assignment",
        "eligible_priest_ids": current.id,
        "rejected_by": {"$ne": current.id},
    }, {"_id": 0}).to_list(1000)
    # Drop bookings that now clash with one the priest accepted since, or that
    # no longer fit their availability (they paused or blocked the time).
    priest_doc = await db.users.find_one({"id": current.id}, {"_id": 0})
    overrides = {o["date"]: o for o in await db.availability_overrides.find(
        {"priest_id": current.id, "date": {"$in": list({b["booking_date"] for b in rows})}},
        {"_id": 0}).to_list(1000)}
    result = []
    for b in rows:
        if await priest_can_take(priest_doc, overrides.get(b["booking_date"]), b["booking_date"],
                                 b["booking_time"], b.get("duration_minutes") or SLOT_MINUTES):
            result.append(b)
    result.sort(key=lambda x: x.get("created_date", ""), reverse=True)
    return [Booking(**r) for r in result]


@api_router.get("/bookings/priest/accepted", response_model=List[Booking])
async def priest_accepted(current: UserPublic = Depends(get_current_user)):
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")
    rows = await db.bookings.find({"priest_id": current.id, "status": "Priest Assigned"}, {"_id": 0}).to_list(1000)
    rows.sort(key=lambda x: x.get("created_date", ""), reverse=True)
    return [Booking(**r) for r in rows]


@api_router.get("/bookings/priest/completed", response_model=List[Booking])
async def priest_completed(current: UserPublic = Depends(get_current_user)):
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")
    rows = await db.bookings.find({"priest_id": current.id, "status": "Completed"}, {"_id": 0}).to_list(1000)
    rows.sort(key=lambda x: x.get("created_date", ""), reverse=True)
    return [Booking(**r) for r in rows]


@api_router.post("/bookings/{booking_id}/accept", response_model=Booking)
async def accept_booking(booking_id: str, current: UserPublic = Depends(get_current_user)):
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")

    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current.id not in row.get("eligible_priest_ids", []):
        raise HTTPException(status_code=403, detail="You are not eligible for this booking")

    priest_doc = await db.users.find_one({"id": current.id}, {"_id": 0})
    # `busy` is still recorded below but no longer blocks accepting: a priest
    # can hold bookings on other dates/times; only real clashes are refused.
    duration = row.get("duration_minutes") or SLOT_MINUTES
    if await priest_has_conflict(current.id, row["booking_date"], row["booking_time"], duration, _buffer_of(priest_doc)):
        raise HTTPException(status_code=409, detail="You already have a booking in this time slot")
    override = await db.availability_overrides.find_one(
        {"priest_id": current.id, "date": row["booking_date"]}, {"_id": 0})
    if not _fits_availability(priest_doc, override, row["booking_date"],
                              parse_time_to_minutes(row["booking_time"]), duration):
        raise HTTPException(status_code=409, detail="You are marked unavailable at this time")

    # Atomic accept: only succeeds if still pending
    res = await db.bookings.update_one(
        {"id": booking_id, "status": "Pending Priest Assignment"},
        {"$set": {
            "status": "Priest Assigned",
            "priest_id": current.id,
            "priest_name": priest_doc["name"],
            "priest_mobile": priest_doc["mobile"],
        }},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Booking has already been assigned to another priest")
    await db.users.update_one({"id": current.id}, {"$set": {"busy": True}})
    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return Booking(**row)


@api_router.post("/bookings/{booking_id}/reject", response_model=Booking)
async def reject_booking(booking_id: str, current: UserPublic = Depends(get_current_user)):
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")
    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current.id not in row.get("eligible_priest_ids", []):
        raise HTTPException(status_code=403, detail="You are not eligible for this booking")
    await db.bookings.update_one({"id": booking_id}, {"$addToSet": {"rejected_by": current.id}})
    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return Booking(**row)


@api_router.post("/bookings/{booking_id}/complete", response_model=Booking)
async def complete_booking(booking_id: str, current: UserPublic = Depends(get_current_user)):
    if current.role != "priest":
        raise HTTPException(status_code=403, detail="Priests only")
    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    if row.get("priest_id") != current.id:
        raise HTTPException(status_code=403, detail="Only assigned priest can complete")
    if row.get("status") != "Priest Assigned":
        raise HTTPException(status_code=400, detail="Booking is not in Priest Assigned state")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "Completed"}})
    # Only clear busy once every one of this priest's accepted bookings is
    # done — they could in principle have more than one "Priest Assigned"
    # booking if they were assigned before the busy gate existed.
    remaining = await db.bookings.count_documents({"priest_id": current.id, "status": "Priest Assigned"})
    if remaining == 0:
        await db.users.update_one({"id": current.id}, {"$set": {"busy": False}})
    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return Booking(**row)


@api_router.get("/bookings/{booking_id}", response_model=Booking)
async def get_booking(booking_id: str, current: UserPublic = Depends(get_current_user)):
    row = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current.role == "admin":
        return Booking(**row)
    if current.role == "devotee" and row["user_id"] != current.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if current.role == "priest":
        if row.get("priest_id") == current.id or current.id in row.get("eligible_priest_ids", []):
            return Booking(**row)
        raise HTTPException(status_code=403, detail="Forbidden")
    return Booking(**row)


# ============ Admin ============
@api_router.get("/admin/bookings", response_model=List[Booking])
async def admin_list_bookings(
    _: UserPublic = Depends(require_admin),
    status_filter: Optional[str] = Query(None, alias="status"),
    date: Optional[str] = None,
    pooja_id: Optional[str] = None,
    priest_id: Optional[str] = None,
    user_id: Optional[str] = None,
):
    q: dict = {}
    if status_filter: q["status"] = status_filter
    if date: q["booking_date"] = date
    if pooja_id: q["pooja_id"] = pooja_id
    if priest_id: q["priest_id"] = priest_id
    if user_id: q["user_id"] = user_id
    rows = await db.bookings.find(q, {"_id": 0}).to_list(2000)
    rows.sort(key=lambda x: x.get("created_date", ""), reverse=True)
    return [Booking(**r) for r in rows]


@api_router.get("/admin/priests", response_model=List[UserPublic])
async def admin_list_priests(_: UserPublic = Depends(require_admin), search: Optional[str] = None):
    q: dict = {"role": "priest"}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"email": {"$regex": search, "$options": "i"}}, {"mobile": {"$regex": search, "$options": "i"}}]
    rows = await db.users.find(q, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return [user_doc_to_public(r) for r in rows]


@api_router.get("/admin/priest-registrations")
async def admin_list_priest_registrations(
    _: UserPublic = Depends(require_admin),
    status_filter: Optional[str] = Query(None, alias="status"),  # pending | approved | rejected
    stage_filter: Optional[str] = Query(None, alias="stage"),    # submitted | interview | approved | rejected
):
    q: dict = {}
    if status_filter:
        q["status"] = status_filter
    if stage_filter:
        q["stage"] = stage_filter
    rows = await db.priest_registration.find(q, {"_id": 0}).to_list(2000)
    # Backfill a stage for legacy rows so the admin UI always has one.
    for r in rows:
        r["stage"] = _reg_stage(r)
    rows.sort(key=lambda x: x.get("registered_at", ""), reverse=True)
    return rows


class RegReview(BaseModel):
    note: Optional[str] = ""


class RegStage(BaseModel):
    stage: Literal["submitted", "interview"]
    note: Optional[str] = ""


@api_router.post("/admin/priest-registrations/{reg_id}/stage")
async def admin_set_registration_stage(reg_id: str, payload: RegStage, _: UserPublic = Depends(require_admin)):
    """Move a registration between the first two steps (details <-> interview).
    Finalising is done via /approve or /reject."""
    reg = await db.priest_registration.find_one({"id": reg_id}, {"_id": 0})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    if reg.get("status") in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="This registration has already been finalised.")
    await db.priest_registration.update_one(
        {"id": reg_id},
        {"$set": {"stage": payload.stage, "status": "pending", "review_note": (payload.note or "").strip()}},
    )
    return {"stage": payload.stage, "user_id": reg["user_id"]}


@api_router.post("/admin/priest-registrations/{reg_id}/approve")
async def admin_approve_registration(reg_id: str, payload: RegReview, _: UserPublic = Depends(require_admin)):
    reg = await db.priest_registration.find_one({"id": reg_id}, {"_id": 0})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.priest_registration.update_one(
        {"id": reg_id},
        {"$set": {"status": "approved", "stage": "approved", "reviewed_at": now, "review_note": (payload.note or "").strip()}},
    )
    await db.users.update_one(
        {"id": reg["user_id"]},
        {"$set": {"is_active": True, "approval_status": "approved"}},
    )
    return {"status": "approved", "user_id": reg["user_id"]}


@api_router.post("/admin/priest-registrations/{reg_id}/reject")
async def admin_reject_registration(reg_id: str, payload: RegReview, _: UserPublic = Depends(require_admin)):
    reg = await db.priest_registration.find_one({"id": reg_id}, {"_id": 0})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.priest_registration.update_one(
        {"id": reg_id},
        {"$set": {"status": "rejected", "stage": "rejected", "reviewed_at": now, "review_note": (payload.note or "").strip()}},
    )
    await db.users.update_one(
        {"id": reg["user_id"]},
        {"$set": {"is_active": False, "approval_status": "rejected"}},
    )
    return {"status": "rejected", "user_id": reg["user_id"]}


@api_router.get("/admin/devotees", response_model=List[UserPublic])
async def admin_list_devotees(_: UserPublic = Depends(require_admin), search: Optional[str] = None):
    q: dict = {"role": "devotee"}
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}}, {"email": {"$regex": search, "$options": "i"}}, {"mobile": {"$regex": search, "$options": "i"}}]
    rows = await db.users.find(q, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return [user_doc_to_public(r) for r in rows]


@api_router.patch("/admin/users/{user_id}/active", response_model=UserPublic)
async def admin_toggle_user(user_id: str, payload: ActiveToggle, _: UserPublic = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin account cannot be modified")
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": payload.is_active}})
    row = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    return user_doc_to_public(row)


@api_router.get("/admin/stats")
async def admin_stats(_: UserPublic = Depends(require_admin)):
    priests = await db.users.count_documents({"role": "priest"})
    priests_active = await db.users.count_documents({"role": "priest", "is_active": True})
    devotees = await db.users.count_documents({"role": "devotee"})
    devotees_active = await db.users.count_documents({"role": "devotee", "is_active": True})
    pv = await db.metrics.find_one({"id": "panchangam_views"}, {"_id": 0}) or {}
    return {
        "priests": priests,
        "priests_active": priests_active,
        "priests_inactive": priests - priests_active,
        "devotees": devotees,
        "devotees_active": devotees_active,
        "devotees_inactive": devotees - devotees_active,
        "users_total": priests + devotees,
        "poojas": await db.poojas.count_documents({}),
        "poojas_active": await db.poojas.count_documents({"is_active": True}),
        "bookings_total": await db.bookings.count_documents({}),
        "bookings_pending": await db.bookings.count_documents({"status": "Pending Priest Assignment"}),
        "bookings_assigned": await db.bookings.count_documents({"status": "Priest Assigned"}),
        "bookings_completed": await db.bookings.count_documents({"status": "Completed"}),
        "bookings_cancelled": await db.bookings.count_documents({"status": "Cancelled"}),
        # A booking a priest has declined still shows up for others until
        # someone accepts it — count anything with at least one rejection.
        "bookings_rejected": await db.bookings.count_documents({"rejected_by.0": {"$exists": True}}),
        "reg_pending": await db.priest_registration.count_documents({"status": "pending"}),
        "reg_submitted": await db.priest_registration.count_documents({"stage": "submitted", "status": "pending"}),
        "reg_interview": await db.priest_registration.count_documents({"stage": "interview", "status": "pending"}),
        "reg_approved": await db.priest_registration.count_documents({"status": "approved"}),
        "reg_rejected": await db.priest_registration.count_documents({"status": "rejected"}),
        "panchangam_views": pv.get("count", 0),
    }


# ============ Misc ============
@api_router.get("/")
async def root():
    return {"message": "Yagnika API is running", "status": "ok"}


@api_router.get("/download-source")
async def download_source():
    path = ROOT_DIR / "downloads" / "yagnika_source.zip"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Source archive not found")
    return FileResponse(str(path), media_type="application/zip", filename="yagnika_source.zip")


# ============ Seed (poojas only + admin) ============
POOJAS_SEED = [
    {"id": "p1", "name": "Satyanarayana Pooja", "sanskrit_name": "॥ सत्यनारायण पूजा ॥",
     "description": "Family peace, prosperity, and truth observance.", "duration": "2 hours", "price": 1999, "is_active": True},
    {"id": "p2", "name": "Ganapathi Homam", "sanskrit_name": "॥ गणपति होम ॥",
     "description": "Remove obstacles and invite auspicious beginnings.", "duration": "1.5 hours", "price": 1499, "is_active": True},
    {"id": "p3", "name": "Rudrabhishekam", "sanskrit_name": "॥ रुद्राभिषेकम् ॥",
     "description": "Sacred abhishekam to Lord Shiva for blessings & healing.", "duration": "2 hours", "price": 2499, "is_active": True},
    {"id": "p4", "name": "Lakshmi Pooja", "sanskrit_name": "॥ लक्ष्मी पूजा ॥",
     "description": "Wealth, prosperity, and financial success.", "duration": "1.5 hours", "price": 1799, "is_active": True},
    {"id": "p5", "name": "Navagraha Homam", "sanskrit_name": "॥ नवग्रह होम ॥",
     "description": "Pacify the nine planets for harmony and success.", "duration": "3 hours", "price": 2999, "is_active": True},
    {"id": "p6", "name": "Gruhapravesham", "sanskrit_name": "॥ गृहप्रवेशम् ॥",
     "description": "Sacred housewarming ceremony for new home blessings.", "duration": "3 hours", "price": 3499, "is_active": True},
    {"id": "p7", "name": "Ayush Homam", "sanskrit_name": "॥ आयुष होम ॥",
     "description": "Longevity, health, and spiritual well-being.", "duration": "2 hours", "price": 2299, "is_active": True},
    {"id": "p8", "name": "Sudarshana Homam", "sanskrit_name": "॥ सुदर्शन होम ॥",
     "description": "Protection from negativity and evil influences.", "duration": "2 hours", "price": 2599, "is_active": True},
    {"id": "p9", "name": "Vastu Pooja", "sanskrit_name": "॥ वास्तु पूजा ॥",
     "description": "Purify and harmonize your home or workplace.", "duration": "1.5 hours", "price": 1899, "is_active": True},
    {"id": "p10", "name": "Annaprasana", "sanskrit_name": "॥ अन्नप्राशन ॥",
     "description": "First rice-feeding ceremony for infants.", "duration": "1 hour", "price": 1299, "is_active": True},
]


# ============ Priest & spiritual service catalog ============
# Selectable categories a service provider registers for. Each category
# holds an ordered list of blocks; a block is either a named subcategory
# with its own services, or {"sub": None} for services that sit directly
# under the category. Seeded into the `poojas` collection (ids "sc-<c>-<n>")
# so the same eligibility machinery applies.
SERVICE_CATALOG: dict[str, list[dict]] = {
    "Daiva Karyakramas (Divine Services)": [
        {"sub": "Poojas", "items": [
            "Suprabhata Seva", "Archana", "Ashtottara Archana", "Sahasranama Archana", "Mangala Harathi",
        ]},
        {"sub": "Special Poojas", "items": [
            "Pradosha Puja", "Graha Shanti Puja", "Rahu-Ketu Puja", "Sarpa Dosha Puja", "Ayushya Puja",
            "Vastu Puja", "Navagraha Puja", "Saraswati Puja", "Hanuman Puja", "Sri Venkateswara Swamy Puja",
        ]},
        {"sub": "Vrathams", "items": [
            "Satyanarayana Vratham", "Vara Lakshmi Vratham", "Ganapati Vratham", "Kedareswara Vratham",
            "Anantha Padmanabha Vratham", "Durga Vratham", "Vibhava Lakshmi Vratham", "Ekadashi Vratham",
            "Kartika Vratham", "Dattatreya Vratham", "Skanda Shashti Vratham", "Tulasi Vratham",
            "Santoshi Mata Vratham",
        ]},
        {"sub": "Abhishekams", "items": [
            "Ekadasha Rudrabhishekam", "Rudraabhishekam", "Moorthi Abhishekam", "Sahasra Kalasa Abhishekam",
        ]},
        {"sub": "Homams / Yagnas", "items": [
            "Ganapati Homam", "Sudarshana Homam", "Chandi Homam", "Navagraha Homam", "Rudra Homam",
            "Maha Mrityunjaya Homam", "Lakshmi Kubera Homam", "Lakshmi Ganapathi Homam", "Santana Gopala Homam",
            "Saraswati Homam", "Ayushya Homam", "Dhanvantari Homam", "Vastu Homam", "Pratyangira Homam",
        ]},
        {"sub": "Pratishtha Karyas", "items": [
            "Vigraha Pratishtha", "Yantra Pratishtha", "Kumbhabhishekam", "Dhwaja Stambha Pratishtha",
            "Kalasha Sthapana", "Jeernoddharana", "Temple Renovation Rituals",
        ]},
        {"sub": "Deity Kalyanams", "items": [
            "Sita Rama Kalyanam", "Srinivasa Kalyanam", "Uma Maheshwara Kalyanam", "Lakshmi Narayana Kalyanam",
            "Subrahmanya Kalyanam", "Suvarchala Hanuman Kalyanam",
        ]},
        {"sub": "Utsavams", "items": ["Brahmotsavam"]},
        {"sub": "Navaratrulu", "items": ["Devi Navaratri", "Ganapathi Navaratri"]},
    ],
    "Manushya Karyakramas (Subha Karyas)": [
        {"sub": "Shodasha Samskaras", "items": [
            "Garbhadhana", "Pumsavana", "Seemantham", "Jatakarma", "Namakarana", "Annaprasana",
            "Chudakarana", "Karnavedha", "Aksharabhyasam", "Upanayanam", "Vedarambham", "Samavartanam",
            "Vivaham",
        ]},
        {"sub": "Family Ceremonies", "items": [
            "Gruha Pravesham", "Bhoomi Puja", "Shanku Sthapana", "Vastu Puja", "Vehicle Puja",
            "Office / Shop / Factory Opening", "Ayushya Ceremony", "Shashtipoorthi", "Sathabhishekam",
            "Kanakabhishekam",
        ]},
    ],
    "Alankara Sevas (Deity Decoration Services)": [
        {"sub": None, "items": [
            "Moolamoorthi Alankaram", "Utsavamoorthi Alankaram",
            "Moorthi Samagra Vyavastha (end-to-end deity arrangement)",
        ]},
    ],
    "Paricharaka Sevas (Priest Assistance Services)": [
        {"sub": None, "items": ["Temple Assistance", "Priest Assistance"]},
    ],
    "Vanta Brahmana Sevas (Religious Cooking Services)": [
        {"sub": None, "items": ["Temple", "Shubha Karya", "Ashubha Karya"]},
    ],
    "Parayana Sevas (Sacred Recitations)": [
        {"sub": "Vedic Chanting", "items": [
            "Rudram", "Chamakam", "Purusha Suktam", "Sri Suktam", "Narayana Suktam", "Durga Suktam",
            "Medha Suktam",
        ]},
        {"sub": "Sahasranamas", "items": [
            "Vishnu Sahasranamam", "Lalitha Sahasranamam", "Shiva Sahasranamam", "Lakshmi Sahasranamam",
            "Subrahmanya Sahasranamam",
        ]},
        {"sub": "Stotras", "items": [
            "Hanuman Chalisa", "Aditya Hridayam", "Kanakadhara Stotram", "Soundarya Lahari", "Lingashtakam",
            "Mahishasura Mardini Stotram", "Manidweepam Varnana",
        ]},
        {"sub": "Scriptural Recitations", "items": [
            "Sundarakanda", "Ramayanam", "Bhagavad Gita", "Srimad Bhagavatam", "Devi Mahatmyam",
            "Vishnu Puranam", "Shiva Puranam", "Skanda Puranam", "Bhagavata Saptaham", "Garuda Purana",
        ]},
    ],
    "Jyotisha Sevas (Astrology Services)": [
        {"sub": None, "items": [
            "Horoscope Services", "Muhurtha Services", "Dosha Analysis", "Parihara Recommendations",
            "Numerology", "Palmistry", "Vastu Consultation",
        ]},
    ],
    "Danas (Accepted Ritual Offerings)": [
        {"sub": "Common Danas", "items": ["Dakshina", "Vastra Dana", "Anna Dana"]},
        {"sub": "Special Danas", "items": [
            "Graha Shanti Danas", "Shani Dana", "Rahu-Ketu Dana", "Pitru Dosha Dana", "Naga Dosha Dana",
            "Kuja Dosha Dana", "Parihara Danas",
        ]},
    ],
    # Split out of "Manushya Karyakramas (Subha Karyas)" into its own main
    # category. Appended last on purpose so the sc-<catIdx>-<n> ids of every
    # other category stay unchanged; display order is set on the frontend.
    "Manushya Karyakramas (Pitru Karma / Uttara Kriya)": [
        {"sub": None, "items": [
            "Antyeshti", "Asthi Visarjanam", "Pinda Pradanam", "Shraddham", "Tarpanam", "Masikam",
            "Varshikam", "Ekoddishta Shraddha", "Sapindikarana", "Narayana Bali", "Tripindi Shraddha",
            "Pitru Shanti",
        ]},
    ],
}

# Fixed display order for the categories above.
CATEGORY_ORDER = list(SERVICE_CATALOG.keys())


def build_service_seed() -> list[dict]:
    """Flattens SERVICE_CATALOG into poojas-collection docs with stable ids."""
    docs: list[dict] = []
    for cat_idx, (category, blocks) in enumerate(SERVICE_CATALOG.items(), start=1):
        n = 0
        for block in blocks:
            sub = block["sub"] or None
            for name in block["items"]:
                n += 1
                docs.append({
                    "id": f"sc-{cat_idx}-{n}",
                    "name": name,
                    "sanskrit_name": "",
                    "description": "",
                    "duration": "",
                    "price": 0,
                    "is_active": True,
                    "category": category,
                    "subcategory": sub,
                })
    return docs


SERVICE_SEED = build_service_seed()


async def seed_database():
    # Wipe stale demo data on first startup after refactor
    # await db.users.delete_many({"role": {"$in": ["priest", "devotee"]}})
    # await db.bookings.delete_many({})
    # Remove old priest catalog collection (no longer used)
    # await db.priests.drop()

    # Enforced at the DB level, not just via the find-then-insert check in
    # the register endpoints — closes the race where two concurrent
    # registrations with the same (email, role) could otherwise both slip
    # past the application-level check before either insert completes.
    #
    # Scoped to (email, role) rather than email alone so the same person
    # can hold both a devotee account and a priest account under one
    # email (e.g. a priest who also wants to book poojas for himself).
    # Migrates off the older email-only unique index, which made that
    # scenario impossible (second registration always got "Email already
    # registered", and logging in under the "wrong" role would silently
    # authenticate whichever single account existed).
    try:
        await db.users.drop_index("email_1")
    except OperationFailure:
        pass  # already migrated, or never existed on a fresh db
    await db.users.create_index([("email", 1), ("role", 1)], unique=True)

    # Priest registration record table. create_collection is explicit so the
    # collection shows up in Compass even before the first priest signs up;
    # the index keeps user_id -> registration lookups fast.
    try:
        await db.create_collection("priest_registration")
    except CollectionInvalid:
        pass  # already exists
    await db.priest_registration.create_index("user_id")
    await db.priest_registration.create_index("registered_at")

    # Availability: per-date overrides + drop the retired E-Service data.
    try:
        await db.create_collection("availability_overrides")
    except CollectionInvalid:
        pass
    await db.availability_overrides.create_index([("priest_id", 1), ("date", 1)], unique=True)
    try:
        await db.eservice_slots.drop()
    except Exception:
        pass
    await db.users.update_many(
        {"role": "priest"},
        {"$unset": {"eservice_available": "", "eservice_start": "", "eservice_end": "",
                    "eservice_defaults": "", "eservice_customized_dates": "", "eservice_enabled": ""}},
    )
    # Availability model was inverted (available-by-default). Reset any config
    # still on the old "positive weekly + inperson/epuja_enabled" shape.
    await db.users.update_many(
        {"role": "priest", "$or": [
            {"availability.inperson_enabled": {"$exists": True}},
            {"availability.epuja_enabled": {"$exists": True}},
            {"availability.weekly.mon": {"$type": "array"}},
        ]},
        {"$unset": {"availability": ""}},
    )

    # Backfill busy=True for any priest with a pre-existing "Priest
    # Assigned" booking from before the busy flag existed, so the flag is
    # accurate (it's informational — see UserPublic.busy).
    busy_priest_ids = await db.bookings.distinct("priest_id", {"status": "Priest Assigned"})
    if busy_priest_ids:
        await db.users.update_many({"id": {"$in": busy_priest_ids}}, {"$set": {"busy": True}})

    # Reset poojas seed (idempotent) + backfill is_active on any legacy docs
    await db.poojas.update_many({"is_active": {"$exists": False}}, {"$set": {"is_active": True}})

    # Demo poojas (p1..p10) used by the devotee booking flow.
    existing_ids = {p["id"] for p in await db.poojas.find({}, {"id": 1, "_id": 0}).to_list(5000)}
    to_insert = [p for p in POOJAS_SEED if p["id"] not in existing_ids]
    if to_insert:
        await db.poojas.insert_many([dict(p) for p in to_insert])

    # --- Service category catalog: rebuild from SERVICE_CATALOG ---
    # Drop the previous catalog entirely (old "svc-*" scheme and any
    # "sc-*" rows no longer present) so a catalog change is fully applied.
    await db.poojas.delete_many({"id": {"$regex": "^svc-"}})
    current_sc_ids = [d["id"] for d in SERVICE_SEED]
    await db.poojas.delete_many({"id": {"$regex": "^sc-", "$nin": current_sc_ids}})
    for d in SERVICE_SEED:
        await db.poojas.update_one({"id": d["id"]}, {"$set": dict(d)}, upsert=True)

    # Grandfather priests that registered before the approval workflow:
    # mark their registration + account as approved so they keep working.
    await db.priest_registration.update_many(
        {"status": {"$nin": ["pending", "approved", "rejected"]}},
        {"$set": {"status": "approved", "reviewed_at": None, "review_note": "auto-approved (legacy)"}},
    )
    # Backfill the 3-step `stage` on any registration row that predates it.
    await db.priest_registration.update_many(
        {"stage": {"$exists": False}, "status": "approved"}, {"$set": {"stage": "approved"}})
    await db.priest_registration.update_many(
        {"stage": {"$exists": False}, "status": "rejected"}, {"$set": {"stage": "rejected"}})
    await db.priest_registration.update_many(
        {"stage": {"$exists": False}}, {"$set": {"stage": "submitted"}})
    approved_ids = await db.priest_registration.distinct("user_id", {"status": "approved"})
    if approved_ids:
        await db.users.update_many(
            {"id": {"$in": approved_ids}, "approval_status": {"$exists": False}},
            {"$set": {"approval_status": "approved"}},
        )
    # Any priest user with no approval_status at all (e.g. no registration
    # record) is treated as approved to avoid locking existing testers out.
    await db.users.update_many(
        {"role": "priest", "approval_status": {"$exists": False}},
        {"$set": {"approval_status": "approved"}},
    )

    # Admin account. Sign-in is by username (not email) via POST
    # /api/admin/login. Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD
    # in .env and are kept in sync on every startup.
    admin_username = os.environ.get('ADMIN_USERNAME', '').strip()
    admin_password = os.environ.get('ADMIN_PASSWORD', '')
    if not admin_username or not admin_password:
        logger.warning("ADMIN_USERNAME / ADMIN_PASSWORD not set; skipping admin account seeding")
        return
    admin_hash = hash_password(admin_password)
    existing_admin = await db.users.find_one({"role": "admin"})
    if not existing_admin:
        await db.users.insert_one({
            "id": "admin",
            "name": "Yagnika Admin",
            "username": admin_username,
            "email": "admin@yagnika.com",  # kept for the (email, role) unique index
            "mobile": "+91 00000 00000",
            "role": "admin",
            "is_active": True,
            "hashed_password": admin_hash,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        await db.users.update_one(
            {"id": existing_admin["id"]},
            {"$set": {"username": admin_username, "hashed_password": admin_hash, "is_active": True}},
        )


@app.on_event("startup")
async def on_startup():
    await seed_database()


app.include_router(api_router)

# Panchangam / Muhurtam / Kundali calculators (public, read-only) — ported
# from the standalone Yagnika Panchangam service, now served in-app so the
# customer and priest apps have a fully native Panchangam feature.
from panchangam.router import router as panchangam_router  # noqa: E402

app.include_router(panchangam_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Admin Web UI (single self-contained page, served by this backend) ----
_ADMIN_UI = ROOT_DIR / "admin_ui" / "index.html"


@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
async def admin_ui():
    if not _ADMIN_UI.exists():
        raise HTTPException(status_code=404, detail="Admin UI not found")
    return FileResponse(str(_ADMIN_UI), media_type="text/html")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

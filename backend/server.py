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
    # Priest-only: true while they have a "Priest Assigned" booking that
    # hasn't been marked Completed yet. A busy priest is excluded from new
    # booking eligibility until it flips back to false (see accept_booking
    # / complete_booking). Distinct from is_active on purpose — is_active
    # gates login, and a busy priest still needs to log in to manage the
    # very booking that made them busy.
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


class PriestRegister(BaseModel):
    # --- Account (needed for login; email doubles as the optional contact
    #     email from the spec) ---
    email: EmailStr
    password: str = Field(min_length=6)

    # --- A. Personal Information (mandatory) ---
    name: str
    photo_url: Optional[str] = Field(default=None, max_length=MAX_PHOTO_DATA_URI_LEN)
    aadhaar_number: str
    mobile: str
    address: str
    date_of_birth: str  # YYYY-MM-DD
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # --- B. Religious Lineage & Vedic Details (mandatory; abhivadanam optional) ---
    sampradaya: str
    agama: str
    veda: str
    shakha: str
    sutra: str
    gotra: str
    pravara: str
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
    veda_patashala: Optional[str] = ""
    guru_name: Optional[str] = ""
    awards: Optional[str] = ""
    years_temple_service: Optional[int] = None
    availability: Optional[str] = ""
    travel_availability: Optional[bool] = None
    online_consultation: Optional[bool] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[Literal["mr", "mrs"]] = None
    photo_url: Optional[str] = Field(default=None, max_length=MAX_PHOTO_DATA_URI_LEN)


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
# Deliberately dependency-free: fine for a single-process PoC deployment,
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


def intervals_overlap(start_a: int, dur_a: int, start_b: int, dur_b: int) -> bool:
    return start_a < start_b + dur_b and start_b < start_a + dur_a


async def priest_has_conflict(priest_id: str, date: str, time_str: str, duration_minutes: int) -> bool:
    start = parse_time_to_minutes(time_str)
    accepted = await db.bookings.find({
        "priest_id": priest_id,
        "booking_date": date,
        "status": {"$in": ["Priest Assigned", "Completed"]},
    }, {"_id": 0, "booking_time": 1, "duration_minutes": 1}).to_list(1000)
    for b in accepted:
        other_start = parse_time_to_minutes(b["booking_time"])
        other_dur = b.get("duration_minutes") or SLOT_MINUTES
        if intervals_overlap(start, duration_minutes, other_start, other_dur):
            return True
    return False


async def find_eligible_priests(pooja_id: str, date: str, time_str: str, duration_minutes: int) -> List[dict]:
    priests = await db.users.find({
        "role": "priest",
        "is_active": True,
        "busy": {"$ne": True},
        "services": pooja_id,
    }, {"_id": 0, "hashed_password": 0}).to_list(1000)
    eligible = []
    for p in priests:
        if not await priest_has_conflict(p["id"], date, time_str, duration_minutes):
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


@api_router.post("/auth/register-priest", response_model=Token)
async def register_priest(payload: PriestRegister, request: Request):
    await _check_rate_limit(request, "register", limit=50, window_seconds=3600)

    # --- Mandatory field checks (beyond the type-level ones in the model) ---
    mandatory_text = {
        "name": payload.name, "address": payload.address,
        "sampradaya": payload.sampradaya, "agama": payload.agama, "veda": payload.veda,
        "shakha": payload.shakha, "sutra": payload.sutra, "gotra": payload.gotra,
        "pravara": payload.pravara,
    }
    missing = [k for k, v in mandatory_text.items() if not (v or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")

    aadhaar = AADHAAR_RE.sub("", payload.aadhaar_number or "")
    if len(aadhaar) != 12:
        raise HTTPException(status_code=400, detail="Aadhaar Number must be 12 digits")

    try:
        dob = datetime.strptime(payload.date_of_birth.strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Date of Birth must be in YYYY-MM-DD format")
    if dob >= datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Date of Birth must be in the past")

    if payload.priest_type == "temple" and not (payload.temple_name or "").strip():
        raise HTTPException(status_code=400, detail="Temple Name is required for a Temple Priest")

    # validate services exist and are active
    valid_ids = {p["id"] for p in await db.poojas.find({"id": {"$in": payload.services}, "is_active": True}, {"_id": 0, "id": 1}).to_list(5000)}
    services = [s for s in payload.services if s in valid_ids]
    if not services:
        raise HTTPException(status_code=400, detail="Select at least one valid service")

    uid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Full profile — schemaless, so the whole registration payload is kept
    # on the users doc as well as the dedicated collection below.
    profile = {
        "photo_url": payload.photo_url,
        "aadhaar_number": aadhaar,
        "date_of_birth": payload.date_of_birth.strip(),
        "sampradaya": payload.sampradaya.strip(),
        "agama": payload.agama.strip(),
        "veda": payload.veda.strip(),
        "shakha": payload.shakha.strip(),
        "sutra": payload.sutra.strip(),
        "gotra": payload.gotra.strip(),
        "pravara": payload.pravara.strip(),
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
        "is_active": True,
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
        "status": "registered",
        "registered_at": now_iso,
        **profile,
    }
    await db.priest_registration.insert_one(dict(reg_doc))

    user_pub = UserPublic(id=uid, name=payload.name.strip(), email=payload.email, mobile=payload.mobile.strip(), role="priest",
                          address=payload.address.strip(), latitude=payload.latitude, longitude=payload.longitude,
                          services=services, is_active=True, photo_url=payload.photo_url)
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
        raise HTTPException(status_code=403, detail="Account is deactivated. Please contact admin.")
    user_pub = user_doc_to_public(user)
    return Token(access_token=create_access_token(user["id"], user["role"]), user=user_pub)


@api_router.get("/auth/me", response_model=UserPublic)
async def me(current: UserPublic = Depends(get_current_user)):
    return current


@api_router.patch("/auth/me", response_model=UserPublic)
async def update_me(payload: ProfileUpdate, current: UserPublic = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"id": current.id}, {"$set": updates})
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


# ============ Poojas ============
@api_router.get("/poojas", response_model=List[Pooja])
async def list_poojas(include_inactive: bool = False):
    q = {} if include_inactive else {"is_active": True}
    rows = await db.poojas.find(q, {"_id": 0}).to_list(5000)
    return [Pooja(**r) for r in rows]


@api_router.post("/admin/poojas", response_model=Pooja)
async def create_pooja(payload: PoojaCreate, _: UserPublic = Depends(require_admin)):
    pid = "p_" + secrets.token_hex(4)
    doc = {"id": pid, **payload.dict(), "is_active": True}
    await db.poojas.insert_one(dict(doc))
    doc.pop("_id", None)
    return Pooja(**doc)


@api_router.patch("/admin/poojas/{pooja_id}", response_model=Pooja)
async def update_pooja(pooja_id: str, payload: PoojaUpdate, _: UserPublic = Depends(require_admin)):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No changes")
    res = await db.poojas.update_one({"id": pooja_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pooja not found")
    row = await db.poojas.find_one({"id": pooja_id}, {"_id": 0})
    return Pooja(**row)


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
        "user_mobile": current.mobile,
        "pooja_id": pooja["id"],
        "pooja_name": pooja["name"],
        "booking_date": payload.booking_date,
        "booking_time": payload.booking_time,
        "sankalp_name": payload.sankalp_name,
        "gothram": payload.gothram,
        "place": payload.place,
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
    # filter out bookings that now conflict with newly accepted bookings
    result = []
    for b in rows:
        if not await priest_has_conflict(current.id, b["booking_date"], b["booking_time"], b.get("duration_minutes") or SLOT_MINUTES):
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
    # A priest handling an active booking is busy until it's marked
    # Completed (see complete_booking) — blocks accepting a second booking
    # even one already sitting in their inbox from before they got busy.
    if priest_doc.get("busy"):
        raise HTTPException(status_code=409, detail="You already have an active booking in progress. Complete it before accepting another.")
    if await priest_has_conflict(current.id, row["booking_date"], row["booking_time"], row.get("duration_minutes") or SLOT_MINUTES):
        raise HTTPException(status_code=409, detail="You already have a booking in this time slot")

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
async def admin_list_priest_registrations(_: UserPublic = Depends(require_admin)):
    rows = await db.priest_registration.find({}, {"_id": 0}).to_list(2000)
    rows.sort(key=lambda x: x.get("registered_at", ""), reverse=True)
    return rows


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
    return {
        "priests": await db.users.count_documents({"role": "priest"}),
        "priests_active": await db.users.count_documents({"role": "priest", "is_active": True}),
        "devotees": await db.users.count_documents({"role": "devotee"}),
        "devotees_active": await db.users.count_documents({"role": "devotee", "is_active": True}),
        "poojas": await db.poojas.count_documents({}),
        "poojas_active": await db.poojas.count_documents({"is_active": True}),
        "bookings_total": await db.bookings.count_documents({}),
        "bookings_pending": await db.bookings.count_documents({"status": "Pending Priest Assignment"}),
        "bookings_assigned": await db.bookings.count_documents({"status": "Priest Assigned"}),
        "bookings_completed": await db.bookings.count_documents({"status": "Completed"}),
    }


# ============ Misc ============
@api_router.get("/")
async def root():
    return {"message": "Yagnika API is running", "status": "ok"}


@api_router.get("/download-source")
async def download_source():
    path = ROOT_DIR / "downloads" / "yagnika_poc_source.zip"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Source archive not found")
    return FileResponse(str(path), media_type="application/zip", filename="yagnika_poc_source.zip")


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


# ============ Priest service catalog (11 categories) ============
# Selectable service categories a priest registers for. Seeded into the
# `poojas` collection alongside the demo poojas above so the same
# services/eligibility machinery applies. Stable ids: "svc-<cat>-<n>".
SERVICE_CATALOG: dict[str, dict[str, list[str]]] = {
    "Poojas": {
        "Daily Poojas": [
            "Suprabhata Seva", "Nitya Archana", "Sahasranama Archana", "Ashtottara Archana",
            "Panchopachara Puja", "Shodashopachara Puja", "Deepa Aradhana", "Harathi",
        ],
        "Ganapati Poojas": ["Ganapati Puja", "Siddhi Vinayaka Puja", "Maha Ganapati Homam"],
        "Lakshmi Poojas": ["Lakshmi Puja", "Vara Lakshmi Vratham", "Ashta Lakshmi Puja", "Dhana Lakshmi Puja"],
        "Shiva Poojas": [
            "Rudrabhishekam", "Maha Rudrabhishekam", "Ekadasa Rudram", "Laghu Rudram",
            "Shiva Archana", "Pradosha Puja",
        ],
        "Vishnu Poojas": [
            "Satyanarayana Swamy Vratham", "Sri Venkateswara Puja", "Sudarshana Puja",
            "Vishnu Sahasranama Archana",
        ],
        "Devi Poojas": [
            "Durga Puja", "Lalitha Sahasranama Puja", "Chandi Puja", "Raja Rajeshwari Puja",
            "Navaratri Special Pujas",
        ],
        "Hanuman Poojas": ["Hanuman Puja", "Hanuman Chalisa Parayanam", "Sundarakanda Parayanam"],
        "Subrahmanya Poojas": ["Subrahmanya Swamy Puja", "Sarpa Dosha Puja", "Skanda Shasti Puja"],
        "Navagraha Poojas": [
            "Navagraha Puja", "Graha Shanti", "Kuja Dosha Puja", "Shani Shanti", "Rahu-Ketu Puja",
        ],
        "Festival Poojas": [
            "Ugadi", "Sri Rama Navami", "Krishna Janmashtami", "Vinayaka Chavithi", "Navaratri",
            "Deepavali", "Kartika Masam", "Vaikunta Ekadasi", "Maha Shivaratri", "Sankranti",
        ],
    },
    "Abhishekams": {
        "": [
            "Panchamrita Abhishekam", "Milk Abhishekam", "Honey Abhishekam", "Tender Coconut Abhishekam",
            "Turmeric Abhishekam", "Kumkum Abhishekam", "Rudrabhishekam", "Sahasra Kalasa Abhishekam",
            "Maha Abhishekam",
        ],
    },
    "Alankarams": {
        "Daily Alankarams": ["Pushpa Alankaram", "Tulasi Alankaram", "Bilva Alankaram", "Chandan Alankaram"],
        "Festival Alankarams": [
            "Raja Alankaram", "Kalyana Alankaram", "Vishesha Alankaram", "Swarna Alankaram",
            "Ratna Alankaram", "Vastralankaram", "Phala Alankaram", "Anna Alankaram", "Navaratna Alankaram",
        ],
    },
    "Homams / Havanas": {
        "": [
            "Ganapati Homam", "Sudarshana Homam", "Chandi Homam", "Ayushya Homam", "Dhanvantari Homam",
            "Lakshmi Kubera Homam", "Navagraha Homam", "Rudra Homam", "Mrityunjaya Homam", "Saraswati Homam",
            "Santana Gopala Homam", "Vastu Homam", "Durga Homam", "Lakshmi Homam", "Vishnu Homam",
            "Chaturveda Homam",
        ],
    },
    "Vratams": {
        "": [
            "Satyanarayana Vratham", "Vara Lakshmi Vratham", "Kedareswara Vratham", "Savitri Vratham",
            "Karadaiyan Nombu", "Ekadasi Puja", "Ganapathi Vratham", "Anantha Padmanabha Swamy Vratham",
            "Durga Vratham", "Vibhava Lakshmi Vratham", "Kartika Vratham",
        ],
    },
    "Samskaras (Life-Cycle Rituals)": {
        "": [
            "Garbhadhana", "Pumsavana", "Seemantham (Simantonnayana)", "Namakarana", "Annaprasana",
            "Aksharabhyasam (Vidyarambham)", "Chudakarana (Mundan)", "Karnavedha", "Upanayanam",
            "Vedarambham", "Samavartanam", "Vivaham (Marriage)", "Shashtipoorthi", "Bheemaratha Shanti",
            "Sathabhishekam",
        ],
    },
    "Antyeshti & Pitru Karmas": {
        "": [
            "Antyeshti", "Asthi Visarjanam", "Pinda Pradanam", "Masikam", "Varshikam", "Shraddham",
            "Tarpanam", "Pitru Shanti", "Narayana Bali", "Tripindi Shraddha",
        ],
    },
    "Temple Sevas": {
        "": [
            "Nitya Kainkaryam", "Archana", "Abhishekam", "Kalyanotsavam", "Utsava Seva", "Dolotsavam",
            "Pallaki Seva", "Garuda Seva", "Rathotsavam", "Teppotsavam", "Sahasra Deepalankarana",
        ],
    },
    "Vanta Brahmin (Religious Cooking Services)": {
        "": [
            "Temple Prasadam Preparation", "Naivedyam Preparation", "Wedding Feast Cooking",
            "Upanayanam Catering", "Sraddha Bhojanam", "Festival Food Preparation",
            "Vratham Food Preparation", "Satvik Cooking", "Large-scale Annadanam Cooking",
        ],
    },
    "Paricharaka (Temple Support Services)": {
        "": [
            "Temple Cleaning", "Sanctum Preparation", "Flower Decoration", "Garland Preparation",
            "Deepa Seva", "Naivedya Arrangement", "Bell Service", "Utsava Assistance", "Procession Support",
            "Temple Maintenance", "Prasadam Distribution", "Queue Management", "Temple Inventory Support",
        ],
    },
    "Parayanams": {
        "": [
            "Vishnu Sahasranamam", "Lalitha Sahasranamam", "Shiva Sahasranamam", "Aditya Hridayam",
            "Sundarakanda", "Bhagavad Gita", "Ramayana", "Devi Mahatmyam (Durga Saptashati)", "Rudram",
            "Chamakam", "Purusha Suktam", "Sri Suktam", "Narayana Suktam", "Medha Suktam",
        ],
    },
}


def build_service_seed() -> list[dict]:
    """Flattens SERVICE_CATALOG into poojas-collection docs with stable ids."""
    docs: list[dict] = []
    for cat_idx, (category, groups) in enumerate(SERVICE_CATALOG.items(), start=1):
        n = 0
        for subcategory, items in groups.items():
            for name in items:
                n += 1
                docs.append({
                    "id": f"svc-{cat_idx}-{n}",
                    "name": name,
                    "sanskrit_name": "",
                    "description": "",
                    "duration": "",
                    "price": 0,
                    "is_active": True,
                    "category": category,
                    "subcategory": subcategory or None,
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

    # Backfill busy=True for any priest with a pre-existing "Priest
    # Assigned" booking from before the busy flag existed, so they're
    # correctly excluded from new eligibility until they complete it.
    busy_priest_ids = await db.bookings.distinct("priest_id", {"status": "Priest Assigned"})
    if busy_priest_ids:
        await db.users.update_many({"id": {"$in": busy_priest_ids}}, {"$set": {"busy": True}})

    # Reset poojas seed (idempotent) + backfill is_active on any legacy docs
    await db.poojas.update_many({"is_active": {"$exists": False}}, {"$set": {"is_active": True}})
    existing_ids = {p["id"] for p in await db.poojas.find({}, {"id": 1, "_id": 0}).to_list(5000)}
    # Demo poojas (p1..p10) + the full 11-category priest service catalog.
    to_insert = [p for p in (POOJAS_SEED + SERVICE_SEED) if p["id"] not in existing_ids]
    if to_insert:
        await db.poojas.insert_many([dict(p) for p in to_insert])
    # Keep category/subcategory current on already-seeded catalog rows
    # (so a catalog tweak on restart is reflected without a manual wipe).
    for p in SERVICE_SEED:
        if p["id"] in existing_ids:
            await db.poojas.update_one(
                {"id": p["id"]},
                {"$set": {"name": p["name"], "category": p["category"],
                          "subcategory": p["subcategory"], "is_active": True}},
            )

    # Admin account
    admin_email = "admin@yagnika.com"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": "admin",
            "name": "Yagnika Admin",
            "email": admin_email,
            "mobile": "+91 00000 00000",
            "role": "admin",
            "is_active": True,
            "hashed_password": hash_password("Admin@123"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


@app.on_event("startup")
async def on_startup():
    await seed_database()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

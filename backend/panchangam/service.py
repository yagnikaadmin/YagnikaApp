"""Panchangam / Muhurtam / Kundali service layer.

Merges the three thin wrappers from the standalone Yagnika Panchangam service
(panchangam_service / muhurtam_service / kundalini_service). Parses inputs,
injects Hyderabad/IST defaults, and delegates the astronomy to panchangam.core.
No persistence — pure calculators.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from panchangam.panchangam import compute_panchangam
from panchangam.extended_panchangam import compute_festival_calendar
from panchangam.muhurtam import find_good_muhurtams, find_exclusion_ranges
from panchangam.kundalini import compute_kundalini_chart
from panchangam.sky_view import compute_sky_view
from panchangam.schemas import MuhurtamCheckRequest, KundaliniChartRequest

# Defaults: Hyderabad, IST — match the standalone service (config/settings.py).
DEFAULT_LATITUDE = float(os.environ.get("PANCHANGAM_DEFAULT_LAT", "17.3871"))
DEFAULT_LONGITUDE = float(os.environ.get("PANCHANGAM_DEFAULT_LON", "78.4917"))
DEFAULT_TZ_OFFSET_MIN = int(os.environ.get("PANCHANGAM_DEFAULT_TZ_MIN", "330"))

MAX_RANGE_DAYS = 90


def _loc(latitude, longitude, tz_offset_min):
    return (
        latitude if latitude is not None else DEFAULT_LATITUDE,
        longitude if longitude is not None else DEFAULT_LONGITUDE,
        tz_offset_min if tz_offset_min is not None else DEFAULT_TZ_OFFSET_MIN,
    )


def _parse_date(date_str: str | None) -> date:
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            pass
    tz = timezone(timedelta(minutes=DEFAULT_TZ_OFFSET_MIN))
    return datetime.now(tz).date()


# ---------- Panchangam ----------
def get_panchangam(
    date_str: str | None = None,
    calendar_type: str = "amanta",
    latitude: float | None = None,
    longitude: float | None = None,
    tz_offset_min: int | None = None,
) -> dict[str, Any]:
    target = _parse_date(date_str)
    lat, lon, tz = _loc(latitude, longitude, tz_offset_min)
    return compute_panchangam(target, lat, lon, tz, calendar_type)


def get_festival_calendar(
    year: int | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    tz_offset_min: int | None = None,
) -> dict[str, Any]:
    lat, lon, tz = _loc(latitude, longitude, tz_offset_min)
    yr = year if year is not None else datetime.now(timezone(timedelta(minutes=tz))).year
    return {"year": yr, "festivals": compute_festival_calendar(yr, lat, lon, tz)}


# ---------- Muhurtam ----------
def check_muhurtam(req: MuhurtamCheckRequest) -> dict[str, Any]:
    start = datetime.strptime(req.start_date, "%Y-%m-%d").date()
    end = datetime.strptime(req.end_date, "%Y-%m-%d").date()
    if end < start:
        start, end = end, start
    if (end - start).days > MAX_RANGE_DAYS:
        end = start + timedelta(days=MAX_RANGE_DAYS)

    system = req.system if req.system in ("chandramana", "souramana", "best") else "chandramana"
    lat, lon, tz = _loc(req.latitude, req.longitude, req.tz_offset_min)

    results = find_good_muhurtams(
        start_date=start,
        end_date=end,
        janma_nakshatra=req.janma_nakshatra,
        janma_rasi=req.janma_rasi,
        system=system,
        lat=lat,
        lon=lon,
        tz_offset_min=tz,
    )
    exclusion_ranges = find_exclusion_ranges(
        start_date=start, end_date=end, lat=lat, lon=lon, tz_offset_min=tz,
    )
    return {
        "system": system,
        "mode": "personal" if req.janma_nakshatra is not None else "general",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "results": results,
        "exclusion_ranges": exclusion_ranges,
    }


# ---------- Kundali ----------
def _resolve_birth(req: KundaliniChartRequest):
    birth_date = datetime.strptime(req.birth_date, "%Y-%m-%d").date()
    birth_time = datetime.strptime(req.birth_time, "%H:%M").time()
    lat, lon, tz = _loc(req.latitude, req.longitude, req.tz_offset_min)
    return birth_date, birth_time, lat, lon, tz


def compute_chart(req: KundaliniChartRequest) -> dict[str, Any]:
    birth_date, birth_time, lat, lon, tz = _resolve_birth(req)
    return compute_kundalini_chart(birth_date, birth_time, lat, lon, tz)


def compute_sky(req: KundaliniChartRequest) -> dict[str, Any]:
    at_date, at_time, lat, lon, tz = _resolve_birth(req)
    return compute_sky_view(at_date, at_time, lat, lon, tz)

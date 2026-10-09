"""Kundalini (natal Rasi/D1) chart — reuses the same graha-position and
lagna computation already built for the "Get Panchangam" book
(core/extended_panchangam.py, imported not modified), just evaluated at an
exact birth date/time/place instead of a day's sunrise.

South Indian style: houses are fixed by Rasi (not relative to the
ascendant), so the frontend just needs to place each of the 12 "houses"
entries into its fixed grid cell and mark whichever one is the ascendant.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone, timedelta
from typing import Any

from panchangam.panchangam import _julian_day_ut
from panchangam.extended_panchangam import compute_graha_positions, compute_lagna
from panchangam.muhurtam import RASI_NAMES

PLANET_ORDER = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"]


def compute_kundalini_chart(
    birth_date: date, birth_time: time, lat: float, lon: float, tz_offset_min: int
) -> dict[str, Any]:
    tz = timezone(timedelta(minutes=tz_offset_min))
    birth_dt = datetime.combine(birth_date, birth_time, tzinfo=tz)
    jd_ut = _julian_day_ut(birth_dt.astimezone(timezone.utc))

    positions = compute_graha_positions(jd_ut, lat, lon, tz)
    lagna = compute_lagna(jd_ut, lat, lon)
    asc_rashi_idx = RASI_NAMES.index(lagna["rashi"])

    planets: dict[str, Any] = {}
    houses: list[dict[str, Any]] = [{"rashi_index": i, "rashi": RASI_NAMES[i], "planets": []} for i in range(12)]

    for key in PLANET_ORDER:
        p = positions[key]
        rashi_idx = RASI_NAMES.index(p["rashi"])
        planets[key] = {
            "name": p["name"],
            "rashi_index": rashi_idx,
            "rashi": p["rashi"],
            "degree": p["degree"],
            "retrograde": p["retrograde"],
            "combust": p["combust"],
        }
        houses[rashi_idx]["planets"].append(key)

    return {
        "ascendant": {"rashi_index": asc_rashi_idx, "rashi": RASI_NAMES[asc_rashi_idx], "degree": lagna["degree"]},
        "planets": planets,
        "houses": houses,
    }

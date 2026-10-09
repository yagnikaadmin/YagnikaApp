"""Sky view: real topocentric azimuth/altitude for each graha, as they
would actually appear in the sky from a given place and moment — for the
Kundalini section's "view from Earth" visualization.

Deliberately a SEPARATE computation from core/kundalini.py's Vedic Rasi
chart: that chart is sidereal (ayanamsa-shifted, for the zodiac houses),
but a real physical sky position must stay tropical/geometric — shifting
it by the ayanamsa would point the planet at the wrong place in the sky.
So this module calls calc_ut without CalcFlags.SIDEREAL.

Rahu/Ketu have no physical body (they're the Moon's orbital nodes), so
"where they'd appear" is a symbolic projection of their calculated
ecliptic position onto the sky, not a claim that something is visible
there. Uses the same Body.TRUE_NODE convention as the Vedic chart
(core/extended_panchangam.py) for consistency between the two views.
"""
from __future__ import annotations

import math
from datetime import date, time, datetime, timezone, timedelta
from typing import Any

import swisseph_rs as swe

from panchangam.panchangam import eph, _julian_day_ut
from panchangam.extended_panchangam import PLANET_NAMES

PLANET_BODY = {
    "sun": swe.Body.SUN,
    "moon": swe.Body.MOON,
    "mars": swe.Body.MARS,
    "mercury": swe.Body.MERCURY,
    "jupiter": swe.Body.JUPITER,
    "venus": swe.Body.VENUS,
    "saturn": swe.Body.SATURN,
}
NODE_BODY = swe.Body.TRUE_NODE

_FLAGS = swe.CalcFlags.SWIEPH  # tropical/geometric — no SIDEREAL bit


def _subsolar_point(sun_ecl_lon: float, sun_ecl_lat: float, eps_true_deg: float, armc_deg: float, request_lon: float) -> dict[str, float]:
    """Geographic (lat, lon) of the point on Earth where the Sun is
    directly overhead right now — the real day/night terminator's "noon"
    point, for the Astral World Phase 2 cinematic Earth. Derived from the
    same tropical Sun position + true obliquity + ARMC already computed
    above for the az/alt conversion (ARMC at a known longitude gives GMST,
    since ARMC = GMST + geographic longitude — no separate sidereal-time
    lookup needed)."""
    lam = math.radians(sun_ecl_lon)
    beta = math.radians(sun_ecl_lat)
    eps = math.radians(eps_true_deg)
    ra = math.degrees(math.atan2(
        math.sin(lam) * math.cos(eps) - math.tan(beta) * math.sin(eps),
        math.cos(lam),
    )) % 360.0
    dec = math.degrees(math.asin(
        math.sin(beta) * math.cos(eps) + math.cos(beta) * math.sin(eps) * math.sin(lam)
    ))
    gmst_deg = (armc_deg - request_lon) % 360.0
    subsolar_lon = ((ra - gmst_deg + 180.0) % 360.0) - 180.0
    return {"lat": round(dec, 3), "lon": round(subsolar_lon, 3)}


def compute_sky_view(
    at_date: date, at_time: time, lat: float, lon: float, tz_offset_min: int
) -> dict[str, Any]:
    tz = timezone(timedelta(minutes=tz_offset_min))
    dt_local = datetime.combine(at_date, at_time, tzinfo=tz)
    jd_ut = _julian_day_ut(dt_local.astimezone(timezone.utc))

    # True obliquity of date, and ARMC (sidereal time as an angle) — the
    # two extra ingredients swe_azalt needs on top of each body's own
    # ecliptic position to resolve it into a horizon (az/alt) direction
    # for this specific place and moment.
    eps_true = eph.calc_ut(jd_ut, swe.Body.ECLIPTIC_NUTATION, _FLAGS).data[0]
    armc = eph.houses(jd_ut, lat, lon, swe.HouseSystem.WHOLE_SIGN).ascmc.armc
    geopos = (lon, lat, 0.0)

    def to_az_alt(ecl_lon: float, ecl_lat: float) -> dict[str, Any]:
        az, _true_alt, app_alt = swe.azalt.azalt(
            swe.AzAltDir.ECL_TO_HOR, armc, eps_true, geopos,
            1013.25, 15.0, 0.0065, (ecl_lon, ecl_lat),
        )
        # swe_azalt measures azimuth from the South point, clockwise —
        # convert to the standard compass bearing (0=North, 90=East)
        # the frontend/user actually expects.
        compass_az = (az + 180.0) % 360.0
        return {
            "azimuth": round(compass_az, 2),
            "altitude": round(app_alt, 2),
            "above_horizon": app_alt > 0,
        }

    planets: dict[str, Any] = {}
    sun_lon_lat: tuple[float, float] | None = None
    for key, body in PLANET_BODY.items():
        lon_lat = eph.calc_ut(jd_ut, body, _FLAGS).data
        if key == "sun":
            sun_lon_lat = (lon_lat[0], lon_lat[1])
        planets[key] = {"name": PLANET_NAMES[key], **to_az_alt(lon_lat[0], lon_lat[1])}

    rahu_lon = eph.calc_ut(jd_ut, NODE_BODY, _FLAGS).data[0]
    planets["rahu"] = {"name": PLANET_NAMES["rahu"], **to_az_alt(rahu_lon, 0.0)}
    planets["ketu"] = {"name": PLANET_NAMES["ketu"], **to_az_alt((rahu_lon + 180.0) % 360.0, 0.0)}

    subsolar = _subsolar_point(sun_lon_lat[0], sun_lon_lat[1], eps_true, armc, lon)

    return {"planets": planets, "subsolar": subsolar}

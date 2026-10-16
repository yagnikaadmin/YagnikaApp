"""Muhurtam checker — good-window finder for the Yagnika Panchangam site.

Adapted from a user-supplied reference script. Reuses this app's existing
precise Lahiri-sidereal ephemeris (`core/panchangam.py`, imported not
modified) so results agree with the panchangam shown elsewhere on the site,
instead of the reference script's linear-approximation ayanamsa and fixed
per-weekday clock tables for Rahu Kalam / Durmuhurtam. Varjyam uses the
reference script's nakshatra-degree method, which is more traditionally
accurate than this app's existing sunrise-offset placeholder.

Pure calculation only — nothing is persisted; there is no booking/storage
of any kind here.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from astral import LocationInfo
from astral.sun import sun
from swisseph_rs import Body, CalcFlags, HouseSystem

from panchangam.panchangam import (
    eph,
    _julian_day_ut,
    _sun_moon_longitudes,
    compute_panchangam,
    NAKSHATRA_NAMES,
    PAKSHA_NAMES,
    TITHI_NAMES,
    RAHUKALAM_SEGMENT,
    _fmt_time,
)


RASI_NAMES = [
    {"en": "Mesha (Aries)", "te": "మేషం", "hi": "मेष", "ta": "மேஷம்", "kn": "ಮೇಷ", "ml": "മേഷം"},
    {"en": "Vrishabha (Taurus)", "te": "వృషభం", "hi": "वृषभ", "ta": "ரிஷபம்", "kn": "ವೃಷಭ", "ml": "വൃഷഭം"},
    {"en": "Mithuna (Gemini)", "te": "మిథునం", "hi": "मिथुन", "ta": "மிதுனம்", "kn": "ಮಿಥುನ", "ml": "മിഥുനം"},
    {"en": "Karka (Cancer)", "te": "కర్కాటకం", "hi": "कर्क", "ta": "கடகம்", "kn": "ಕರ್ಕಾಟಕ", "ml": "കർക്കടകം"},
    {"en": "Simha (Leo)", "te": "సింహం", "hi": "सिंह", "ta": "சிம்மம்", "kn": "ಸಿಂಹ", "ml": "ചിങ്ങം"},
    {"en": "Kanya (Virgo)", "te": "కన్య", "hi": "कन्या", "ta": "கன்னி", "kn": "ಕನ್ಯಾ", "ml": "കന്നി"},
    {"en": "Tula (Libra)", "te": "తుల", "hi": "तुला", "ta": "துலாம்", "kn": "ತುಲಾ", "ml": "തുലാം"},
    {"en": "Vrischika (Scorpio)", "te": "వృశ్చికం", "hi": "वृश्चिक", "ta": "விருச்சிகம்", "kn": "ವೃಶ್ಚಿಕ", "ml": "വൃശ്ചികം"},
    {"en": "Dhanu (Sagittarius)", "te": "ధనుస్సు", "hi": "धनु", "ta": "தனுசு", "kn": "ಧನು", "ml": "ധനു"},
    {"en": "Makara (Capricorn)", "te": "మకరం", "hi": "मकर", "ta": "மகரம்", "kn": "ಮಕರ", "ml": "മകരം"},
    {"en": "Kumbha (Aquarius)", "te": "కుంభం", "hi": "कुंभ", "ta": "கும்பம்", "kn": "ಕುಂಭ", "ml": "കുംഭം"},
    {"en": "Meena (Pisces)", "te": "మీనం", "hi": "मीन", "ta": "மீனம்", "kn": "ಮೀನ", "ml": "മീനం"},
]

# Sun's rashi (0-indexed) considered inauspicious for new beginnings in Souramana.
RESTRICTED_SOLAR_RASHI = {3, 8, 11}  # Karka, Dhanu, Meena

TARAS = {
    1: ("Janma Tara", False), 2: ("Sampat Tara", True),
    3: ("Vipat Tara", False), 4: ("Kshema Tara", True),
    5: ("Pratyak Tara", False), 6: ("Sadhana Tara", True),
    7: ("Naidhana Tara", False), 8: ("Mitra Tara", True),
    9: ("Parama Mitra Tara", True),
}

PANCHAKAMS = {
    1: "Mrityu Panchakam", 2: "Agni Panchakam", 4: "Raja Panchakam",
    6: "Chora Panchakam", 8: "Roga Panchakam",
    3: "Favorable", 5: "Favorable", 7: "Favorable", 0: "Favorable",
}

RIKTA_TITHIS = {4, 9, 14}

# User-specified additional exclusions on top of the classical Rikta group:
# Sasthi, Ashtami, and Dwadasi are excluded outright (not just in specific
# Vara combinations), applied to both personal and general muhurtam checks.
EXCLUDED_TITHIS = RIKTA_TITHIS | {6, 8, 12}
TITHI_EXCLUSION_LABEL = {
    4: "Chaturthi (Chavithi)", 6: "Shashti (Sasthi)", 8: "Ashtami",
    9: "Navami", 12: "Dwadashi", 14: "Chaturdashi",
}

# (direct-motion orb, retrograde orb) in degrees from the Sun — same
# Parashara/BPHS values used by core/extended_panchangam.py's combustion
# check. Duplicated here (not imported) because extended_panchangam.py
# itself imports from this module, and importing back would be circular.
MOODAM_ORB = {"jupiter": (11.0, 11.0), "venus": (10.0, 8.0)}
MOODAM_LABEL = {"jupiter": "Guru Moodam", "venus": "Sukra Moodam"}

# Keyed on the exact masa "en" names core/panchangam.py's MASA_NAMES produces.
SHUNYA_TITHIS = {
    "Chaitra": (8, 9), "Vaiśākha": (1, 2), "Jyeṣṭha": (13, 4),
    "Āṣāḍha": (6, 7), "Śrāvaṇa": (2, 3), "Bhādrapada": (11, 12),
    "Āśvina": (10, 11), "Kārtika": (14, 5), "Mārgaśīrṣa": (7, 8),
    "Pauṣa": (4, 5), "Māgha": (5, 6), "Phālguna": (3, 4),
}

# Durmuhurtam and Varjyam are not recomputed here: they come from
# compute_panchangam's exact `kala_periods` (night Durmuhurtam included,
# Varjyam scaled to each nakshatra's real length), so this module and the
# panchangam shown in the app can never drift apart.


@dataclass
class DailyAstro:
    target_date: date
    tz: timezone
    sunrise: datetime
    sunset: datetime
    jd_sunrise: float
    sun_lon: float
    moon_lon: float
    tithi_idx: int  # 0..29 (matches core.panchangam.TITHI_NAMES indexing)
    tithi_1_15: int
    paksha: str  # "Shukla" | "Krishna"
    nakshatra_1_27: int
    moon_rasi_1_12: int
    sun_rashi_0_11: int
    vara_1_7: int  # Sunday=1 .. Saturday=7 (reference script's convention)
    weekday_mon0: int  # Monday=0 .. Sunday=6 (core.panchangam's convention)
    chandramana_masa: dict[str, str]  # {"en": ..., "te": ...}
    is_adhika_masa: bool
    kala_periods: dict[str, list[tuple[datetime, datetime]]]  # exact periods from compute_panchangam


def _get_daily_astro(target_date: date, lat: float, lon: float, tz_offset_min: int) -> DailyAstro:
    tz = timezone(timedelta(minutes=tz_offset_min))
    loc = LocationInfo("here", "in", "UTC", lat, lon)
    try:
        s = sun(loc.observer, date=target_date, tzinfo=tz)
        sunrise, sunset = s["sunrise"], s["sunset"]
    except Exception:
        sunrise = datetime.combine(target_date, time(6, 0), tzinfo=tz)
        sunset = datetime.combine(target_date, time(18, 0), tzinfo=tz)

    sunrise_utc = sunrise.astimezone(timezone.utc)
    jd = _julian_day_ut(sunrise_utc)
    sun_lon, moon_lon = _sun_moon_longitudes(jd)

    diff = (moon_lon - sun_lon) % 360
    tithi_idx = int(diff / 12)
    tithi_1_15 = (tithi_idx % 15) + 1
    paksha = "Shukla" if tithi_idx < 15 else "Krishna"

    nakshatra_1_27 = int(moon_lon / (360.0 / 27)) + 1
    moon_rasi_1_12 = int(moon_lon / 30) + 1
    sun_rashi_0_11 = int(sun_lon / 30)

    vara_1_7 = target_date.isoweekday() % 7 + 1
    weekday_mon0 = target_date.weekday()

    chandramana = compute_panchangam(target_date, lat, lon, tz_offset_min, "amanta")

    return DailyAstro(
        target_date=target_date, tz=tz, sunrise=sunrise, sunset=sunset,
        jd_sunrise=jd, sun_lon=sun_lon, moon_lon=moon_lon,
        tithi_idx=tithi_idx, tithi_1_15=tithi_1_15, paksha=paksha,
        nakshatra_1_27=nakshatra_1_27, moon_rasi_1_12=moon_rasi_1_12,
        sun_rashi_0_11=sun_rashi_0_11, vara_1_7=vara_1_7, weekday_mon0=weekday_mon0,
        chandramana_masa=chandramana["general"]["masa"],
        is_adhika_masa=chandramana["general"]["is_adhika_masa"],
        kala_periods={
            key: [(datetime.fromisoformat(pp["start"]), datetime.fromisoformat(pp["end"])) for pp in periods]
            for key, periods in chandramana["kala_periods"].items()
        },
    )


def _get_rahu_kalam(d: DailyAstro) -> tuple[datetime, datetime]:
    day_seg = (d.sunset - d.sunrise) / 8
    i = RAHUKALAM_SEGMENT[d.weekday_mon0]
    return d.sunrise + day_seg * (i - 1), d.sunrise + day_seg * i


def _get_durmuhurtam(d: DailyAstro) -> list[tuple[datetime, datetime]]:
    return d.kala_periods["durmuhurta"]


def _get_varjyam(d: DailyAstro) -> list[tuple[datetime, datetime]]:
    return d.kala_periods["varjyam"]


def _subtract_intervals(
    window: tuple[datetime, datetime], exclusions: list[tuple[datetime, datetime]]
) -> list[tuple[datetime, datetime]]:
    valid = [window]
    for ex_start, ex_end in exclusions:
        new_valid = []
        for w_start, w_end in valid:
            if ex_end <= w_start or ex_start >= w_end:
                new_valid.append((w_start, w_end))
            else:
                if w_start < ex_start:
                    new_valid.append((w_start, ex_start))
                if ex_end < w_end:
                    new_valid.append((ex_end, w_end))
        valid = new_valid
    return valid


def _check_tara_balam(janma_nakshatra: int, muhurtam_nakshatra: int) -> tuple[bool, str]:
    distance = (muhurtam_nakshatra - janma_nakshatra + 27) % 27 + 1
    tara_num = distance % 9 or 9
    name, ok = TARAS[tara_num]
    return ok, f"{name} ({'Good' if ok else 'Avoid'})"


def _check_chandra_balam(janma_rasi: int, moon_rasi: int, paksha: str) -> tuple[bool, str]:
    distance = (moon_rasi - janma_rasi + 12) % 12 + 1
    favorable = {1, 2, 3, 5, 6, 7, 9, 10, 11} if paksha == "Shukla" else {1, 3, 4, 6, 7, 8, 10, 11, 12}
    ok = distance in favorable
    return ok, f"Moon in House {distance} ({'Favorable' if ok else 'Unfavorable'})"


def _check_tithi_and_vara(
    tithi_1_15: int, vara_1_7: int, masa_en: str, paksha: str, is_adhika_masa: bool = False
) -> tuple[bool, str]:
    # Adhika Masa (the intercalary lunar month) is excluded outright for
    # auspicious events in the Chandramana system — this only ever fires
    # when the caller actually passes is_adhika_masa=True, which happens
    # for the chandramana-masa-based checks only; Souramana has no concept
    # of Adhika Masa and never passes this flag.
    if is_adhika_masa:
        return False, "Adhika Masa is excluded for auspicious events."
    if vara_1_7 == 3:
        return False, "Tuesday is universally avoided."
    if tithi_1_15 in EXCLUDED_TITHIS:
        return False, f"Tithi {tithi_1_15} ({TITHI_EXCLUSION_LABEL[tithi_1_15]}) is excluded for auspicious events."
    if tithi_1_15 == 1 and paksha == "Shukla":
        return False, "Padyami immediately after Amavasya is excluded for auspicious events."
    if tithi_1_15 == 15 and paksha == "Krishna":
        return False, "Amavasya is excluded for auspicious events."
    if tithi_1_15 == 11 and vara_1_7 in (1, 3):
        return False, f"Tithi {tithi_1_15} on this Vara is a Mrityu Tithi."
    if masa_en and masa_en in SHUNYA_TITHIS:
        shunya_shukla, shunya_krishna = SHUNYA_TITHIS[masa_en]
        target = shunya_shukla if paksha == "Shukla" else shunya_krishna
        if tithi_1_15 == target:
            return False, f"Tithi {tithi_1_15} is Shunya (Void) for {masa_en}."
    return True, "Tithi and Vara are acceptable."


def _is_combust(jd_sunrise: float, sun_lon: float, key: str, body: Body) -> bool:
    flags = CalcFlags.SIDEREAL | CalcFlags.SWIEPH | CalcFlags.SPEED
    res = eph.calc_ut(jd_sunrise, body, flags)
    lon_deg, speed = res.data[0] % 360, res.data[3]
    orb = MOODAM_ORB[key][1 if speed < 0 else 0]
    sep = abs(((lon_deg - sun_lon + 180) % 360) - 180)
    return sep <= orb


def _check_moodam(jd_sunrise: float, sun_lon: float) -> tuple[bool, str]:
    """Guru Moodam / Sukra Moodam — Jupiter or Venus combust (too close to
    the Sun) is inauspicious for starting new ventures, regardless of
    system (chandramana/souramana/best)."""
    for key, body in (("jupiter", Body.JUPITER), ("venus", Body.VENUS)):
        if _is_combust(jd_sunrise, sun_lon, key, body):
            return False, f"{MOODAM_LABEL[key]} — {key.capitalize()} is combust."
    return True, "No Guru/Sukra Moodam."


def _check_mahalaya_paksham(masa_en: str, paksha: str, tithi_1_15: int, prev_masa_en: str | None) -> tuple[bool, str]:
    # Only the Krishna Paksha of Bhadrapada is excluded (Mahalaya Paksham) —
    # unlike Adhika Masa, which excludes the whole month, the Shukla Paksha
    # of Bhadrapada remains eligible.
    #
    # core/panchangam.py's masa-name assignment can flip to the new masa
    # name a day early specifically on the Amavasya (tithi 15) that ENDS a
    # Krishna Paksha, before the following Shukla Pratipada — e.g. in 2026
    # Sep 11 (Amavasya ending Śrāvaṇa's Krishna Paksha) is itself labeled
    # "Bhādrapada", one day ahead of Sep 12's Shukla Pratipada. That makes
    # an isolated single day look like "Bhādrapada Krishna Paksha" even
    # though the 14 days before it were genuinely Śrāvaṇa. Guard against
    # that false positive: only trust a Krishna-Paksha Amavasya (tithi 15)
    # as real Mahalaya Paksham if the day before it was already Bhādrapada
    # too (i.e. it's the tail of a real multi-day run, not an isolated
    # boundary artifact).
    if masa_en == "Bhādrapada" and paksha == "Krishna":
        if tithi_1_15 == 15 and prev_masa_en != "Bhādrapada":
            return True, "Not Mahalaya Paksham."
        return False, "Mahalaya Paksham is excluded for auspicious events."
    return True, "Not Mahalaya Paksham."


def _check_souramana_masam(sun_rashi_0_11: int) -> tuple[bool, str]:
    if sun_rashi_0_11 in RESTRICTED_SOLAR_RASHI:
        return False, f"{RASI_NAMES[sun_rashi_0_11]['en']} Masa is generally restricted in Souramana."
    return True, f"{RASI_NAMES[sun_rashi_0_11]['en']} Masa is acceptable."


def _check_panchaka_rahitam(tithi_1_15: int, vara_1_7: int, nakshatra_1_27: int, lagna_1_12: int) -> tuple[bool, str]:
    remainder = (tithi_1_15 + vara_1_7 + nakshatra_1_27 + lagna_1_12) % 9
    status = PANCHAKAMS[remainder]
    return remainder in (3, 5, 7, 0), status


def _lagna_at(dt: datetime, lat: float, lon: float) -> int:
    """Sidereal (Lahiri) ascendant rasi, 1-12, at instant `dt`."""
    jd = _julian_day_ut(dt.astimezone(timezone.utc))
    asc_trop = eph.houses(jd, lat, lon, HouseSystem.WHOLE_SIGN).ascmc.ascendant
    ayanamsa = eph.get_ayanamsa_ut(jd, CalcFlags.SWIEPH)
    return int(((asc_trop - ayanamsa) % 360.0) / 30) + 1


def _get_lagna_windows(d: DailyAstro, lat: float, lon: float) -> list[tuple[datetime, datetime, int]]:
    """The day's actual lagna spans (00:00 -> 24:00 local), as (start, end,
    rasi_1_12). Each lagna lasts roughly 1.5-2.5h and its start time shifts
    every day, so the boundaries are found by scanning in 10-minute steps and
    bisecting each change down to the second — not fixed 2-hour clock slots."""
    day_start = datetime.combine(d.target_date, time(0, 0), tzinfo=d.tz)
    day_end = day_start + timedelta(days=1)
    step = timedelta(minutes=10)
    windows = []
    w_start, cur_lagna = day_start, _lagna_at(day_start, lat, lon)
    t = day_start
    while t < day_end:
        nxt = min(t + step, day_end)
        lg = _lagna_at(nxt, lat, lon) if nxt < day_end else cur_lagna
        if lg != cur_lagna:
            lo, hi = t, nxt
            while (hi - lo).total_seconds() > 1:
                mid = lo + (hi - lo) / 2
                if _lagna_at(mid, lat, lon) == cur_lagna:
                    lo = mid
                else:
                    hi = mid
            windows.append((w_start, hi, cur_lagna))
            w_start, cur_lagna = hi, lg
        t = nxt
    windows.append((w_start, day_end, cur_lagna))
    return windows


def find_good_muhurtams(
    start_date: date,
    end_date: date,
    janma_nakshatra: int | None,
    janma_rasi: int | None,
    system: str,
    lat: float,
    lon: float,
    tz_offset_min: int,
) -> list[dict[str, Any]]:
    """Scan [start_date, end_date] and return per-day good-muhurtam results.

    A date is included only if the day-level checks (tara balam, chandra
    balam, tithi/vara, solar-month restriction for souramana/best, Guru/
    Sukra Moodam, and Mahalaya Paksham) all pass, AND at least one 2-hour
    lagna window that day passes panchaka rahitam and has >=10 minutes free
    after excluding Rahu Kalam, Durmuhurtam and Varjyam.

    janma_nakshatra/janma_rasi are optional: pass both for a personal
    muhurtam (gated on that person's Tara Balam/Chandra Balam too); pass
    neither for a General/Group muhurtam (e.g. a class starting, a group
    event with no single individual to check against) — Tara Balam and
    Chandra Balam are simply skipped, every other check still applies.

    Guru/Sukra Moodam and Mahalaya Paksham days are excluded from results
    here, but *why* is reported separately by find_exclusion_ranges (as
    continuous date ranges, independent of Tara Balam/Chandra Balam) rather
    than here, so the UI can show one banner per period instead of a
    scattered list of the individual dates that happened to also pass
    Tara Balam/Chandra Balam/Tithi.
    """
    results: list[dict[str, Any]] = []
    current = start_date
    prev_masa_en: str | None = None
    # Yesterday's Varjyam can run past midnight into today's early lagnas.
    prev_varjyam = _get_varjyam(_get_daily_astro(start_date - timedelta(days=1), lat, lon, tz_offset_min))

    while current <= end_date:
        d = _get_daily_astro(current, lat, lon, tz_offset_min)

        if janma_nakshatra is not None:
            tara_ok, tara_msg = _check_tara_balam(janma_nakshatra, d.nakshatra_1_27)
        else:
            tara_ok, tara_msg = True, "General muhurtam — no personal Tara Balam check."
        if janma_rasi is not None:
            chandra_ok, chandra_msg = _check_chandra_balam(janma_rasi, d.moon_rasi_1_12, d.paksha)
        else:
            chandra_ok, chandra_msg = True, "General muhurtam — no personal Chandra Balam check."
        moodam_ok, moodam_msg = _check_moodam(d.jd_sunrise, d.sun_lon)
        mahalaya_ok, mahalaya_msg = _check_mahalaya_paksham(
            d.chandramana_masa["en"], d.paksha, d.tithi_1_15, prev_masa_en
        )

        if system == "souramana":
            tv_ok, tv_msg = _check_tithi_and_vara(d.tithi_1_15, d.vara_1_7, "", d.paksha)
            solar_ok, solar_msg = _check_souramana_masam(d.sun_rashi_0_11)
            day_ok = tv_ok and solar_ok
        elif system == "best":
            tv_ok_c, tv_msg = _check_tithi_and_vara(
                d.tithi_1_15, d.vara_1_7, d.chandramana_masa["en"], d.paksha, d.is_adhika_masa
            )
            tv_ok_s, _ = _check_tithi_and_vara(d.tithi_1_15, d.vara_1_7, "", d.paksha)
            solar_ok, solar_msg = _check_souramana_masam(d.sun_rashi_0_11)
            day_ok = tv_ok_c and tv_ok_s and solar_ok
        else:  # chandramana
            tv_ok, tv_msg = _check_tithi_and_vara(
                d.tithi_1_15, d.vara_1_7, d.chandramana_masa["en"], d.paksha, d.is_adhika_masa
            )
            solar_ok, solar_msg = True, ""
            day_ok = tv_ok

        if tara_ok and chandra_ok and day_ok and moodam_ok and mahalaya_ok:
            rahu_s, rahu_e = _get_rahu_kalam(d)
            durm = _get_durmuhurtam(d)
            exclusions = [(rahu_s, rahu_e)] + _get_varjyam(d) + prev_varjyam + durm

            windows_out = []
            for w_start, w_end, lagna_1_12 in _get_lagna_windows(d, lat, lon):
                panchaka_ok, panchaka_status = _check_panchaka_rahitam(
                    d.tithi_1_15, d.vara_1_7, d.nakshatra_1_27, lagna_1_12
                )
                if not panchaka_ok:
                    continue
                safe = [
                    (s, e) for s, e in _subtract_intervals((w_start, w_end), exclusions)
                    if (e - s).total_seconds() >= 600
                ]
                if safe:
                    windows_out.append({
                        "start": _fmt_time(w_start),
                        "end": _fmt_time(w_end),
                        "lagna": RASI_NAMES[lagna_1_12 - 1],
                        "panchaka_status": panchaka_status,
                        # start_24h lets the frontend request a Kundalini/Lagna chart for
                        # this exact safe slot (via the existing /kundalini/chart endpoint,
                        # keyed on this date + time instead of a birth date) so a priest can
                        # verify the actual chart for the muhurtam moment, not just the label.
                        "safe_slots": [
                            {"start": _fmt_time(s), "end": _fmt_time(e), "start_24h": s.strftime("%H:%M")}
                            for s, e in safe
                        ],
                    })

            if windows_out:
                tithi_idx_display = d.tithi_idx
                results.append({
                    "date": current.isoformat(),
                    "weekday": current.weekday(),
                    "masa": d.chandramana_masa,
                    "solar_rashi": RASI_NAMES[d.sun_rashi_0_11],
                    "paksha": PAKSHA_NAMES[0] if d.paksha == "Shukla" else PAKSHA_NAMES[1],
                    "tithi": TITHI_NAMES[tithi_idx_display],
                    "nakshatra": NAKSHATRA_NAMES[d.nakshatra_1_27 - 1],
                    "moon_rasi": RASI_NAMES[d.moon_rasi_1_12 - 1],
                    "checks": {
                        "tara_balam": tara_msg,
                        "chandra_balam": chandra_msg,
                        "tithi_vara": tv_msg,
                        "solar_masa": solar_msg,
                        "moodam": moodam_msg,
                        "mahalaya_paksham": mahalaya_msg,
                    },
                    "excluded": {
                        "rahu_kalam": f"{_fmt_time(rahu_s)} - {_fmt_time(rahu_e)}",
                        "durmuhurtam": " / ".join(f"{_fmt_time(s)} - {_fmt_time(e)}" for s, e in durm),
                        "varjyam": " / ".join(f"{_fmt_time(s)} - {_fmt_time(e)}" for s, e in _get_varjyam(d)) or "---",
                    },
                    "windows": windows_out,
                })

        prev_masa_en = d.chandramana_masa["en"]
        prev_varjyam = _get_varjyam(d)
        current += timedelta(days=1)

    return results


def _find_continuous_ranges(day_flags: list[tuple[date, bool]]) -> list[tuple[date, date]]:
    ranges: list[tuple[date, date]] = []
    start: date | None = None
    prev: date | None = None
    for d, flag in day_flags:
        if flag and start is None:
            start = d
        if not flag and start is not None:
            ranges.append((start, prev))
            start = None
        prev = d
    if start is not None:
        ranges.append((start, prev))
    return ranges


def find_exclusion_ranges(
    start_date: date, end_date: date, lat: float, lon: float, tz_offset_min: int,
) -> dict[str, list[dict[str, str]]]:
    """Continuous Guru Moodam / Sukra Moodam / Mahalaya Paksham ranges
    touching [start_date, end_date] — independent of Tara Balam, Chandra
    Balam or Tithi/Vara, unlike the per-day gating in find_good_muhurtams.
    Lets the UI show one banner per real astronomical period (e.g.
    "Jul 15 - Aug 13") instead of a scattered list of individual dates.
    A range's reported start/end is clipped to [start_date, end_date] if
    the real period extends beyond whatever the caller searched.
    """
    guru_days: list[tuple[date, bool]] = []
    sukra_days: list[tuple[date, bool]] = []
    mahalaya_days: list[tuple[date, bool]] = []
    prev_masa_en: str | None = None

    current = start_date
    while current <= end_date:
        d = _get_daily_astro(current, lat, lon, tz_offset_min)
        guru_days.append((current, _is_combust(d.jd_sunrise, d.sun_lon, "jupiter", Body.JUPITER)))
        sukra_days.append((current, _is_combust(d.jd_sunrise, d.sun_lon, "venus", Body.VENUS)))
        mahalaya_ok, _ = _check_mahalaya_paksham(d.chandramana_masa["en"], d.paksha, d.tithi_1_15, prev_masa_en)
        mahalaya_days.append((current, not mahalaya_ok))
        prev_masa_en = d.chandramana_masa["en"]
        current += timedelta(days=1)

    def _fmt(ranges: list[tuple[date, date]]) -> list[dict[str, str]]:
        return [{"start": s.isoformat(), "end": e.isoformat()} for s, e in ranges]

    return {
        "guru_moodam": _fmt(_find_continuous_ranges(guru_days)),
        "sukra_moodam": _fmt(_find_continuous_ranges(sukra_days)),
        "mahalaya_paksham": _fmt(_find_continuous_ranges(mahalaya_days)),
    }

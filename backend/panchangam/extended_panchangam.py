"""Extended Panchangam details — planetary positions, Choghadiya, Hora,
Gowri Panchangam, Nakshatra attributes, Disha Shoola, and tithi-special-day
flags — shown in the "Get Panchangam" book alongside the existing daily
Panchangam (core/panchangam.py, imported not modified).

Every rule table here was cross-checked against published references
(drikpanchang.com's Choghadiya/Hora/Gowri Panchangam pages, and standard
Vedic-astrology combustion-orb and nakshatra tables) before being hardcoded,
because getting the *lookup tables* right matters more than the arithmetic.
Items with only moderate confidence in their exact classical definition
(named yogas like Ravi Yoga/Amrita Siddhi Yoga, Panchaka Dosha, Dagdha Yoga,
personalized Tarabalam/Chandrabalam which need a birth star not collected
here, temple-specific content) were deliberately left out rather than
guessed at.

Major pan-India + Telugu-regional festivals ARE covered — matched against a
fixed Amanta masa reference regardless of the request's calendar_type, so a
festival's presence doesn't depend on which calendar tab is selected.
Each festival's governing tithi is resolved to its exact [start, end) UTC
span in core/panchangam.py (_compute_tithi_festival_spans), and the
festival is shown on *every* civil day that span touches — usually one day,
but a tithi that starts mid-day and runs past local midnight touches two.
Rather than pick a single "correct" day via a kaal-specific rule (Madhyahna/
Nishita/Aparahna/Pradosh — which sources and traditions genuinely disagree
on for edge cases), the actual tithi start/end time is shown alongside the
name so the exact astronomical timing is transparent either way.

Language keys follow core/panchangam.py's convention: en, te, hi, ta, kn, ml.
Same best-effort/native-review caveat as that file's name tables applies to
the transliterations here (deity names especially).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from astral import LocationInfo
from astral.sun import sun as astral_sun
from swisseph_rs import Body, CalcFlags, HouseSystem, RiseSetFlags

from panchangam.panchangam import eph, _fmt_time, _compute_tithi_festival_spans, _find_sankranti
from panchangam.muhurtam import RASI_NAMES

J2000_EPOCH = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

# ---------------------------------------------------------------- Planets --
PLANET_NAMES = {
    "sun": {"en": "Sun", "te": "సూర్యుడు", "hi": "सूर्य", "ta": "சூரியன்", "kn": "ಸೂರ್ಯ", "ml": "സൂര്യൻ"},
    "moon": {"en": "Moon", "te": "చంద్రుడు", "hi": "चन्द्र", "ta": "சந்திரன்", "kn": "ಚಂದ್ರ", "ml": "ചന്ദ്രൻ"},
    "mars": {"en": "Mars", "te": "కుజుడు", "hi": "मंगल", "ta": "செவ்வாய்", "kn": "ಕುಜ", "ml": "ചൊവ്വ"},
    "mercury": {"en": "Mercury", "te": "బుధుడు", "hi": "बुध", "ta": "புதன்", "kn": "ಬುಧ", "ml": "ബുധൻ"},
    "jupiter": {"en": "Jupiter", "te": "గురుడు", "hi": "गुरु", "ta": "குரு", "kn": "ಗುರು", "ml": "വ്യാഴം"},
    "venus": {"en": "Venus", "te": "శుక్రుడు", "hi": "शुक्र", "ta": "சுக்கிரன்", "kn": "ಶುಕ್ರ", "ml": "ശുക്രൻ"},
    "saturn": {"en": "Saturn", "te": "శని", "hi": "शनि", "ta": "சனி", "kn": "ಶನಿ", "ml": "ശനി"},
    "rahu": {"en": "Rahu", "te": "రాహువు", "hi": "राहु", "ta": "ராகு", "kn": "ರಾಹು", "ml": "രാഹു"},
    "ketu": {"en": "Ketu", "te": "కేతువు", "hi": "केतु", "ta": "கேது", "kn": "ಕೇತು", "ml": "കേതു"},
}

PLANET_BODY_MAP = {
    "sun": Body.SUN, "moon": Body.MOON, "mars": Body.MARS, "mercury": Body.MERCURY,
    "jupiter": Body.JUPITER, "venus": Body.VENUS, "saturn": Body.SATURN,
}

# (direct-motion orb, retrograde orb) in degrees from the Sun. Standard
# Parashara/BPHS values; Sun/Moon/Rahu/Ketu are never combust.
COMBUSTION_ORB = {
    "moon": (12.0, 12.0), "mars": (17.0, 17.0), "mercury": (14.0, 12.0),
    "jupiter": (11.0, 11.0), "venus": (10.0, 8.0), "saturn": (15.0, 15.0),
}

RISE_SET_BODIES = {
    "mars": Body.MARS, "mercury": Body.MERCURY, "jupiter": Body.JUPITER,
    "venus": Body.VENUS, "saturn": Body.SATURN,
}


def _calc_sidereal(jd_ut: float, body: Body) -> tuple[float, float]:
    flags = CalcFlags.SIDEREAL | CalcFlags.SWIEPH | CalcFlags.SPEED
    res = eph.calc_ut(jd_ut, body, flags)
    return res.data[0] % 360, res.data[3]


def _rise_set(jd_start: float, lat: float, lon: float, body: Body) -> tuple[datetime | None, datetime | None]:
    geopos = (lon, lat, 0.0)

    def _try(flag):
        try:
            return eph.rise_trans(jd_start, body, None, CalcFlags.SWIEPH, flag, geopos, 0.0, 0.0).time
        except Exception:
            return None

    def _to_dt(j):
        return None if j is None else J2000_EPOCH + timedelta(days=(j - 2451545.0))

    return _to_dt(_try(RiseSetFlags.RISE)), _to_dt(_try(RiseSetFlags.SET))


def compute_graha_positions(jd_ut: float, lat: float, lon: float, tz: timezone) -> dict[str, Any]:
    sun_lon, _ = _calc_sidereal(jd_ut, Body.SUN)
    positions: dict[str, Any] = {}

    for key, body in PLANET_BODY_MAP.items():
        lon_deg, speed = _calc_sidereal(jd_ut, body)
        rashi = int(lon_deg / 30)
        retro = speed < 0 and key != "sun" and key != "moon"
        combust = False
        if key in COMBUSTION_ORB:
            orb = COMBUSTION_ORB[key][1 if retro else 0]
            sep = abs(((lon_deg - sun_lon + 180) % 360) - 180)
            combust = sep <= orb
        entry = {
            "name": PLANET_NAMES[key],
            "rashi": RASI_NAMES[rashi],
            "degree": round(lon_deg % 30, 2),
            "retrograde": retro,
            "combust": combust,
        }
        if key in RISE_SET_BODIES:
            r, s = _rise_set(jd_ut - 0.5, lat, lon, RISE_SET_BODIES[key])
            entry["rise"] = _fmt_time(r.astimezone(tz)) if r else "—"
            entry["set"] = _fmt_time(s.astimezone(tz)) if s else "—"
        positions[key] = entry

    rahu_lon, _ = _calc_sidereal(jd_ut, Body.TRUE_NODE)
    ketu_lon = (rahu_lon + 180) % 360
    for key, lon_deg in (("rahu", rahu_lon), ("ketu", ketu_lon)):
        positions[key] = {
            "name": PLANET_NAMES[key],
            "rashi": RASI_NAMES[int(lon_deg / 30)],
            "degree": round(lon_deg % 30, 2),
            # Lunar nodes are treated as always-retrograde here (true-node direct
            # spells are rare and not tracked by this basic Panchangam).
            "retrograde": True,
            "combust": False,
        }
    return positions


def compute_lagna(jd_ut: float, lat: float, lon: float) -> dict[str, Any]:
    houses_res = eph.houses(jd_ut, lat, lon, HouseSystem.WHOLE_SIGN)
    asc_trop = houses_res.ascmc.ascendant
    ayanamsa = eph.get_ayanamsa_ut(jd_ut, CalcFlags.SWIEPH)
    asc_sidereal = (asc_trop - ayanamsa) % 360.0
    return {"rashi": RASI_NAMES[int(asc_sidereal / 30)], "degree": round(asc_sidereal % 30, 2)}


# --------------------------------------------------------------- Choghadiya
CHOGHADIYA_CYCLE = ["sun", "venus", "mercury", "moon", "saturn", "jupiter", "mars"]
CHOGHADIYA_NAME = {
    "sun": {"en": "Udveg", "te": "ఉద్వేగ", "hi": "उद्वेग", "ta": "உத்வேகம்", "kn": "ಉದ್ವೇಗ", "ml": "ഉദ്വേഗം"},
    "venus": {"en": "Chal", "te": "చల", "hi": "चल", "ta": "சலம்", "kn": "ಚಲ", "ml": "ചലം"},
    "mercury": {"en": "Labh", "te": "లాభ", "hi": "लाभ", "ta": "லாபம்", "kn": "ಲಾಭ", "ml": "ലാഭം"},
    "moon": {"en": "Amrit", "te": "అమృత", "hi": "अमृत", "ta": "அமிர்தம்", "kn": "ಅಮೃತ", "ml": "അമൃതം"},
    "saturn": {"en": "Kaal", "te": "కాల", "hi": "काल", "ta": "காலம்", "kn": "ಕಾಲ", "ml": "കാലം"},
    "jupiter": {"en": "Shubh", "te": "శుభ", "hi": "शुभ", "ta": "சுபம்", "kn": "ಶುಭ", "ml": "ശുഭം"},
    "mars": {"en": "Rog", "te": "రోగ", "hi": "रोग", "ta": "ரோகம்", "kn": "ರೋಗ", "ml": "രോഗം"},
}
CHOGHADIYA_GOOD = {"venus", "mercury", "moon", "jupiter"}

# index = date.weekday() (Monday=0 .. Sunday=6), matching core.panchangam.VARA_NAMES
WEEKDAY_LORD = ["moon", "mars", "mercury", "jupiter", "venus", "saturn", "sun"]

HORA_CYCLE = ["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"]


def compute_choghadiya(sunrise: datetime, sunset: datetime, next_sunrise: datetime, weekday: int, tz: timezone) -> dict[str, Any]:
    day_seg = (sunset - sunrise) / 8
    night_seg = (next_sunrise - sunset) / 8
    day_start = CHOGHADIYA_CYCLE.index(WEEKDAY_LORD[weekday])
    # Night Choghadiya is NOT a continuation of the day cycle: its first
    # period is ruled by the lord of the 5th weekday counted from today
    # (Prokerala / drikpanchang rule). weekday is Monday=0..Sunday=6, so the
    # 5th weekday inclusive is (weekday + 4) % 7.
    night_start = CHOGHADIYA_CYCLE.index(WEEKDAY_LORD[(weekday + 4) % 7])

    def _periods(base: datetime, seg: timedelta, start: int) -> list[dict[str, Any]]:
        out = []
        for i in range(8):
            planet = CHOGHADIYA_CYCLE[(start + i) % 7]
            s, e = base + seg * i, base + seg * (i + 1)
            out.append({
                "planet": planet,
                "name": CHOGHADIYA_NAME[planet],
                "good": planet in CHOGHADIYA_GOOD,
                "start": _fmt_time(s.astimezone(tz)),
                "end": _fmt_time(e.astimezone(tz)),
            })
        return out

    return {
        "day": _periods(sunrise, day_seg, day_start),
        "night": _periods(sunset, night_seg, night_start),
    }


def compute_hora(sunrise: datetime, sunset: datetime, next_sunrise: datetime, weekday: int, tz: timezone) -> list[dict[str, Any]]:
    day_seg = (sunset - sunrise) / 12
    night_seg = (next_sunrise - sunset) / 12
    lord = WEEKDAY_LORD[weekday]
    start_idx = HORA_CYCLE.index(lord)

    horas = []
    for i in range(12):
        planet = HORA_CYCLE[(start_idx + i) % 7]
        s, e = sunrise + day_seg * i, sunrise + day_seg * (i + 1)
        horas.append({"planet": planet, "name": PLANET_NAMES[planet], "start": _fmt_time(s.astimezone(tz)), "end": _fmt_time(e.astimezone(tz))})
    for i in range(12):
        planet = HORA_CYCLE[(start_idx + 12 + i) % 7]
        s, e = sunset + night_seg * i, sunset + night_seg * (i + 1)
        horas.append({"planet": planet, "name": PLANET_NAMES[planet], "start": _fmt_time(s.astimezone(tz)), "end": _fmt_time(e.astimezone(tz))})
    return horas


# --------------------------------------------------------- Gowri Panchangam
GOWRI_NAME = {
    "amirdha": {"en": "Amirdham", "te": "అమృతం", "hi": "अमृतम्", "ta": "அமிர்தம்", "kn": "ಅಮೃತಂ", "ml": "അമൃതം"},
    "dhanam": {"en": "Dhanam", "te": "ధనం", "hi": "धनम्", "ta": "தனம்", "kn": "ಧನಂ", "ml": "ധനം"},
    "laabam": {"en": "Laabam", "te": "లాభం", "hi": "लाभम्", "ta": "லாபம்", "kn": "ಲಾಭಂ", "ml": "ലാഭം"},
    "sugam": {"en": "Sugam", "te": "సుఖం", "hi": "सुगम्", "ta": "சுகம்", "kn": "ಸುಗಂ", "ml": "സുഖം"},
    "uthi": {"en": "Uthi (Uttamam)", "te": "ఉత్తమం", "hi": "उत्तमम्", "ta": "உத்தி", "kn": "ಉತ್ತಮಂ", "ml": "ഉത്തമം"},
    "rogam": {"en": "Rogam", "te": "రోగం", "hi": "रोगम्", "ta": "ரோகம்", "kn": "ರೋಗಂ", "ml": "രോഗം"},
    "soram": {"en": "Soram", "te": "సోరం", "hi": "शोरम्", "ta": "சோரம்", "kn": "ಸೋರಂ", "ml": "സോരം"},
    "visham": {"en": "Visham", "te": "విషం", "hi": "विषम्", "ta": "விஷம்", "kn": "ವಿಷಂ", "ml": "വിഷം"},
}
GOWRI_GOOD = {"amirdha", "dhanam", "laabam", "sugam", "uthi"}

# Fixed per-weekday tables (Pambu Panchangam convention) — cross-checked
# against drikpanchang.com for all 7 weekdays; this is NOT a simple rotation
# (verified empirically that a single fixed cyclic offset does not hold
# across all weekdays), so each weekday's 8-item sequence is listed as-is.
GOWRI_DAY_SEQUENCE = {
    6: ["uthi", "amirdha", "rogam", "laabam", "dhanam", "sugam", "soram", "visham"],
    0: ["amirdha", "visham", "rogam", "laabam", "dhanam", "sugam", "soram", "uthi"],
    1: ["rogam", "laabam", "dhanam", "sugam", "soram", "uthi", "visham", "amirdha"],
    2: ["laabam", "dhanam", "sugam", "soram", "visham", "uthi", "amirdha", "rogam"],
    3: ["dhanam", "sugam", "soram", "uthi", "amirdha", "visham", "rogam", "laabam"],
    4: ["sugam", "soram", "uthi", "visham", "amirdha", "rogam", "laabam", "dhanam"],
    5: ["soram", "uthi", "visham", "amirdha", "rogam", "laabam", "dhanam", "sugam"],
}
GOWRI_NIGHT_SEQUENCE = {
    6: ["dhanam", "sugam", "soram", "visham", "uthi", "amirdha", "rogam", "laabam"],
    0: ["sugam", "soram", "uthi", "amirdha", "visham", "rogam", "laabam", "dhanam"],
    1: ["soram", "uthi", "visham", "amirdha", "rogam", "laabam", "dhanam", "sugam"],
    2: ["uthi", "amirdha", "rogam", "laabam", "dhanam", "sugam", "soram", "visham"],
    3: ["amirdha", "visham", "rogam", "laabam", "dhanam", "sugam", "soram", "uthi"],
    4: ["rogam", "laabam", "dhanam", "sugam", "soram", "uthi", "visham", "amirdha"],
    5: ["laabam", "dhanam", "sugam", "soram", "uthi", "visham", "amirdha", "rogam"],
}


def compute_gowri_panchangam(sunrise: datetime, sunset: datetime, next_sunrise: datetime, weekday: int, tz: timezone) -> dict[str, Any]:
    day_seg = (sunset - sunrise) / 8
    night_seg = (next_sunrise - sunset) / 8

    def _periods(base: datetime, seg: timedelta, sequence: list[str]) -> list[dict[str, Any]]:
        out = []
        for i, key in enumerate(sequence):
            s, e = base + seg * i, base + seg * (i + 1)
            out.append({
                "key": key,
                "name": GOWRI_NAME[key],
                "good": key in GOWRI_GOOD,
                "start": _fmt_time(s.astimezone(tz)),
                "end": _fmt_time(e.astimezone(tz)),
            })
        return out

    return {
        "day": _periods(sunrise, day_seg, GOWRI_DAY_SEQUENCE[weekday]),
        "night": _periods(sunset, night_seg, GOWRI_NIGHT_SEQUENCE[weekday]),
    }


# ------------------------------------------------------------ Disha Shoola
DIRECTION_NAMES = {
    "east": {"en": "East", "te": "తూర్పు", "hi": "पूर्व", "ta": "கிழக்கு", "kn": "ಪೂರ್ವ", "ml": "കിഴക്ക്"},
    "west": {"en": "West", "te": "పడమర", "hi": "पश्चिम", "ta": "மேற்கு", "kn": "ಪಶ್ಚಿಮ", "ml": "പടിഞ്ഞാറ്"},
    "north": {"en": "North", "te": "ఉత్తరం", "hi": "उत्तर", "ta": "வடக்கு", "kn": "ಉತ್ತರ", "ml": "വടക്ക്"},
    "south": {"en": "South", "te": "దక్షిణం", "hi": "दक्षिण", "ta": "தெற்கு", "kn": "ದಕ್ಷಿಣ", "ml": "തെക്ക്"},
}
# index = date.weekday(); Sunday=west, Monday=east, Tue/Wed=north, Thu=south, Fri=west, Sat=east
DISHA_SHOOLA_BY_WEEKDAY = {6: "west", 0: "east", 1: "north", 2: "north", 3: "south", 4: "west", 5: "east"}


# ---------------------------------------------------------- Nakshatra info
GANA_NAMES = {
    "deva": {"en": "Deva", "te": "దేవ", "hi": "देव", "ta": "தேவ", "kn": "ದೇವ", "ml": "ദേവ"},
    "manushya": {"en": "Manushya", "te": "మానుష", "hi": "मानुष", "ta": "மானுஷ", "kn": "ಮಾನುಷ", "ml": "മാനുഷ"},
    "rakshasa": {"en": "Rakshasa", "te": "రాక్షస", "hi": "राक्षस", "ta": "ராட்சச", "kn": "ರಾಕ್ಷಸ", "ml": "രാക്ഷസ"},
}
NADI_NAMES = {
    "aadi": {"en": "Aadi (Vata)", "te": "ఆది (వాత)", "hi": "आदि (वात)", "ta": "ஆதி (வாதம்)", "kn": "ಆದಿ (ವಾತ)", "ml": "ആദി (വാതം)"},
    "madhya": {"en": "Madhya (Pitta)", "te": "మధ్య (పిత్త)", "hi": "मध्य (पित्त)", "ta": "மத்திய (பித்தம்)", "kn": "ಮಧ್ಯ (ಪಿತ್ತ)", "ml": "മധ്യ (പിത്തം)"},
    "antya": {"en": "Antya (Kapha)", "te": "అంత్య (కఫ)", "hi": "अंत्य (कफ)", "ta": "அந்திய (கபம்)", "kn": "ಅಂತ್ಯ (ಕಫ)", "ml": "അന്ത്യ (കഫം)"},
}
DEITY_NAMES = {
    "ashwini_kumaras": {"en": "Ashwini Kumaras", "te": "అశ్విని దేవతలు", "hi": "अश्विनी कुमार", "ta": "அஸ்வினி தேவர்கள்", "kn": "ಅಶ್ವಿನಿ ದೇವತೆಗಳು", "ml": "അശ്വിനി ദേവന്മാർ"},
    "yama": {"en": "Yama", "te": "యముడు", "hi": "यम", "ta": "யமன்", "kn": "ಯಮ", "ml": "യമൻ"},
    "agni": {"en": "Agni", "te": "అగ్ని", "hi": "अग्नि", "ta": "அக்னி", "kn": "ಅಗ್ನಿ", "ml": "അഗ്നി"},
    "brahma": {"en": "Brahma", "te": "బ్రహ్మ", "hi": "ब्रह्मा", "ta": "பிரம்மா", "kn": "ಬ್ರಹ್ಮ", "ml": "ബ്രഹ്മാവ്"},
    "chandra": {"en": "Chandra", "te": "చంద్రుడు", "hi": "चन्द्र", "ta": "சந்திரன்", "kn": "ಚಂದ್ರ", "ml": "ചന്ദ്രൻ"},
    "rudra": {"en": "Rudra", "te": "రుద్రుడు", "hi": "रुद्र", "ta": "ருத்திரன்", "kn": "ರುದ್ರ", "ml": "രുദ്രൻ"},
    "aditi": {"en": "Aditi", "te": "అదితి", "hi": "अदिति", "ta": "அதிதி", "kn": "ಅದಿತಿ", "ml": "അദിതി"},
    "brihaspati": {"en": "Brihaspati", "te": "బృహస్పతి", "hi": "बृहस्पति", "ta": "பிரகஸ்பதி", "kn": "ಬೃಹಸ್ಪತಿ", "ml": "ബൃഹസ്പതി"},
    "nagas": {"en": "Nagas", "te": "నాగదేవతలు", "hi": "नाग", "ta": "நாகங்கள்", "kn": "ನಾಗಗಳು", "ml": "നാഗങ്ങൾ"},
    "pitris": {"en": "Pitris", "te": "పితృదేవతలు", "hi": "पितृ", "ta": "பித்ருக்கள்", "kn": "ಪಿತೃಗಳು", "ml": "പിതൃക്കൾ"},
    "bhaga": {"en": "Bhaga", "te": "భగుడు", "hi": "भग", "ta": "பகன்", "kn": "ಭಗ", "ml": "ഭഗൻ"},
    "aryaman": {"en": "Aryaman", "te": "అర్యముడు", "hi": "अर्यमा", "ta": "அர்யமன்", "kn": "ಅರ್ಯಮ", "ml": "അര്യമാവ്"},
    "savitar": {"en": "Savitar", "te": "సవిత", "hi": "सवितृ", "ta": "சவிதிரு", "kn": "ಸವಿತೃ", "ml": "സവിതാവ്"},
    "vishvakarma": {"en": "Vishvakarma", "te": "విశ్వకర్మ", "hi": "विश्वकर्मा", "ta": "விஸ்வகர்மா", "kn": "ವಿಶ್ವಕರ್ಮ", "ml": "വിശ്വകർമ്മാവ്"},
    "vayu": {"en": "Vayu", "te": "వాయువు", "hi": "वायु", "ta": "வாயு", "kn": "ವಾಯು", "ml": "വായു"},
    "indra_agni": {"en": "Indra & Agni", "te": "ఇంద్రాగ్నులు", "hi": "इन्द्राग्नि", "ta": "இந்திராக்னி", "kn": "ಇಂದ್ರಾಗ್ನಿ", "ml": "ഇന്ദ്രാഗ്നി"},
    "mitra": {"en": "Mitra", "te": "మిత్రుడు", "hi": "मित्र", "ta": "மித்திரன்", "kn": "ಮಿತ್ರ", "ml": "മിത്രൻ"},
    "indra": {"en": "Indra", "te": "ఇంద్రుడు", "hi": "इन्द्र", "ta": "இந்திரன்", "kn": "ಇಂದ್ರ", "ml": "ഇന്ദ്രൻ"},
    "nirriti": {"en": "Nirriti", "te": "నిరృతి", "hi": "निर्ऋति", "ta": "நிருதி", "kn": "ನಿರೃತಿ", "ml": "നിരൃതി"},
    "apah": {"en": "Apah", "te": "ఆపో దేవత", "hi": "आपः", "ta": "ஆபா", "kn": "ಆಪಃ", "ml": "ആപഃ"},
    "vishvadevas": {"en": "Vishvadevas", "te": "విశ్వదేవతలు", "hi": "विश्वेदेवा", "ta": "விஸ்வதேவர்கள்", "kn": "ವಿಶ್ವದೇವತೆಗಳು", "ml": "വിശ്വദേവന്മാർ"},
    "vishnu": {"en": "Vishnu", "te": "విష్ణువు", "hi": "विष्णु", "ta": "விஷ்ணு", "kn": "ವಿಷ್ಣು", "ml": "വിഷ്ണു"},
    "ashta_vasus": {"en": "Ashta Vasus", "te": "అష్ట వసువులు", "hi": "अष्ट वसु", "ta": "அஷ்ட வசுக்கள்", "kn": "ಅಷ್ಟ ವಸುಗಳು", "ml": "അഷ്ട വസുക്കൾ"},
    "varuna": {"en": "Varuna", "te": "వరుణుడు", "hi": "वरुण", "ta": "வருணன்", "kn": "ವರುಣ", "ml": "വരുണൻ"},
    "aja_ekapada": {"en": "Aja Ekapada", "te": "అజ ఏకపాదుడు", "hi": "अज एकपाद", "ta": "அஜ ஏகபாதன்", "kn": "ಅಜ ಏಕಪಾದ", "ml": "അജ ഏകപാദൻ"},
    "ahirbudhnya": {"en": "Ahirbudhnya", "te": "అహిర్బుధ్న్యుడు", "hi": "अहिर्बुध्न्य", "ta": "அஹிர்புத்னியன்", "kn": "ಅಹಿರ್ಬುಧ್ನ್ಯ", "ml": "അഹിർബുധ്ന്യൻ"},
    "pushan": {"en": "Pushan", "te": "పూషుడు", "hi": "पूषन्", "ta": "பூஷன்", "kn": "ಪೂಷನ್", "ml": "പൂഷാവ്"},
}

# (ruling planet key, deity key, gana key, nadi key) for each of the 27 nakshatras,
# in order (Ashwini .. Revati). Cross-checked against a published reference table.
NAKSHATRA_INFO = [
    ("ketu", "ashwini_kumaras", "deva", "aadi"),
    ("venus", "yama", "manushya", "madhya"),
    ("sun", "agni", "rakshasa", "antya"),
    ("moon", "brahma", "manushya", "antya"),
    ("mars", "chandra", "deva", "madhya"),
    ("rahu", "rudra", "manushya", "aadi"),
    ("jupiter", "aditi", "deva", "aadi"),
    ("saturn", "brihaspati", "deva", "madhya"),
    ("mercury", "nagas", "rakshasa", "antya"),
    ("ketu", "pitris", "rakshasa", "antya"),
    ("venus", "bhaga", "manushya", "madhya"),
    ("sun", "aryaman", "manushya", "aadi"),
    ("moon", "savitar", "deva", "aadi"),
    ("mars", "vishvakarma", "rakshasa", "madhya"),
    ("rahu", "vayu", "deva", "antya"),
    ("jupiter", "indra_agni", "rakshasa", "antya"),
    ("saturn", "mitra", "deva", "madhya"),
    ("mercury", "indra", "rakshasa", "aadi"),
    ("ketu", "nirriti", "rakshasa", "aadi"),
    ("venus", "apah", "manushya", "madhya"),
    ("sun", "vishvadevas", "manushya", "antya"),
    ("moon", "vishnu", "deva", "antya"),
    ("mars", "ashta_vasus", "rakshasa", "madhya"),
    ("rahu", "varuna", "rakshasa", "aadi"),
    ("jupiter", "aja_ekapada", "manushya", "aadi"),
    ("saturn", "ahirbudhnya", "manushya", "madhya"),
    ("mercury", "pushan", "deva", "antya"),
]


def compute_nakshatra_info(nakshatra_idx: int) -> dict[str, Any]:
    lord_key, deity_key, gana_key, nadi_key = NAKSHATRA_INFO[nakshatra_idx]
    return {
        "lord": PLANET_NAMES[lord_key],
        "deity": DEITY_NAMES[deity_key],
        "gana": GANA_NAMES[gana_key],
        "nadi": NADI_NAMES[nadi_key],
    }


# --------------------------------------------------------------- Festivals
# Every tithi-based festival's exact [start, end) span is computed once per
# year in core/panchangam.py (_compute_tithi_festival_spans) and shown here
# on every civil day that span touches (see module docstring above) — not
# matched by a same-day tithi/masa table lookup, and not narrowed to a
# single "correct" day by a kaal-specific rule. Krishna Janmashtami's masa
# index is intentionally Śrāvaṇa (4), not the popularly-cited Bhādrapada
# (5) — that name uses Purnimanta convention; Amanta's name for the same
# real day is one month earlier.
FESTIVAL_NAMES = {
    "ugadi": {"en":"Ugadi","te":"ఉగాది","hi":"उगादी","ta":"உகாதி","kn":"ಯುಗಾದಿ","ml":"ഉഗാദി"},
    "rama_navami": {"en":"Rama Navami","te":"శ్రీరామ నవమి","hi":"राम नवमी","ta":"ஸ்ரீ ராம நவமி","kn":"ಶ್ರೀ ರಾಮ ನವಮಿ","ml":"ശ്രീരാമ നവമി"},
    "hanuman_jayanthi": {"en":"Hanuman Jayanthi","te":"హనుమజ్జయంతి","hi":"हनुमान जयंती","ta":"ஹனுமான் ஜெயந்தி","kn":"ಹನುಮ ಜಯಂತಿ","ml":"ഹനുമാൻ ജയന്തി"},
    "narasimha_jayanthi": {"en":"Narasimha Jayanthi","te":"నరసింహ జయంతి","hi":"नरसिंह जयंती","ta":"நரசிம்ம ஜெயந்தி","kn":"ನರಸಿಂಹ ಜಯಂತಿ","ml":"നരസിംഹ ജയന്തി"},
    "guru_pournami": {"en":"Guru Purnima","te":"గురు పౌర్ణమి","hi":"गुरु पूर्णिमा","ta":"குரு பௌர்ணமி","kn":"ಗುರು ಹುಣ್ಣಿಮೆ","ml":"ഗുരു പൗർണമി"},
    "varalakshmi_vratam": {"en":"Varalakshmi Vratam","te":"వరలక్ష్మీ వ్రతం","hi":"वरलक्ष्मी व्रत","ta":"வரலட்சுமி விரதம்","kn":"ವರಲಕ್ಷ್ಮಿ ವ್ರತ","ml":"വരലക്ഷ്മി വ്രതം"},
    "polala_amavasya": {"en":"Polala Amavasya","te":"పోలాల అమావాస్య","hi":"पोलाला अमावस्या","ta":"போலால அமாவாசை","kn":"ಪೋಲಾಲ ಅಮಾವಾಸ್ಯೆ","ml":"പോലാല അമാവാസി"},
    "naga_panchami": {"en":"Naga Panchami","te":"నాగుల పంచమి","hi":"नाग पंचमी","ta":"நாக பஞ்சமி","kn":"ನಾಗ ಪಂಚಮಿ","ml":"നാഗ പഞ്ചമി"},
    "raksha_bandhan": {"en":"Vikhanasa Jayanthi / Rakhi Pournami","te":"విఖనస జయంతి / రాఖీ పౌర్ణమి","hi":"विखनस जयंती / रक्षा बंधन","ta":"விகனச ஜெயந்தி / ரக்ஷா பந்தன்","kn":"ವಿಖನಸ ಜಯಂತಿ / ರಕ್ಷಾ ಬಂಧನ","ml":"വിഖനസ ജയന്തി / രക്ഷാ ബന്ധൻ"},
    "atla_tadde": {"en":"Atla Tadde","te":"అట్ల తద్దె","hi":"अटला तद्दे","ta":"அட்ல தட்டெ","kn":"ಅಟ್ಲ ತದ್ದೆ","ml":"അട്ല തദ്ദെ"},
    "krishna_janmashtami": {"en":"Krishna Janmashtami","te":"శ్రీకృష్ణ జన్మాష్టమి","hi":"कृष्ण जन्माष्टमी","ta":"கிருஷ்ண ஜென்மாஷ்டமி","kn":"ಕೃಷ್ಣ ಜನ್ಮಾಷ್ಟಮಿ","ml":"കൃഷ്ണ ജന്മാഷ്ടമി"},
    "vinayaka_chavithi": {"en":"Vinayaka Chavithi","te":"వినాయక చవితి","hi":"गणेश चतुर्थी","ta":"விநாயகர் சதுர்த்தி","kn":"ಗಣೇಶ ಚತುರ್ಥಿ","ml":"വിനായക ചതുർത്ഥി"},
    "ganesh_nimajjanam": {"en":"Ganesh Nimajjanam","te":"వినాయక నిమజ్జనం","hi":"गणेश विसर्जन","ta":"விநாயகர் விசர்ஜனம்","kn":"ಗಣೇಶ ವಿಸರ್ಜನೆ","ml":"ഗണേശ് നിമജ്ജനം"},
    "maha_shivaratri": {"en":"Maha Shivaratri","te":"మహా శివరాత్రి","hi":"महा शिवरात्रि","ta":"மகா சிவராத்திரி","kn":"ಮಹಾ ಶಿವರಾತ್ರಿ","ml":"മഹാ ശിവരാത്രി"},
    "holika_dahan": {"en":"Holika Dahan","te":"హోలికా దహనం","hi":"होलिका दहन","ta":"ஹோலிகா தகனம்","kn":"ಹೋಲಿಕಾ ದಹನ","ml":"ഹോളികാ ദഹനം"},
    "holi": {"en":"Holi","te":"హోలీ","hi":"होली","ta":"ஹோலி","kn":"ಹೋಳಿ","ml":"ഹോളി"},
    "naraka_chaturdashi": {"en":"Naraka Chaturdashi","te":"నరక చతుర్దశి","hi":"नरक चतुर्दशी","ta":"நரக சதுர்த்தசி","kn":"ನರಕ ಚತುರ್ದಶಿ","ml":"നരക ചതുർദശി"},
    "diwali": {"en":"Diwali","te":"దీపావళి","hi":"दीपावली","ta":"தீபாவளி","kn":"ದೀಪಾವಳಿ","ml":"ദീപാവലി"},
    "vijayadashami": {"en":"Vijayadashami","te":"విజయదశమి","hi":"विजयादशमी","ta":"விஜயதசமி","kn":"ವಿಜಯದಶಮಿ","ml":"വിജയദശമി"},
    "nagula_chavithi": {"en":"Nagula Chavithi","te":"నాగుల చవితి","hi":"नाग चतुर्थी","ta":"நாக சதுர்த்தி","kn":"ನಾಗ ಚತುರ್ಥಿ","ml":"നാഗ ചതുർത്ഥി"},
    "karthika_pournami": {"en":"Karthika Pournami","te":"కార్తీక పౌర్ణమి","hi":"कार्तिक पूर्णिमा","ta":"கார்த்திகை பௌர்ணமி","kn":"ಕಾರ್ತಿಕ ಹುಣ್ಣಿಮೆ","ml":"കാർത്തിക പൗർണമി"},
    "makara_sankranti": {"en":"Makara Sankranti","te":"మకర సంక్రాంతి","hi":"मकर संक्रांति","ta":"மகர சங்கராந்தி","kn":"ಮಕರ ಸಂಕ್ರಾಂತಿ","ml":"മകര സംക്രാന്തി"},
    "bhogi": {"en":"Bhogi","te":"భోగి","hi":"भोगी","ta":"போகி","kn":"ಭೋಗಿ","ml":"ഭോഗി"},
    "kanuma": {"en":"Kanuma","te":"కనుమ","hi":"कनुमा","ta":"கனுமா","kn":"ಕನುಮ","ml":"കനുമ"},
    "nirjala_ekadasi": {"en":"Nirjala Ekadasi","te":"నిర్జల ఏకాదశి","hi":"निर्जला एकादशी","ta":"நிர்ஜலா ஏகாதசி","kn":"ನಿರ್ಜಲಾ ಏಕಾದಶಿ","ml":"നിർജല ഏകാദശി"},
    "toli_ekadasi": {"en":"Toli Ekadasi","te":"తొలి ఏకాదశి","hi":"तोली एकादशी","ta":"தோலி ஏகாதசி","kn":"ತೊಲಿ ಏಕಾದಶಿ","ml":"തൊലി ഏകാദശി"},
    "chiluka_ekadasi": {"en":"Chiluka Ekadasi","te":"చిలుక ఏకాదశి","hi":"चिलुका एकादशी","ta":"சிலுக ஏகாதசி","kn":"ಚಿಲುಕ ಏಕಾದಶಿ","ml":"ചിലുക ഏകാദശി"},
    "vaikuntha_ekadasi": {"en":"Vaikuntha Ekadasi","te":"వైకుంఠ ఏకాదశి","hi":"वैकुंठ एकादशी","ta":"வைகுண்ட ஏகாதசி","kn":"ವೈಕುಂಠ ಏಕಾದಶಿ","ml":"വൈകുണ്ഠ ഏകാദശി"},
    "gita_jayanthi": {"en":"Gita Jayanthi","te":"గీతా జయంతి","hi":"गीता जयंती","ta":"கீதா ஜெயந்தி","kn":"ಗೀತಾ ಜಯಂತಿ","ml":"ഗീതാ ജയന്തി"},
    "bhishma_ekadasi": {"en":"Bhishma Ekadasi","te":"భీష్మ ఏకాదశి","hi":"भीष्म एकादशी","ta":"பீஷ்ம ஏகாதசி","kn":"ಭೀಷ್ಮ ಏಕಾದಶಿ","ml":"ഭീഷ്മ ഏകാദശി"},
}


def _find_varalakshmi_vratam(tithi_festivals: dict[str, dict[str, Any]]) -> date:
    """Varalakshmi Vratam is the Friday nearest before Shravana Purnima —
    a weekday-relative rule, unlike every other festival here which is a
    fixed tithi/masa. Derived from raksha_bandhan's own Purnima span
    (same tithi) rather than a separate lookup."""
    purnima_date = tithi_festivals["raksha_bandhan"]["dates"][0]
    d = purnima_date - timedelta(days=1)
    while d.weekday() != 4:  # Friday
        d -= timedelta(days=1)
    return d


def compute_festivals(
    target_date: date,
    makar_sankranti_date: date,
    tithi_festivals: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    festivals: list[dict[str, Any]] = []
    for key, info in tithi_festivals.items():
        if target_date not in info["dates"]:
            continue
        start, end = info["start_local"], info["end_local"]
        festivals.append({
            "key": key,
            "name": FESTIVAL_NAMES[key],
            "calendar": "chandramana",
            # Shown on every civil day the tithi touches (see module docstring) —
            # the exact start/end let the UI make that timing transparent rather
            # than silently picking one day as "the" festival day.
            "tithi_start": f"{_fmt_time(start)} ({start.strftime('%d/%m')})",
            "tithi_end": f"{_fmt_time(end)} ({end.strftime('%d/%m')})",
        })
    if target_date == makar_sankranti_date:
        festivals.append({"key": "makara_sankranti", "name": FESTIVAL_NAMES["makara_sankranti"], "calendar": "souramana"})
    elif target_date == makar_sankranti_date - timedelta(days=1):
        festivals.append({"key": "bhogi", "name": FESTIVAL_NAMES["bhogi"], "calendar": "souramana"})
    elif target_date == makar_sankranti_date + timedelta(days=1):
        festivals.append({"key": "kanuma", "name": FESTIVAL_NAMES["kanuma"], "calendar": "souramana"})
    if "raksha_bandhan" in tithi_festivals and target_date == _find_varalakshmi_vratam(tithi_festivals):
        festivals.append({"key": "varalakshmi_vratam", "name": FESTIVAL_NAMES["varalakshmi_vratam"], "calendar": "chandramana"})
    return festivals


def compute_festival_calendar(year: int, lat: float, lon: float, tz_offset_min: int) -> list[dict[str, Any]]:
    """Every festival's date(s) and exact tithi timing for a full calendar
    year — powers the "choose a festival" dashboard lookup, independent of
    any single target_date. Uses the same underlying data as
    compute_festivals, just iterated over the whole year at once."""
    tithi_festivals = _compute_tithi_festival_spans(year, lat, lon, tz_offset_min)
    makar_sankranti_date = _find_sankranti(year, 9)

    out: list[dict[str, Any]] = []
    for key, info in tithi_festivals.items():
        start, end = info["start_local"], info["end_local"]
        out.append({
            "key": key,
            "name": FESTIVAL_NAMES[key],
            "calendar": "chandramana",
            "dates": [d.isoformat() for d in info["dates"]],
            "tithi_start": f"{_fmt_time(start)} ({start.strftime('%d/%m')})",
            "tithi_end": f"{_fmt_time(end)} ({end.strftime('%d/%m')})",
        })
    out.append({
        "key": "bhogi", "name": FESTIVAL_NAMES["bhogi"], "calendar": "souramana",
        "dates": [(makar_sankranti_date - timedelta(days=1)).isoformat()],
    })
    out.append({
        "key": "makara_sankranti", "name": FESTIVAL_NAMES["makara_sankranti"], "calendar": "souramana",
        "dates": [makar_sankranti_date.isoformat()],
    })
    out.append({
        "key": "kanuma", "name": FESTIVAL_NAMES["kanuma"], "calendar": "souramana",
        "dates": [(makar_sankranti_date + timedelta(days=1)).isoformat()],
    })
    if "raksha_bandhan" in tithi_festivals:
        out.append({
            "key": "varalakshmi_vratam", "name": FESTIVAL_NAMES["varalakshmi_vratam"], "calendar": "chandramana",
            "dates": [_find_varalakshmi_vratam(tithi_festivals).isoformat()],
        })
    out.sort(key=lambda f: f["dates"][0])
    return out


# --------------------------------------------------------------- Top level
def compute_extended(
    target_date: date,
    lat: float,
    lon: float,
    tz_offset_min: int,
    sunrise: datetime,
    sunset: datetime,
    jd_sunrise: float,
    weekday: int,
    tithi_idx: int,
    nakshatra_idx: int,
    karana_en: str,
    makar_sankranti_date: date,
    tithi_festivals: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    tz = timezone(timedelta(minutes=tz_offset_min))

    loc = LocationInfo("here", "in", "UTC", lat, lon)
    try:
        next_sunrise = astral_sun(loc.observer, date=target_date + timedelta(days=1), tzinfo=tz)["sunrise"]
    except Exception:
        next_sunrise = sunrise + timedelta(days=1)

    return {
        "graha_positions": compute_graha_positions(jd_sunrise, lat, lon, tz),
        "lagna": compute_lagna(jd_sunrise, lat, lon),
        "choghadiya": compute_choghadiya(sunrise, sunset, next_sunrise, weekday, tz),
        "hora": compute_hora(sunrise, sunset, next_sunrise, weekday, tz),
        "gowri_panchangam": compute_gowri_panchangam(sunrise, sunset, next_sunrise, weekday, tz),
        "nakshatra_info": compute_nakshatra_info(nakshatra_idx),
        "disha_shoola": DIRECTION_NAMES[DISHA_SHOOLA_BY_WEEKDAY[weekday]],
        "special_days": {
            "ekadashi": (tithi_idx % 15) == 10,
            "pournami": tithi_idx == 14,
            "amavasya": tithi_idx == 29,
        },
        "bhadra": karana_en == "Viṣṭi",
        "festivals": compute_festivals(target_date, makar_sankranti_date, tithi_festivals),
    }

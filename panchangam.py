from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from swisseph_rs import (
    Body, 
    CalcFlags, 
    Ephemeris, 
    EphemerisConfig, 
    SiderealMode, 
    RiseSetFlags
)
from astral import LocationInfo
from astral.sun import sun

# --- Initialize Global Ephemeris ---
config = EphemerisConfig(sidereal_mode=SiderealMode.LAHIRI)
eph = Ephemeris(config)

# --- Constants ---
SAMVATSARA_NAMES = [
    {"en":"Prabhava","te":"ప్రభవ"}, {"en":"Vibhava","te":"విభవ"}, {"en":"Śukla","te":"శుక్ల"}, {"en":"Pramoduta","te":"ప్రమోదూత"}, {"en":"Prajāpati","te":"ప్రజాపతి"}, {"en":"Āngirasa","te":"ఆంగీరస"}, {"en":"Śrīmukha","te":"శ్రీముఖ"}, {"en":"Bhāva","te":"భావ"}, {"en":"Yuva","te":"యువ"}, {"en":"Dhātā","te":"ధాత"}, {"en":"Īśvara","te":"ఈశ్వర"}, {"en":"Bahudhānya","te":"బహుధాన్య"}, {"en":"Pramāthī","te":"ప్రమాథి"}, {"en":"Vikrama","te":"విక్రమ"}, {"en":"Vṛṣa","te":"వృష"}, {"en":"Chitrabhānu","te":"చిత్రభాను"}, {"en":"Subhānu","te":"సుభాను"}, {"en":"Tāraṇa","te":"తారణ"}, {"en":"Pārthiva","te":"పార్థివ"}, {"en":"Vyaya","te":"వ్యయ"}, {"en":"Sarvajit","te":"సర్వజిత్"}, {"en":"Sarvadhārī","te":"సర్వధారి"}, {"en":"Virodhi","te":"విరోధి"}, {"en":"Vikṛti","te":"వికృతి"}, {"en":"Khara","te":"ఖర"}, {"en":"Nandana","te":"నందన"}, {"en":"Vijaya","te":"విజయ"}, {"en":"Jaya","te":"జయ"}, {"en":"Manmatha","te":"మన్మథ"}, {"en":"Durmukhi","te":"దుర్ముఖి"}, {"en":"Hevilambi","te":"హేవిళంబి"}, {"en":"Vilambi","te":"విళంబి"}, {"en":"Vikārī","te":"వికారి"}, {"en":"Śārvarī","te":"శార్వరి"}, {"en":"Plava","te":"ప్లవ"}, {"en":"Śubhakṛt","te":"శుభకృత్"}, {"en":"Śobhakṛt","te":"శోభకృత్"}, {"en":"Krodhi","te":"క్రోధి"}, {"en":"Viśvāvasu","te":"విశ్వావసు"}, {"en":"Parābhava","te":"పరాభవ"}, {"en":"Plavaṅga","te":"ప్లవంగ"}, {"en":"Kīlaka","te":"కీలక"}, {"en":"Saumya","te":"సౌమ్య"}, {"en":"Sādhāraṇa","te":"సాధారణ"}, {"en":"Virodhikṛt","te":"విరోధికృత్"}, {"en":"Paridhāvī","te":"పరిధావి"}, {"en":"Pramādi","te":"ప్రమాది"}, {"en":"Ānanda","te":"ఆనంద"}, {"en":"Rākṣasa","te":"రాక్షస"}, {"en":"Nala","te":"నల"}, {"en":"Piṅgala","te":"పింగళ"}, {"en":"Kālayukta","te":"కాలయుక్త"}, {"en":"Siddhārthi","te":"సిద్ధార్థి"}, {"en":"Raudra","te":"రౌద్ర"}, {"en":"Durmati","te":"దుర్మతి"}, {"en":"Dundubhi","te":"దుందుభి"}, {"en":"Rudhirodgārī","te":"రుధిరోద్గారి"}, {"en":"Raktākṣi","te":"రక్తాక్షి"}, {"en":"Krodhana","te":"క్రోధన"}, {"en":"Akṣaya","te":"అక్షయ"},
]

TITHI_NAMES = [
    {"en":"Pratipadā","te":"పాడ్యమి"}, {"en":"Dvitīyā","te":"విదియ"}, {"en":"Tṛtīyā","te":"తదియ"}, {"en":"Chaturthī","te":"చవితి"}, {"en":"Pañcamī","te":"పంచమి"}, {"en":"Ṣaṣṭhī","te":"షష్టి"}, {"en":"Saptamī","te":"సప్తమి"}, {"en":"Aṣṭamī","te":"అష్టమి"}, {"en":"Navamī","te":"నవమి"}, {"en":"Daśamī","te":"దశమి"}, {"en":"Ekādaśī","te":"ఏకాదశి"}, {"en":"Dvādaśī","te":"ద్వాదశి"}, {"en":"Trayodaśī","te":"త్రయోదశి"}, {"en":"Chaturdaśī","te":"చతుర్దశి"}, {"en":"Pūrṇimā","te":"పౌర్ణమి"}, {"en":"Pratipadā","te":"పాడ్యమి"}, {"en":"Dvitīyā","te":"విదియ"}, {"en":"Tṛtīyā","te":"తదియ"}, {"en":"Chaturthī","te":"చవితి"}, {"en":"Pañcamī","te":"పంచమి"}, {"en":"Ṣaṣṭhī","te":"షష్టి"}, {"en":"Saptamī","te":"సప్తమి"}, {"en":"Aṣṭamī","te":"అష్టమి"}, {"en":"Navamī","te":"నవమి"}, {"en":"Daśamī","te":"దశమి"}, {"en":"Ekādaśī","te":"ఏకాదశి"}, {"en":"Dvādaśī","te":"ద్వాదశి"}, {"en":"Trayodaśī","te":"త్రయోదశి"}, {"en":"Chaturdaśī","te":"చతుర్దశి"}, {"en":"Amāvāsyā","te":"అమావాస్య"},
]

NAKSHATRA_NAMES = [
    {"en":"Aśvinī","te":"అశ్విని"}, {"en":"Bharaṇī","te":"భరణి"}, {"en":"Kṛttikā","te":"కృత్తిక"}, {"en":"Rohiṇī","te":"రోహిణి"}, {"en":"Mṛgaśira","te":"మృగశిర"}, {"en":"Ārdrā","te":"ఆర్ద్ర"}, {"en":"Punarvasu","te":"పునర్వసు"}, {"en":"Puṣya","te":"పుష్యమి"}, {"en":"Āśleṣā","te":"ఆశ్లేష"}, {"en":"Maghā","te":"మఘ"}, {"en":"Pūrva Phalgunī","te":"పూర్వ ఫాల్గుణి"}, {"en":"Uttara Phalgunī","te":"ఉత్తర ఫాల్గుణి"}, {"en":"Hasta","te":"హస్త"}, {"en":"Chitrā","te":"చిత్ర"}, {"en":"Svāti","te":"స్వాతి"}, {"en":"Viśākhā","te":"విశాఖ"}, {"en":"Anurādhā","te":"అనూరాధ"}, {"en":"Jyeṣṭhā","te":"జ్యేష్ఠ"}, {"en":"Mūla","te":"మూల"}, {"en":"Pūrvāṣāḍha","te":"పూర్వాషాఢ"}, {"en":"Uttarāṣāḍha","te":"ఉత్తరాషాఢ"}, {"en":"Śravaṇa","te":"శ్రవణం"}, {"en":"Dhaniṣṭhā","te":"ధనిష్ఠ"}, {"en":"Śatabhiṣā","te":"శతభిషం"}, {"en":"Pūrva Bhādrapadā","te":"పూర్వాభాద్ర"}, {"en":"Uttara Bhādrapadā","te":"ఉత్తరాభాద్ర"}, {"en":"Revatī","te":"రేవతి"},
]

YOGA_NAMES = [
    {"en":"Viṣkambha","te":"విష్కంభ"}, {"en":"Prīti","te":"ప్రీతి"}, {"en":"Āyuṣmān","te":"ఆయుష్మాన్"}, {"en":"Saubhāgya","te":"సౌభాగ్య"}, {"en":"Śobhana","te":"శోభన"}, {"en":"Atigaṇḍa","te":"అతిగండ"}, {"en":"Sukarma","te":"సుకర్మ"}, {"en":"Dhṛti","te":"ధృతి"}, {"en":"Śūla","te":"శూల"}, {"en":"Gaṇḍa","te":"గండ"}, {"en":"Vṛddhi","te":"వృద్ధి"}, {"en":"Dhruva","te":"ధ్రువ"}, {"en":"Vyāghāta","te":"వ్యాఘాత"}, {"en":"Harṣaṇa","te":"హర్షణ"}, {"en":"Vajra","te":"వజ్ర"}, {"en":"Siddhi","te":"సిద్ధి"}, {"en":"Vyatipāta","te":"వ్యతిపాత"}, {"en":"Varīyān","te":"వరీయాన్"}, {"en":"Parigha","te":"పరిఘ"}, {"en":"Śiva","te":"శివ"}, {"en":"Siddha","te":"సిద్ధ"}, {"en":"Sādhya","te":"సాధ్య"}, {"en":"Śubha","te":"శుభ"}, {"en":"Śukla","te":"శుక్ల"}, {"en":"Brahma","te":"బ్రహ్మ"}, {"en":"Aindra","te":"ఐంద్ర"}, {"en":"Vaidhṛti","te":"వైధృతి"},
]

KARANA_NAMES = [
    {"en":"Bava","te":"బవ"}, {"en":"Bālava","te":"బాలవ"}, {"en":"Kaulava","te":"కౌలవ"}, {"en":"Taitila","te":"తైతిల"}, {"en":"Gara","te":"గరజ"}, {"en":"Vaṇija","te":"వణిజ"}, {"en":"Viṣṭi","te":"విష్టి"}, {"en":"Śakuni","te":"శకుని"}, {"en":"Chatuṣpāda","te":"చతుష్పాద"}, {"en":"Nāga","te":"నాగ"}, {"en":"Kiṃstughna","te":"కింస్తుఘ్న"},
]

VARA_NAMES = [
    {"en":"Monday","te":"సోమవారం"}, {"en":"Tuesday","te":"మంగళవారం"}, {"en":"Wednesday","te":"బుధవారం"}, {"en":"Thursday","te":"గురువారం"}, {"en":"Friday","te":"శుక్రవారం"}, {"en":"Saturday","te":"శనివారం"}, {"en":"Sunday","te":"ఆదివారం"},
]

MASA_NAMES = [
    {"en":"Chaitra","te":"చైత్రము"}, {"en":"Vaiśākha","te":"వైశాఖము"}, {"en":"Jyeṣṭha","te":"జ్యేష్ఠము"}, {"en":"Āṣāḍha","te":"ఆషాఢము"}, {"en":"Śrāvaṇa","te":"శ్రావణము"}, {"en":"Bhādrapada","te":"భాద్రపదము"}, {"en":"Āśvina","te":"ఆశ్వయుజము"}, {"en":"Kārtika","te":"కార్తీకము"}, {"en":"Mārgaśīrṣa","te":"మార్గశిరము"}, {"en":"Pauṣa","te":"పుష్యము"}, {"en":"Māgha","te":"మాఘము"}, {"en":"Phālguna","te":"ఫాల్గుణము"},
]   

RITU_NAMES = [
    {"en":"Vasanta Ṛtu","te":"వసంత ఋతువు"}, {"en":"Grīṣma Ṛtu","te":"గ్రీష్మ ఋతువు"}, {"en":"Varṣā Ṛtu","te":"వర్ష ఋతువు"}, {"en":"Śarad Ṛtu","te":"శరదృతువు"}, {"en":"Hemanta Ṛtu","te":"హేమంత ఋతువు"}, {"en":"Śiśira Ṛtu","te":"శిశిర ఋతువు"},
]

AYANAM_NAMES = [
    {"en": "Uttarāyaṇam", "te": "ఉత్తరాయణం"},
    {"en": "Dakṣiṇāyanam", "te": "దక్షిణాయణం"}
]

PAKSHA_NAMES = [
    {"en": "Śukla Pakṣa", "te": "శుక్ల పక్షం"},
    {"en": "Kṛṣṇa Pakṣa", "te": "కృష్ణ పక్షం"}
]

TILL = {
    "en": 'till',
    "te": 'వరకు'
}

RAHUKALAM_SEGMENT = {0: 2, 1: 7, 2: 5, 3: 6, 4: 4, 5: 3, 6: 8}
YAMAGANDA_SEGMENT = {0: 4, 1: 3, 2: 2, 3: 1, 4: 7, 5: 6, 6: 5}
GULIKA_SEGMENT = {0: 6, 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 7}


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def _julian_day_ut(dt_utc: datetime) -> float:
    j2000_epoch = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    return 2451545.0 + (dt_utc - j2000_epoch).total_seconds() / 86400.0


def _sun_moon_longitudes(jd: float) -> tuple[float, float]:
    flags = CalcFlags.SIDEREAL | CalcFlags.SWIEPH
    sun_lon = eph.calc_ut(jd, Body.SUN, flags).data[0]
    moon_lon = eph.calc_ut(jd, Body.MOON, flags).data[0]
    return sun_lon % 360, moon_lon % 360


def _find_end_time(start_utc: datetime, target_index: int, unit_deg: float, diff: bool, max_hours: int = 30) -> datetime:
    step = timedelta(minutes=2)
    cur = start_utc
    end = start_utc + timedelta(hours=max_hours)
    prev_idx = target_index
    while cur < end:
        jd = _julian_day_ut(cur)
        sun_lon, moon_lon = _sun_moon_longitudes(jd)
        val = (moon_lon - sun_lon) % 360 if diff else moon_lon
        idx = int(val / unit_deg)
        if idx != prev_idx:
            lo, hi = cur - step, cur
            for _ in range(10):
                mid = lo + (hi - lo) / 2
                jdm = _julian_day_ut(mid)
                sl, ml = _sun_moon_longitudes(jdm)
                v = (ml - sl) % 360 if diff else ml
                i = int(v / unit_deg)
                if i == prev_idx:
                    lo = mid
                else:
                    hi = mid
            return hi
        cur += step
    return end


def _hindu_month_index(sun_lon_at_amavasya: float) -> int:
    rashi = int(sun_lon_at_amavasya / 30)
    return (rashi + 1) % 12


def _find_prev_new_moon(dt_utc: datetime) -> datetime:
    return _find_moon_phase(dt_utc, target_diff=0.0, direction=-1)


def _find_next_new_moon(dt_utc: datetime) -> datetime:
    return _find_moon_phase(dt_utc, target_diff=0.0, direction=1)


def _find_prev_full_moon(dt_utc: datetime) -> datetime:
    return _find_moon_phase(dt_utc, target_diff=180.0, direction=-1)


def _find_moon_phase(dt_utc: datetime, target_diff: float, direction: int) -> datetime:
    step = timedelta(hours=6) * direction
    cur = dt_utc
    for _ in range(240):
        jd = _julian_day_ut(cur)
        sun_lon, moon_lon = _sun_moon_longitudes(jd)
        d = (moon_lon - sun_lon) % 360
        signed = ((d - target_diff + 180) % 360) - 180
        if abs(signed) < 3:
            lo, hi = cur - step, cur + step
            for _ in range(30):
                mid = lo + (hi - lo) / 2
                jdm = _julian_day_ut(mid)
                sl, ml = _sun_moon_longitudes(jdm)
                dm = (ml - sl) % 360
                sm = ((dm - target_diff + 180) % 360) - 180
                if sm * signed > 0:
                    lo = mid
                else:
                    hi = mid
                signed = sm
            return lo + (hi - lo) / 2
        cur += step
    return dt_utc


def _moon_events(jd_start: float, lat: float, lon: float) -> tuple[datetime | None, datetime | None]:
    geopos = (lon, lat, 0.0)
    try:
        rise_res = eph.rise_trans(jd_start, Body.MOON, None, CalcFlags.SWIEPH, RiseSetFlags.RISE, geopos, 0.0, 0.0)
        rise_jd = rise_res.time if hasattr(rise_res, "time") else (rise_res[0] if isinstance(rise_res, tuple) else rise_res.data[0])
    except Exception:
        rise_jd = None

    try:
        set_res = eph.rise_trans(jd_start, Body.MOON, None, CalcFlags.SWIEPH, RiseSetFlags.SET, geopos, 0.0, 0.0)
        set_jd = set_res.time if hasattr(set_res, "time") else (set_res[0] if isinstance(set_res, tuple) else set_res.data[0])
    except Exception:
        set_jd = None

    def _to_dt(j):
        if j is None: return None
        j2000_epoch = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        return j2000_epoch + timedelta(days=(j - 2451545.0))

    return _to_dt(rise_jd), _to_dt(set_jd)


def compute_panchangam(target_date: date, lat: float, lon: float, tz_offset_min: int, calendar_type: str = "suryamana") -> dict[str, Any]:
    tz = timezone(timedelta(minutes=tz_offset_min))

    loc = LocationInfo("here", "in", "UTC", lat, lon)
    try:
        s = sun(loc.observer, date=target_date, tzinfo=tz)
        sunrise = s["sunrise"]
        sunset = s["sunset"]
        solar_noon = s["noon"]
    except Exception:
        sunrise = datetime.combine(target_date, time(6, 0), tzinfo=tz)
        sunset = datetime.combine(target_date, time(18, 0), tzinfo=tz)
        solar_noon = datetime.combine(target_date, time(12, 0), tzinfo=tz)

    day_length_sec = (sunset - sunrise).total_seconds()
    day_len_h = int(day_length_sec // 3600)
    day_len_m = int((day_length_sec % 3600) // 60)

    sunrise_utc = sunrise.astimezone(timezone.utc)
    jd_sunrise = _julian_day_ut(sunrise_utc)
    sun_lon, moon_lon = _sun_moon_longitudes(jd_sunrise)

    diff = (moon_lon - sun_lon) % 360
    tithi_idx = int(diff / 12)
    tithi_name = TITHI_NAMES[tithi_idx]
    tithi_end_utc = _find_end_time(sunrise_utc, tithi_idx, 12.0, diff=True)
    paksha = PAKSHA_NAMES[0] if tithi_idx < 15 else PAKSHA_NAMES[1]

    nakshatra_unit = 360.0 / 27
    nakshatra_idx = int(moon_lon / nakshatra_unit)
    nakshatra_name = NAKSHATRA_NAMES[nakshatra_idx]
    nakshatra_end_utc = _find_end_time(sunrise_utc, nakshatra_idx, nakshatra_unit, diff=False)

    yoga_val = (sun_lon + moon_lon) % 360
    yoga_idx = int(yoga_val / nakshatra_unit)
    yoga_name = YOGA_NAMES[yoga_idx]

    def _find_yoga_end():
        step = timedelta(minutes=5)
        cur = sunrise_utc
        end = sunrise_utc + timedelta(hours=30)
        prev = yoga_idx
        while cur < end:
            jd = _julian_day_ut(cur)
            sl, ml = _sun_moon_longitudes(jd)
            v = (sl + ml) % 360
            i = int(v / nakshatra_unit)
            if i != prev: return cur
            cur += step
        return end
    yoga_end_utc = _find_yoga_end()

    karana_full_idx = int(diff / 6)
    if karana_full_idx == 0:
        karana_name = KARANA_NAMES[10]
    elif karana_full_idx >= 57:
        karana_name = KARANA_NAMES[7 + (karana_full_idx - 57)]
    else:
        karana_name = KARANA_NAMES[(karana_full_idx - 1) % 7]
    karana_end_utc = _find_end_time(sunrise_utc, karana_full_idx, 6.0, diff=True)

    weekday = target_date.weekday()
    vara_name = VARA_NAMES[weekday]

    samvatsara_start_year = target_date.year if target_date.month >= 4 else target_date.year - 1
    sam_idx = (samvatsara_start_year - 2020 + 33) % 60
    samvatsara = SAMVATSARA_NAMES[sam_idx]

    md = (target_date.month, target_date.day)
    ayanam = AYANAM_NAMES[0] if (1, 14) <= md < (7, 16) else AYANAM_NAMES[1]

    sun_rashi = int(sun_lon / 30)
    ritu_map = {
        0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3, 8: 4, 9: 4, 10: 5, 11: 5,
    }
    ritu = RITU_NAMES[ritu_map[sun_rashi]]

    if calendar_type == "suryamana":
        masa = MASA_NAMES[sun_rashi]
        masa_label = "Māsa"
    elif calendar_type == "amanta":
        prev_nm = _find_prev_new_moon(sunrise_utc)
        jd_nm = _julian_day_ut(prev_nm)
        sun_at_nm, _ = _sun_moon_longitudes(jd_nm)
        masa = MASA_NAMES[_hindu_month_index(sun_at_nm)]
        masa_label = "Māsa (Amānta)"
    else:
        prev_fm = _find_prev_full_moon(sunrise_utc)
        next_nm = _find_next_new_moon(prev_fm)
        jd_nm = _julian_day_ut(next_nm)
        sun_at_nm, _ = _sun_moon_longitudes(jd_nm)
        masa = MASA_NAMES[_hindu_month_index(sun_at_nm)]
        masa_label = "Māsa (Pūrṇimānta)"

    try:
        mrise_utc, mset_utc = _moon_events(jd_sunrise - 0.5, lat, lon)
        moonrise = mrise_utc.astimezone(tz) if mrise_utc else None
        moonset = mset_utc.astimezone(tz) if mset_utc else None
    except Exception:
        moonrise, moonset = None, None

    # Continuous 8 segments for the Kala Chakra Wheel
    next_sunrise = sunrise + timedelta(days=1)
    day_duration = sunset - sunrise
    night_duration = next_sunrise - sunset
    
    day_part = day_duration / 5
    night_part = night_duration / 3

    p_start, p_end = sunrise, sunrise + day_part
    s_start, s_end = p_end, p_end + day_part
    m_start, m_end = s_end, s_end + day_part
    a_start, a_end = m_end, m_end + day_part
    sy_start, sy_end = a_end, sunset
    
    pr_start, pr_end = sunset, sunset + night_part
    n_start, n_end = pr_end, pr_end + night_part
    b_start, b_end = n_end, next_sunrise

    wheel_kalas = [
        {"id": "pratah", "name": {"en": "Prātaḥ Kāla", "te": "ప్రాతః కాలం"}, "start": _fmt_time(p_start.astimezone(tz)), "end": _fmt_time(p_end.astimezone(tz))},
        {"id": "sangava", "name": {"en": "Sangava Kāla", "te": "సంగవ కాలం"}, "start": _fmt_time(s_start.astimezone(tz)), "end": _fmt_time(s_end.astimezone(tz))},
        {"id": "madhyahna", "name": {"en": "Madhyāhna Kāla", "te": "మధ్యాహ్న కాలం"}, "start": _fmt_time(m_start.astimezone(tz)), "end": _fmt_time(m_end.astimezone(tz))},
        {"id": "aparahna", "name": {"en": "Aparāhṇa Kāla", "te": "అపరాహ్ణ కాలం"}, "start": _fmt_time(a_start.astimezone(tz)), "end": _fmt_time(a_end.astimezone(tz))},
        {"id": "sayahna", "name": {"en": "Sāyāhna Kāla", "te": "సాయాహ్న కాలం"}, "start": _fmt_time(sy_start.astimezone(tz)), "end": _fmt_time(sy_end.astimezone(tz))},
        {"id": "pradosha", "name": {"en": "Pradoṣa Kāla", "te": "ప్రదోష కాలం"}, "start": _fmt_time(pr_start.astimezone(tz)), "end": _fmt_time(pr_end.astimezone(tz))},
        {"id": "nishita", "name": {"en": "Niśita Kāla", "te": "నిశిత కాలం"}, "start": _fmt_time(n_start.astimezone(tz)), "end": _fmt_time(n_end.astimezone(tz))},
        {"id": "brahma", "name": {"en": "Brahma Muhūrta", "te": "బ్రహ్మ ముహూర్తం"}, "start": _fmt_time(b_start.astimezone(tz)), "end": _fmt_time(b_end.astimezone(tz))}
    ]

    tithi_till = {
        "en": f"{TILL['en']} {_fmt_time(tithi_end_utc.astimezone(tz))}",
        "te": f"{_fmt_time(tithi_end_utc.astimezone(tz))} {TILL['te']}",
    }
    nakshatra_till = {
        "en": f"{TILL['en']} {_fmt_time(nakshatra_end_utc.astimezone(tz))}",
        "te": f"{_fmt_time(nakshatra_end_utc.astimezone(tz))} {TILL['te']}",
    }
    yoga_till = {
        "en": f"{TILL['en']} {_fmt_time(yoga_end_utc.astimezone(tz))}",
        "te": f"{_fmt_time(yoga_end_utc.astimezone(tz))} {TILL['te']}",
    }
    karana_till = {
        "en": f"{TILL['en']} {_fmt_time(karana_end_utc.astimezone(tz))}",
        "te": f"{_fmt_time(karana_end_utc.astimezone(tz))} {TILL['te']}",
    }

    return {
        "date": target_date.isoformat(),
        "weekday": weekday,
        "calendar_type": calendar_type,
        "general": {
            "samvatsara": samvatsara,
            "ayanam": ayanam,
            "ritu": ritu,
            "masa": masa,
            "masa_label": masa_label,
            "paksha": paksha,
            "tithi": tithi_name,
            "tithi_till": tithi_till,
            "vara": vara_name,
            "nakshatra": nakshatra_name,
            "nakshatra_till": nakshatra_till,
            "yoga": yoga_name,
            "yoga_till": yoga_till,
            "karana": karana_name,
            "karana_till": karana_till
        },
        "solar": {
            "sunrise": _fmt_time(sunrise),
            "sunset": _fmt_time(sunset),
            "solar_noon": _fmt_time(solar_noon),
            "day_length": f"{day_len_h}h {day_len_m}m",
            "sunrise_iso": sunrise.isoformat(),
            "sunset_iso": sunset.isoformat(),
        },
        "lunar": {
            "moonrise": _fmt_time(moonrise) if moonrise else "—",
            "moonset": _fmt_time(moonset) if moonset else "—",
            "moon_illumination": round(50 * (1 - math.cos(math.radians(diff))), 1),
        },
        "kalas": {
            "wheel": wheel_kalas
        }
    }
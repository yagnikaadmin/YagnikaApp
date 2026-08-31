from datetime import date, datetime, timedelta
import json
import pytz
import swisseph as swe

# Set ephemeris path (default Swiss Ephemeris path)
swe.set_ephe_path("")

# ---------------------------------------------------------
# CONSTANTS & BILINGUAL DICTIONARIES
# ---------------------------------------------------------

WEEKDAYS = [
    {"en": "Sunday", "te": "à°†à°¦à°¿à°µà°¾à°°à°‚"},
    {"en": "Monday", "te": "à°¸à±‹à°®à°µà°¾à°°à°‚"},
    {"en": "Tuesday", "te": "à°®à°‚à°—à°³à°µà°¾à°°à°‚"},
    {"en": "Wednesday", "te": "à°¬à±à°§à°µà°¾à°°à°‚"},
    {"en": "Thursday", "te": "à°—à±à°°à±à°µà°¾à°°à°‚"},
    {"en": "Friday", "te": "à°¶à±à°•à±à°°à°µà°¾à°°à°‚"},
    {"en": "Saturday", "te": "à°¶à°¨à°¿à°µà°¾à°°à°‚"},
]

TITHIS = [
    {"en": "Prathama", "te": "à°ªà°¾à°¡à±à°¯à°®à°¿"},
    {"en": "Dwitiya", "te": "à°µà°¿à°¦à°¿à°¯"},
    {"en": "Tritiya", "te": "à°¤à°¦à°¿à°¯"},
    {"en": "Chaturthi", "te": "à°šà°µà°¿à°¤à°¿"},
    {"en": "Panchami", "te": "à°ªà°‚à°šà°®à°¿"},
    {"en": "Shashthi", "te": "à°·à°·à±à°Ÿà°¿"},
    {"en": "Saptami", "te": "à°¸à°ªà±à°¤à°®à°¿"},
    {"en": "Ashtami", "te": "à°…à°·à±à°Ÿà°®à°¿"},
    {"en": "Navami", "te": "à°¨à°µà°®à°¿"},
    {"en": "Dashami", "te": "à°¦à°¶à°®à°¿"},
    {"en": "Ekadashi", "te": "à°à°•à°¾à°¦à°¶à°¿"},
    {"en": "Dwadashi", "te": "à°¦à±à°µà°¾à°¦à°¶à°¿"},
    {"en": "Trayodashi", "te": "à°¤à±à°°à°¯à±‹à°¦à°¶à°¿"},
    {"en": "Chaturdashi", "te": "à°šà°¤à±à°°à±à°¦à°¶à°¿"},
    {"en": "Purnima", "te": "à°ªà±Œà°°à±à°£à°®à°¿"},
    {"en": "Amavasya", "te": "à°…à°®à°¾à°µà°¾à°¸à±à°¯"},
]

NAKSHATRAS = [
    {"en": "Ashwini", "te": "à°…à°¶à±à°µà°¿à°¨à°¿"},
    {"en": "Bharani", "te": "à°­à°°à°£à°¿"},
    {"en": "Krittika", "te": "à°•à±ƒà°¤à±à°¤à°¿à°•"},
    {"en": "Rohini", "te": "à°°à±‹à°¹à°¿à°£à°¿"},
    {"en": "Mrigashirsha", "te": "à°®à±ƒà°—à°¶à°¿à°°"},
    {"en": "Ardra", "te": "à°†à°°à±à°¦à±à°°"},
    {"en": "Punarvasu", "te": "à°ªà±à°¨à°°à±à°µà°¸à±"},
    {"en": "Pushya", "te": "à°ªà±à°·à±à°¯à°®à°¿"},
    {"en": "Ashlesha", "te": "à°†à°¶à±à°²à±‡à°·"},
    {"en": "Magha", "te": "à°®à°˜"},
    {"en": "Purva Phalguni", "te": "à°ªà±‚à°°à±à°µà°«à°²à±à°—à±à°£à°¿"},
    {"en": "Uttara Phalguni", "te": "à°‰à°¤à±à°¤à°°à°«à°²à±à°—à±à°£à°¿"},
    {"en": "Hasta", "te": "à°¹à°¸à±à°¤"},
    {"en": "Chitra", "te": "à°šà°¿à°¤à±à°¤"},
    {"en": "Swati", "te": "à°¸à±à°µà°¾à°¤à°¿"},
    {"en": "Vishakha", "te": "à°µà°¿à°¶à°¾à°–"},
    {"en": "Anuradha", "te": "à°…à°¨à±à°°à°¾à°§"},
    {"en": "Jyeshtha", "te": "à°œà±à°¯à±‡à°·à±à° "},
    {"en": "Mula", "te": "à°®à±‚à°²"},
    {"en": "Purva Ashadha", "te": "à°ªà±‚à°°à±à°µà°¾à°·à°¾à°¢"},
    {"en": "Uttara Ashadha", "te": "à°‰à°¤à±à°¤à°°à°¾à°·à°¾à°¢"},
    {"en": "Shravana", "te": "à°¶à±à°°à°µà°£à°‚"},
    {"en": "Dhanishta", "te": "à°§à°¨à°¿à°·à±à°Ÿ"},
    {"en": "Shatabhisha", "te": "à°¶à°¤à°­à°¿à°·"},
    {"en": "Purva Bhadrapada", "te": "à°ªà±‚à°°à±à°µà°¾à°­à°¾à°¦à±à°°"},
    {"en": "Uttara Bhadrapada", "te": "à°‰à°¤à±à°¤à°°à°¾à°­à°¾à°¦à±à°°"},
    {"en": "Revati", "te": "à°°à±‡à°µà°¤à°¿"},
]

YOGAS = [
    {"en": "Vishkambha", "te": "à°µà°¿à°·à±à°•à°‚à°­à°‚"},
    {"en": "Priti", "te": "à°ªà±à°°à±€à°¤à°¿"},
    {"en": "Ayushman", "te": "à°†à°¯à±à°·à±à°®à°¾à°¨à±"},
    {"en": "Saubhagya", "te": "à°¸à±Œà°­à°¾à°—à±à°¯"},
    {"en": "Sobhana", "te": "à°¶à±‹à°­à°¨"},
    {"en": "Atiganda", "te": "à°…à°¤à°¿à°—à°‚à°¡"},
    {"en": "Sukarma", "te": "à°¸à±à°•à°°à±à°®"},
    {"en": "Dhriti", "te": "à°§à±ƒà°¤à°¿"},
    {"en": "Shula", "te": "à°¶à±‚à°²"},
    {"en": "Ganda", "te": "à°—à°‚à°¡"},
    {"en": "Vriddhi", "te": "à°µà±ƒà°¦à±à°§à°¿"},
    {"en": "Dhruva", "te": "à°§à±à°°à±à°µ"},
    {"en": "Vyaghata", "te": "à°µà±à°¯à°¾à°˜à°¾à°¤"},
    {"en": "Harshana", "te": "à°¹à°°à±à°·à°£"},
    {"en": "Vajra", "te": "à°µà°œà±à°°"},
    {"en": "Siddhi", "te": "à°¸à°¿à°¦à±à°§à°¿"},
    {"en": "Vyatipata", "te": "à°µà±à°¯à°¤à±€à°ªà°¾à°¤"},
    {"en": "Variyan", "te": "à°µà°°à°¿à°¯à°¾à°¨à±"},
    {"en": "Parigha", "te": "à°ªà°°à°¿à°˜"},
    {"en": "Shiva", "te": "à°¶à°¿à°µ"},
    {"en": "Siddha", "te": "à°¸à°¿à°¦à±à°§"},
    {"en": "Sadhya", "te": "à°¸à°¾à°§à±à°¯"},
    {"en": "Shubha", "te": "à°¶à±à°­"},
    {"en": "Shukla", "te": "à°¶à±à°•à±à°²"},
    {"en": "Brahma", "te": "à°¬à±à°°à°¹à±à°®"},
    {"en": "Aindra", "te": "à°à°‚à°¦à±à°°"},
    {"en": "Vaidhriti", "te": "à°µà±ˆà°§à±ƒà°¤à°¿"},
]

KARANAS = [
    {"en": "Bava", "te": "à°¬à°µ"},
    {"en": "Balava", "te": "à°¬à°¾à°²à°µ"},
    {"en": "Kaulava", "te": "à°•à±Œà°²à°µ"},
    {"en": "Taitila", "te": "à°¤à±ˆà°¤à°¿à°²"},
    {"en": "Garaja", "te": "à°—à°°à°œ"},
    {"en": "Vanija", "te": "à°µà°£à°¿à°œ"},
    {"en": "Vishti", "te": "à°­à°¦à±à°° (à°µà°¿à°·à±à°Ÿà°¿)"},
    {"en": "Shakuni", "te": "à°¶à°•à±à°¨à°¿"},
    {"en": "Chatushpada", "te": "à°šà°¤à±à°·à±à°ªà°¾à°¤à±"},
    {"en": "Naga", "te": "à°¨à°¾à°—à°µà°¤à±"},
    {"en": "Kintughna", "te": "à°•à°¿à°‚à°¸à±à°¤à±à°˜à±à°¨"},
]

RASHIS = [
    {"en": "Mesha (Aries)", "te": "à°®à±‡à°· à°°à°¾à°¶à°¿"},
    {"en": "Vrishabha (Taurus)", "te": "à°µà±ƒà°·à°­ à°°à°¾à°¶à°¿"},
    {"en": "Mithuna (Gemini)", "te": "à°®à°¿à°¥à±à°¨ à°°à°¾à°¶à°¿"},
    {"en": "Karka (Cancer)", "te": "à°•à°°à±à°•à°¾à°Ÿà°• à°°à°¾à°¶à°¿"},
    {"en": "Simha (Leo)", "te": "à°¸à°¿à°‚à°¹ à°°à°¾à°¶à°¿"},
    {"en": "Kanya (Virgo)", "te": "à°•à°¨à±à°¯à°¾ à°°à°¾à°¶à°¿"},
    {"en": "Tula (Libra)", "te": "à°¤à±à°²à°¾ à°°à°¾à°¶à°¿"},
    {"en": "Vrishchika (Scorpio)", "te": "à°µà±ƒà°¶à±à°šà°¿à°• à°°à°¾à°¶à°¿"},
    {"en": "Dhanus (Sagittarius)", "te": "à°§à°¨à±à°¸à±à°¸à± à°°à°¾à°¶à°¿"},
    {"en": "Makara (Capricorn)", "te": "à°®à°•à°° à°°à°¾à°¶à°¿"},
    {"en": "Kumbha (Aquarius)", "te": "à°•à±à°‚à°­ à°°à°¾à°¶à°¿"},
    {"en": "Meena (Pisces)", "te": "à°®à±€à°¨ à°°à°¾à°¶à°¿"},
]

MASAS = [
    {"en": "Chaitra", "te": "à°šà±ˆà°¤à±à°°à°®à±"},
    {"en": "Vaishakha", "te": "à°µà±ˆà°¶à°¾à°–à°®à±"},
    {"en": "Jyeshtha", "te": "à°œà±à°¯à±‡à°·à±à° à°®à±"},
    {"en": "Ashadha", "te": "à°†à°·à°¾à°¢à°®à±"},
    {"en": "Shravana", "te": "à°¶à±à°°à°¾à°µà°£à°®à±"},
    {"en": "Bhadrapada", "te": "à°­à°¾à°¦à±à°°à°ªà°¦à°®à±"},
    {"en": "Ashwayuja", "te": "à°†à°¶à±à°µà°¯à±à°œà°®à±"},
    {"en": "Kartika", "te": "à°•à°¾à°°à±à°¤à±€à°•à°®à±"},
    {"en": "Margashira", "te": "à°®à°¾à°°à±à°—à°¶à°¿à°°à°®à±"},
    {"en": "Pushya", "te": "à°ªà±à°·à±à°¯à°®à±"},
    {"en": "Magha", "te": "à°®à°¾à°˜à°®à±"},
    {"en": "Phalguna", "te": "à°«à°¾à°²à±à°—à±à°£à°®à±"},
]

SAMVATSARAS = [
    {"en": "Prabhava", "te": "à°ªà±à°°à°­à°µ"},
    {"en": "Vibhava", "te": "à°µà°¿à°­à°µ"},
    {"en": "Shukla", "te": "à°¶à±à°•à±à°²"},
    {"en": "Pramoduta", "te": "à°ªà±à°°à°®à±‹à°¦à±‚à°¤"},
    {"en": "Prajotpatti", "te": "à°ªà±à°°à°œà±‹à°¤à±à°ªà°¤à±à°¤à°¿"},
    {"en": "Angirasa", "te": "à°…à°‚à°—à±€à°°à°¸"},
    {"en": "Shrimukha", "te": "à°¶à±à°°à±€à°®à±à°–"},
    {"en": "Bhava", "te": "à°­à°¾à°µ"},
    {"en": "Yuva", "te": "à°¯à±à°µ"},
    {"en": "Dhata", "te": "à°§à°¾à°¤"},
    {"en": "Ishwara", "te": "à°ˆà°¶à±à°µà°°"},
    {"en": "Bahudhanya", "te": "à°¬à°¹à±à°§à°¾à°¨à±à°¯"},
    {"en": "Pramathi", "te": "à°ªà±à°°à°®à°¾à°§à°¿"},
    {"en": "Vikrama", "te": "à°µà°¿à°•à±à°°à°®"},
    {"en": "Vrusha", "te": "à°µà±ƒà°·"},
    {"en": "Chitrabhanu", "te": "à°šà°¿à°¤à±à°°à°­à°¾à°¨à±"},
    {"en": "Subhanu", "te": "à°¸à±à°µà°­à°¾à°¨à±"},
    {"en": "Taran", "te": "à°¤à°¾à°°à°£"},
    {"en": "Parthiva", "te": "à°ªà°¾à°°à±à°¥à°¿à°µ"},
    {"en": "Vyaya", "te": "à°µà±à°¯à°¯"},
    {"en": "Sarvajit", "te": "à°¸à°°à±à°µà°œà°¿à°¤à±à°¤à±"},
    {"en": "Sarvadhari", "te": "à°¸à°°à±à°µà°§à°¾à°°à°¿"},
    {"en": "Virodhi", "te": "à°µà°¿à°°à±‹à°§à°¿"},
    {"en": "Vikruti", "te": "à°µà°¿à°•à±ƒà°¤à°¿"},
    {"en": "Khara", "te": "à°–à°°"},
    {"en": "Nandana", "te": "à°¨à°‚à°¦à°¨"},
    {"en": "Vijaya", "te": "à°µà°¿à°œà°¯"},
    {"en": "Jaya", "te": "à°œà°¯"},
    {"en": "Manmatha", "te": "à°®à°¨à±à°®à°¥"},
    {"en": "Durmukhi", "te": "à°¦à±à°°à±à°®à±à°–à°¿"},
    {"en": "Hemalambi", "te": "à°¹à±‡à°®à°²à°‚à°¬à°¿"},
    {"en": "Vilambi", "te": "à°µà°¿à°²à°‚à°¬à°¿"},
    {"en": "Vikari", "te": "à°µà°¿à°•à°¾à°°à°¿"},
    {"en": "Sharvari", "te": "à°¶à°¾à°°à±à°µà°°à°¿"},
    {"en": "Plava", "te": "à°ªà±à°²à°µ"},
    {"en": "Shubhakrut", "te": "à°¶à±à°­à°•à±ƒà°¤à±"},
    {"en": "Shobhakrut", "te": "à°¶à±‹à°­à°•à±ƒà°¤à±"},
    {"en": "Krodhi", "te": "à°•à±à°°à±‹à°§à°¿"},
    {"en": "Viswavasu", "te": "à°µà°¿à°¶à±à°µà°¾à°µà°¸à±"},
    {"en": "Parabhava", "te": "à°ªà°°à°¾à°­à°µ"},
    {"en": "Plavanga", "te": "à°ªà±à°²à°µà°‚à°—"},
    {"en": "Keelaka", "te": "à°•à±€à°²à°•"},
    {"en": "Saumya", "te": "à°¸à±Œà°®à±à°¯"},
    {"en": "Sadharana", "te": "à°¸à°¾à°§à°¾à°°à°£"},
    {"en": "Virodhikrut", "te": "à°µà°¿à°°à±‹à°§à°¿à°•à±ƒà°¤à±"},
    {"en": "Paridhavi", "te": "à°ªà°°à°¿à°§à°¾à°µà°¿"},
    {"en": "Pramadicha", "te": "à°ªà±à°°à°®à°¾à°¦à±€à°š"},
    {"en": "Ananda", "te": "à°†à°¨à°‚à°¦"},
    {"en": "Rakshasa", "te": "à°°à°¾à°•à±à°·à°¸"},
    {"en": "Nala", "te": "à°¨à°²"},
    {"en": "Pingala", "te": "à°ªà°¿à°‚à°—à°³"},
    {"en": "Kalayukthi", "te": "à°•à°¾à°³à°¯à±à°•à±à°¤à°¿"},
    {"en": "Siddharthi", "te": "à°¸à°¿à°¦à±à°§à°¾à°°à±à°¥à°¿"},
    {"en": "Raudri", "te": "à°°à±Œà°¦à±à°°à°¿"},
    {"en": "Durmathi", "te": "à°¦à±à°°à±à°®à°¤à°¿"},
    {"en": "Dundubhi", "te": "à°¦à±à°‚à°¦à±à°­à°¿"},
    {"en": "Rudhirodgari", "te": "à°°à±à°§à°¿à°°à±‹à°¦à±à°—à°¾à°°à°¿"},
    {"en": "Raktakshi", "te": "à°°à°•à±à°¤à°¾à°•à±à°·à°¿"},
    {"en": "Krodhana", "te": "à°•à±à°°à±‹à°§à°¨"},
    {"en": "Akshaya", "te": "à°…à°•à±à°·à°¯"},
]


# ---------------------------------------------------------
# HELPER FUNCTIONS FOR CALCULATIONS
# ---------------------------------------------------------


def julian_day_from_datetime(dt_utc):
    return swe.julday(
        dt_utc.year,
        dt_utc.month,
        dt_utc.day,
        dt_utc.hour + dt_utc.minute / 60.0 + dt_utc.second / 3600.0,
    )


def jd_to_datetime(jd, tz):
    year, month, day, hour = swe.revjul(jd)
    hours = int(hour)
    minutes = int((hour - hours) * 60)
    seconds = int((((hour - hours) * 60) - minutes) * 60)
    dt_utc = datetime(
        year, month, day, hours, minutes, seconds, tzinfo=pytz.utc
    )
    return dt_utc.astimezone(tz)


def format_time_dict(dt):
    return {
        "12_hour": dt.strftime("%I:%M:%S %p"),
        "24_hour": dt.strftime("%H:%M:%S"),
    }


def get_body_sidereal_lon(jd, body):
    swe.set_sid_mode(swe.SIDM_LAHIRI)
    res = swe.calc_ut(jd, body, swe.FLG_SIDEREAL)
    return res[0][0] % 360.0


def get_rise_set_time(jd_start, body, lat, lon, flag):
    res = swe.rise_trans(
        jd_start, body, geopos=(lon, lat, 0.0), rsmi=flag | swe.BIT_DISC_CENTER
    )
    if res[0] == 0:
        return res[1][0]
    return None


def find_transition_time(jd_start, calc_fn, target_val, period_days=1.5):
    """Finds exact epoch when calc_fn(jd) crosses target_val using binary search."""
    low = jd_start
    high = jd_start + period_days

    step = 0.01
    curr = low
    while curr < high:
        val1 = calc_fn(curr)
        val2 = calc_fn(curr + step)
        if (val1 <= target_val <= val2) or (
            val1 > val2 and (target_val >= val1 or target_val <= val2)
        ):
            low = curr
            high = curr + step
            break
        curr += step

    for _ in range(25):  # Binary search precision
        mid = (low + high) / 2.0
        v_mid = calc_fn(mid)
        diff = (v_mid - target_val) % 360.0
        if diff < 180.0:
            high = mid
        else:
            low = mid
    return (low + high) / 2.0


# ---------------------------------------------------------
# SAMVATSARA LOGIC ACCORDING TO CALENDAR SYSTEM
# ---------------------------------------------------------


def calculate_samvatsara(jd_sr, cal_type_clean):
    """Calculates Samvatsara dynamically based on Chandramana (Ugadi) or Suryamana (Mesha Sankranti)."""
    year, month, day, _ = swe.revjul(jd_sr)

    if cal_type_clean == "suryamana":
        # Check Solar New Year (Mesha Sankranti: Sun crosses 0Â° Sidereal Aries in April)
        jd_april_1 = swe.julday(year, 4, 1, 0.0)
        calc_sun_lon = lambda jd: get_body_sidereal_lon(jd, swe.SUN)
        jd_sankranti = find_transition_time(
            jd_april_1, calc_sun_lon, 0.0, period_days=20
        )

        effective_year = year if jd_sr >= jd_sankranti else year - 1
    else:
        # Chandramana (Amanta/Purnimanta): New Year starts at Ugadi (Chaitra Sukla Pratipada: Moon-Sun = 0Â°)
        jd_march_1 = swe.julday(year, 3, 1, 0.0)
        calc_tithi = lambda jd: (
            get_body_sidereal_lon(jd, swe.MOON)
            - get_body_sidereal_lon(jd, swe.SUN)
        ) % 360.0
        jd_ugadi = find_transition_time(
            jd_march_1, calc_tithi, 0.0, period_days=45
        )

        effective_year = year if jd_sr >= jd_ugadi else year - 1

    # Base index relative to 1987 (1987 Prabhava = 0)
    samvatsara_idx = (effective_year - 1987) % 60
    return SAMVATSARAS[samvatsara_idx]


# ---------------------------------------------------------
# MAIN PANCHANGAM ENGINE
# ---------------------------------------------------------


def calculate_panchangam(
    target_date,
    lat,
    lon,
    city_name,
    calendar_type="chandramana_amanta",
    tz_str="Asia/Kolkata",
):
    tz = pytz.timezone(tz_str)
    dt_midnight = tz.localize(
        datetime.combine(target_date, datetime.min.time())
    )
    dt_midnight_utc = dt_midnight.astimezone(pytz.utc)
    jd_midnight = julian_day_from_datetime(dt_midnight_utc)

    # 1. Sunrise / Sunset / Moonrise / Moonset
    jd_sunrise = get_rise_set_time(
        jd_midnight, swe.SUN, lat, lon, swe.CALC_RISE
    )
    jd_sunset = get_rise_set_time(jd_midnight, swe.SUN, lat, lon, swe.CALC_SET)
    jd_moonrise = get_rise_set_time(
        jd_midnight, swe.MOON, lat, lon, swe.CALC_RISE
    )
    jd_moonset = get_rise_set_time(
        jd_midnight, swe.MOON, lat, lon, swe.CALC_SET
    )

    dt_sunrise = jd_to_datetime(jd_sunrise, tz)
    dt_sunset = jd_to_datetime(jd_sunset, tz)
    dt_moonrise = (
        jd_to_datetime(jd_moonrise, tz) if jd_moonrise else dt_sunrise
    )
    dt_moonset = jd_to_datetime(jd_moonset, tz) if jd_moonset else dt_sunset

    # Calculate Panchangam parameters at Sunrise moment
    jd_sr = jd_sunrise
    sun_lon = get_body_sidereal_lon(jd_sr, swe.SUN)
    moon_lon = get_body_sidereal_lon(jd_sr, swe.MOON)

    # Day duration (Dina Mana) in seconds
    dina_mana_sec = (dt_sunset - dt_sunrise).total_seconds()
    one_part_sec = dina_mana_sec / 8.0

    # 2. Tithi Calculation
    moon_sun_diff = (moon_lon - sun_lon) % 360.0
    tithi_index = int(moon_sun_diff / 12.0)  # 0 to 29
    is_sukla = tithi_index < 15
    tithi_num_in_paksha = tithi_index % 15

    tithi_dict = (
        TITHIS[tithi_num_in_paksha]
        if tithi_num_in_paksha < 14
        else (TITHIS[14] if is_sukla else TITHIS[15])
    )
    paksha_dict = (
        {"en": "Shukla Paksham", "te": "à°¶à±à°•à±à°² à°ªà°•à±à°·à°‚"}
        if is_sukla
        else {"en": "Krishna Paksham", "te": "à°•à±ƒà°·à±à°£ à°ªà°•à±à°·à°‚"}
    )

    next_tithi_target = ((tithi_index + 1) * 12.0) % 360.0
    calc_tithi_fn = lambda jd: (
        get_body_sidereal_lon(jd, swe.MOON) - get_body_sidereal_lon(jd, swe.SUN)
    ) % 360.0
    jd_tithi_end = find_transition_time(
        jd_sr, calc_tithi_fn, next_tithi_target
    )
    dt_tithi_end = jd_to_datetime(jd_tithi_end, tz)

    # 3. Nakshatra Calculation
    nakshatra_index = int(moon_lon / (360.0 / 27.0))
    next_nak_target = ((nakshatra_index + 1) * (360.0 / 27.0)) % 360.0
    calc_nak_fn = lambda jd: get_body_sidereal_lon(jd, swe.MOON)
    jd_nak_end = find_transition_time(jd_sr, calc_nak_fn, next_nak_target)
    dt_nak_end = jd_to_datetime(jd_nak_end, tz)

    # 4. Yoga Calculation
    yoga_val = (sun_lon + moon_lon) % 360.0
    yoga_index = int(yoga_val / (360.0 / 27.0))

    # 5. Karana Calculation
    karana_index_total = int(moon_sun_diff / 6.0)
    if karana_index_total == 0:
        karana_dict = KARANAS[10]  # Kintughna
    elif karana_index_total >= 57:
        karana_dict = KARANAS[
            7 + (karana_index_total - 57)
        ]  # Shakuni, Chatushpada, Naga
    else:
        karana_dict = KARANAS[(karana_index_total - 1) % 7]

    # 6. Astronomical Positions
    surya_rashi_idx = int(sun_lon / 30.0)
    chandra_rashi_idx = int(moon_lon / 30.0)

    # Calendar system logic
    cal_type_clean = calendar_type.strip().lower()

    if cal_type_clean == "suryamana":
        masa_idx = surya_rashi_idx
        masa_name = RASHIS[masa_idx]
        calendar_label = {"en": "Suryamana (Solar)", "te": "à°¸à±‚à°°à±à°¯à°®à°¾à°¨à°‚"}
    elif cal_type_clean == "chandramana_purnimanta":
        masa_offset = 1 if not is_sukla else 0
        masa_idx = (surya_rashi_idx + masa_offset) % 12
        masa_name = MASAS[masa_idx]
        calendar_label = (
            {"en": "Chandramana (Purnimanta)", "te": "à°šà°¾à°‚à°¦à±à°°à°®à°¾à°¨à°‚ (à°ªà±‚à°°à±à°£à°¿à°®à°¾à°‚à°¤)"}
        )
    else:  # 'chandramana_amanta'
        masa_idx = surya_rashi_idx % 12
        masa_name = MASAS[masa_idx]
        calendar_label = (
            {"en": "Chandramana (Amanta)", "te": "à°šà°¾à°‚à°¦à±à°°à°®à°¾à°¨à°‚ (à°…à°®à°¾à°‚à°¤)"}
        )

    # Dynamic Samvatsara evaluation
    samvatsara_dict = calculate_samvatsara(jd_sr, cal_type_clean)

    ayanam_dict = (
        {"en": "Dakshinayana", "te": "à°¦à°•à±à°·à°¿à°£à°¾à°¯à°¨à°‚"}
        if (sun_lon >= 90.0 and sun_lon < 270.0)
        else {"en": "Uttarayana", "te": "à°‰à°¤à±à°¤à°°à°¾à°¯à°£à°‚"}
    )

    # Ritu based on Surya Rashi
    ritu_map = [
        {"en": "Vasanta", "te": "à°µà°¸à°‚à°¤ à°‹à°¤à±à°µà±"},
        {"en": "Vasanta", "te": "à°µà°¸à°‚à°¤ à°‹à°¤à±à°µà±"},
        {"en": "Greeshma", "te": "à°—à±à°°à±€à°·à±à°® à°‹à°¤à±à°µà±"},
        {"en": "Greeshma", "te": "à°—à±à°°à±€à°·à±à°® à°‹à°¤à±à°µà±"},
        {"en": "Varsha", "te": "à°µà°°à±à°· à°‹à°¤à±à°µà±"},
        {"en": "Varsha", "te": "à°µà°°à±à°· à°‹à°¤à±à°µà±"},
        {"en": "Sharad", "te": "à°¶à°°à°¦à± à°‹à°¤à±à°µà±"},
        {"en": "Sharad", "te": "à°¶à°°à°¦à± à°‹à°¤à±à°µà±"},
        {"en": "Hemanta", "te": "à°¹à±‡à°®à°‚à°¤ à°‹à°¤à±à°µà±"},
        {"en": "Hemanta", "te": "à°¹à±‡à°®à°‚à°¤ à°‹à°¤à±à°µà±"},
        {"en": "Shishira", "te": "à°¶à°¿à°¶à°¿à°° à°‹à°¤à±à°µà±"},
        {"en": "Shishira", "te": "à°¶à°¿à°¶à°¿à°° à°‹à°¤à±à°µà±"},
    ]
    ritu_dict = ritu_map[surya_rashi_idx]

    # 7. Dynamic Muhurthams & Timing Periods
    wd_idx = (target_date.weekday() + 1) % 7  # 0 = Sun, 1 = Mon ... 6 = Sat

    rahu_parts = [7, 1, 6, 4, 5, 3, 2]  # Sun-Sat
    yama_parts = [4, 3, 2, 1, 0, 6, 5]
    guli_parts = [6, 5, 4, 3, 2, 1, 0]

    def get_window(part_index):
        start = dt_sunrise + timedelta(seconds=part_index * one_part_sec)
        end = start + timedelta(seconds=one_part_sec)
        return {
            "start": {
                "12_hour": start.strftime("%I:%M %p"),
                "24_hour": start.strftime("%H:%M"),
            },
            "end": {
                "12_hour": end.strftime("%I:%M %p"),
                "24_hour": end.strftime("%H:%M"),
            },
        }

    # Abhijit Muhurtham
    one_fifteenth_sec = dina_mana_sec / 15.0
    dt_abhijit_start = dt_sunrise + timedelta(seconds=7 * one_fifteenth_sec)
    dt_abhijit_end = dt_sunrise + timedelta(seconds=8 * one_fifteenth_sec)

    # Brahma Muhurtham
    dt_brahma_start = dt_sunrise - timedelta(minutes=96)
    dt_brahma_end = dt_sunrise - timedelta(minutes=48)

    # Amrutha Gadiyalu
    dt_amrutha_start = dt_sunrise + timedelta(hours=2, minutes=32)
    dt_amrutha_end = dt_amrutha_start + timedelta(hours=1, minutes=48)

    # Varjam
    dt_varjam_start = dt_sunset + timedelta(minutes=2)
    dt_varjam_end = dt_sunset + timedelta(hours=1, minutes=51)

    # Durmuhurtham slots
    dur_slots = {
        0: [13],
        1: [8, 11],
        2: [2, 7],
        3: [4],
        4: [5, 12],
        5: [3, 8],
        6: [1],
    }
    dur_times = []
    for slot in dur_slots[wd_idx]:
        s = dt_sunrise + timedelta(seconds=(slot - 1) * (dina_mana_sec / 15.0))
        e = s + timedelta(seconds=(dina_mana_sec / 15.0))
        dur_times.append(
            {
                "start": {
                    "12_hour": s.strftime("%I:%M %p"),
                    "24_hour": s.strftime("%H:%M"),
                },
                "end": {
                    "12_hour": e.strftime("%I:%M %p"),
                    "24_hour": e.strftime("%H:%M"),
                },
            }
        )

    city_te = "à°¹à±ˆà°¦à°°à°¾à°¬à°¾à°¦à±" if city_name.upper() == "HYDERABAD" else city_name

    # ---------------------------------------------------------
    # FINAL STRUCTURED JSON OUTPUT
    # ---------------------------------------------------------
    return {
        "calendar_info": {
            "gregorian_date": target_date.strftime("%d-%m-%Y"),
            "weekday": WEEKDAYS[wd_idx],
            "city": {"en": city_name.upper(), "te": city_te},
            "coordinates": {"latitude": lat, "longitude": lon},
        },
        "astronomical_timings": {
            "sunrise": {
                "label": {"en": "Sunrise", "te": "à°¸à±‚à°°à±à°¯à±‹à°¦à°¯à°‚"},
                "time": format_time_dict(dt_sunrise),
            },
            "sunset": {
                "label": {"en": "Sunset", "te": "à°¸à±‚à°°à±à°¯à°¾à°¸à±à°¤à°®à°¯à°‚"},
                "time": format_time_dict(dt_sunset),
            },
            "moonrise": {
                "label": {"en": "Moonrise", "te": "à°šà°‚à°¦à±à°°à±‹à°¦à°¯à°‚"},
                "time": format_time_dict(dt_moonrise),
            },
            "moonset": {
                "label": {"en": "Moonset", "te": "à°šà°‚à°¦à±à°°à°¾à°¸à±à°¤à°®à°¯à°‚"},
                "time": format_time_dict(dt_moonset),
            },
        },
        "panchangam_limbs_5_angas": {
            "1_tithi": {
                "label": {"en": "Tithi", "te": "à°¤à°¿à°¥à°¿"},
                "name": tithi_dict,
                "paksham": paksha_dict,
                "ends_at": format_time_dict(dt_tithi_end),
            },
            "2_vara": {
                "label": {"en": "Vara", "te": "à°µà°¾à°°à°‚"},
                "name": WEEKDAYS[wd_idx],
            },
            "3_nakshatra": {
                "label": {"en": "Nakshatra", "te": "à°¨à°•à±à°·à°¤à±à°°à°‚"},
                "name": NAKSHATRAS[nakshatra_index],
                "ends_at": format_time_dict(dt_nak_end),
            },
            "4_yoga": {
                "label": {"en": "Yoga", "te": "à°¯à±‹à°—à°‚"},
                "name": YOGAS[yoga_index],
            },
            "5_karana": {
                "label": {"en": "Karana", "te": "à°•à°°à°£à°‚"},
                "name": karana_dict,
            },
        },
        "vedic_calendar_details": {
            "calendar_system": {
                "label": {"en": "Calendar System", "te": "à°•à±à°¯à°¾à°²à±†à°‚à°¡à°°à± à°µà°¿à°§à°¾à°¨à°‚"},
                "value": calendar_label,
            },
            "samvatsara": {
                "label": {"en": "Samvatsara", "te": "à°¸à°‚à°µà°¤à±à°¸à°°à°‚"},
                "value": samvatsara_dict,
            },
            "ayanam": {
                "label": {"en": "Ayanam", "te": "à°…à°¯à°¨à°‚"},
                "value": ayanam_dict,
            },
            "ritu": {
                "label": {"en": "Ritu", "te": "à°‹à°¤à±à°µà±"},
                "value": ritu_dict,
            },
            "masa": {
                "label": {"en": "Masa", "te": "à°®à°¾à°¸à°®à±"},
                "value": masa_name,
            },
            "surya_rashi": {
                "label": {"en": "Surya Rashi", "te": "à°¸à±‚à°°à±à°¯ à°°à°¾à°¶à°¿"},
                "value": RASHIS[surya_rashi_idx],
            },
            "chandra_rashi": {
                "label": {"en": "Chandra Rashi", "te": "à°šà°‚à°¦à±à°° à°°à°¾à°¶à°¿"},
                "value": RASHIS[chandra_rashi_idx],
            },
        },
        "auspicious_timings": {
            "brahma_muhurtham": {
                "label": {"en": "Brahma Muhurtham", "te": "à°¬à±à°°à°¹à±à°® à°®à±à°¹à±‚à°°à±à°¤à°‚"},
                "time": {
                    "start": {
                        "12_hour": dt_brahma_start.strftime("%I:%M %p"),
                        "24_hour": dt_brahma_start.strftime("%H:%M"),
                    },
                    "end": {
                        "12_hour": dt_brahma_end.strftime("%I:%M %p"),
                        "24_hour": dt_brahma_end.strftime("%H:%M"),
                    },
                },
            },
            "abhijit_muhurtham": {
                "label": {"en": "Abhijit Muhurtham", "te": "à°…à°­à°¿à°œà°¿à°¤à± à°®à±à°¹à±‚à°°à±à°¤à°‚"},
                "time": {
                    "start": {
                        "12_hour": dt_abhijit_start.strftime("%I:%M %p"),
                        "24_hour": dt_abhijit_start.strftime("%H:%M"),
                    },
                    "end": {
                        "12_hour": dt_abhijit_end.strftime("%I:%M %p"),
                        "24_hour": dt_abhijit_end.strftime("%H:%M"),
                    },
                },
            },
            "amrutha_gadiyalu": {
                "label": {"en": "Amrutha Gadiyalu", "te": "à°…à°®à±ƒà°¤ à°˜à°¡à°¿à°¯à°²à±"},
                "time": {
                    "start": {
                        "12_hour": dt_amrutha_start.strftime("%I:%M %p"),
                        "24_hour": dt_amrutha_start.strftime("%H:%M"),
                    },
                    "end": {
                        "12_hour": dt_amrutha_end.strftime("%I:%M %p"),
                        "24_hour": dt_amrutha_end.strftime("%H:%M"),
                    },
                },
            },
            "gulikakalam": {
                "label": {"en": "Gulikakalam", "te": "à°—à±à°³à°¿à°•à°•à°¾à°²à°‚"},
                "time": get_window(guli_parts[wd_idx]),
            },
        },
        "inauspicious_timings": {
            "rahukalam": {
                "label": {"en": "Rahukalam", "te": "à°°à°¾à°¹à±à°•à°¾à°²à°‚"},
                "time": get_window(rahu_parts[wd_idx]),
            },
            "yamagandam": {
                "label": {"en": "Yamagandam", "te": "à°¯à°®à°—à°‚à°¡à°‚"},
                "time": get_window(yama_parts[wd_idx]),
            },
            "durmuhurtham": {
                "label": {"en": "Durmuhurtham", "te": "à°¦à±à°°à±à°®à±à°¹à±‚à°°à±à°¤à°‚"},
                "time": dur_times,
            },
            "varjam": {
                "label": {"en": "Varjam", "te": "à°µà°°à±à°œà±à°¯à°‚"},
                "time": {
                    "start": {
                        "12_hour": dt_varjam_start.strftime("%I:%M %p"),
                        "24_hour": dt_varjam_start.strftime("%H:%M"),
                    },
                    "end": {
                        "12_hour": dt_varjam_end.strftime("%I:%M %p"),
                        "24_hour": dt_varjam_end.strftime("%H:%M"),
                    },
                },
            },
        },
    }


# ---------------------------------------------------------
# EXECUTION
# ---------------------------------------------------------
if __name__ == "__main__":
    target_dt = date(2026, 7, 20)
    panchang_data = calculate_panchangam(
        target_dt,
        17.385,
        78.4867,
        "HYDERABAD",
        calendar_type="chandramana_purnimanta",
    )

    print(json.dumps(panchang_data, indent=2, ensure_ascii=False))

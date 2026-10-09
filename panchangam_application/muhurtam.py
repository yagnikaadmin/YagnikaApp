import datetime
import math
import urllib.request
import json
from dataclasses import dataclass
from typing import List, Tuple, Optional

# Import the stateless Rust port bindings of Swiss Ephemeris
from swisseph_rs import Ephemeris, EphemerisConfig, EphemerisSource, Body, CalcFlags, HouseSystem

# ==========================================
# 0. ASTROLOGICAL NAME MAPPINGS
# ==========================================

TITHI_NAMES = [
    "", "Prathama (Padyami)", "Dvitiya", "Tritiya", "Chaturthi (Chavithi)", "Panchami",
    "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami",
    "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi", "Purnima/Amavasya"
]

NAKSHATRA_NAMES = [
    "", "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"
]

RASI_NAMES = [
    "", "Mesha (Aries)", "Vrishabha (Taurus)", "Mithuna (Gemini)", "Karka (Cancer)",
    "Simha (Leo)", "Kanya (Virgo)", "Tula (Libra)", "Vrischika (Scorpio)",
    "Dhanu (Sagittarius)", "Makara (Capricorn)", "Kumbha (Aquarius)", "Meena (Pisces)"
]


# ==========================================
# 1. DATA STRUCTURES
# ==========================================

@dataclass
class AstroData:
    date: datetime.date
    window_start: datetime.datetime
    window_end: datetime.datetime
    safe_windows: List[Tuple[datetime.datetime, datetime.datetime]]
    active_month: str      # Displays the month based on the chosen system
    paksha: str
    tithi: int
    vara: int
    nakshatra: int
    moon_rasi: int
    lagna: int
    is_7th_empty: bool
    is_8th_empty: bool
    rahu_kalam: Optional[Tuple[datetime.datetime, datetime.datetime]] = None
    durmuhurtam: Optional[List[Tuple[datetime.datetime, datetime.datetime]]] = None
    varjyam: Optional[List[Tuple[datetime.datetime, datetime.datetime]]] = None


# ==========================================
# 2. PANCHANG TIME UTILITIES
# ==========================================

class PanchangTimeUtils:
    @staticmethod
    def get_rahu_kalam(date: datetime.date) -> Tuple[datetime.datetime, datetime.datetime]:
        astro_vara = (date.isoweekday() % 7) + 1
        slots = {
            1: ((16, 30), (18, 0)), 2: ((7, 30), (9, 0)),
            3: ((15, 0), (16, 30)), 4: ((12, 0), (13, 30)),
            5: ((13, 30), (15, 0)), 6: ((10, 30), (12, 0)),
            7: ((9, 0), (10, 30))
        }
        (s_h, s_m), (e_h, e_m) = slots[astro_vara]
        return (datetime.datetime.combine(date, datetime.time(s_h, s_m)),
                datetime.datetime.combine(date, datetime.time(e_h, e_m)))

    @staticmethod
    def get_durmuhurtam(date: datetime.date) -> List[Tuple[datetime.datetime, datetime.datetime]]:
        astro_vara = (date.isoweekday() % 7) + 1
        slots = {
            1: [((16, 24), (17, 12))],
            2: [((12, 24), (13, 12)), ((14, 48), (15, 36))],
            3: [((8, 24), (9, 12)), ((22, 48), (23, 36))], 
            4: [((11, 36), (12, 24))],
            5: [((10, 0), (10, 48)), ((14, 48), (15, 36))],
            6: [((8, 24), (9, 12)), ((12, 24), (13, 12))],
            7: [((7, 36), (8, 24))]
        }
        res = []
        for (s_h, s_m), (e_h, e_m) in slots[astro_vara]:
            res.append((
                datetime.datetime.combine(date, datetime.time(s_h, s_m)),
                datetime.datetime.combine(date, datetime.time(e_h, e_m))
            ))
        return res

    @staticmethod
    def subtract_intervals(window: Tuple[datetime.datetime, datetime.datetime],
                           exclusions: List[Tuple[datetime.datetime, datetime.datetime]]) -> List[Tuple[datetime.datetime, datetime.datetime]]:
        valid_windows = [window]
        for ex_start, ex_end in exclusions:
            new_windows = []
            for w_start, w_end in valid_windows:
                if ex_end <= w_start or ex_start >= w_end:
                    new_windows.append((w_start, w_end))
                else:
                    if w_start < ex_start:
                        new_windows.append((w_start, ex_start))
                    if ex_end < w_end:
                        new_windows.append((ex_end, w_end))
            valid_windows = new_windows
        return valid_windows


# ==========================================
# 3. MUHURTAM VALIDATOR
# ==========================================

class MuhurtamValidator:
    def __init__(self):
        self.taras = {
            1: ("Janma Tara", "Avoid"), 2: ("Sampat Tara", "Good"),
            3: ("Vipat Tara", "Avoid"), 4: ("Kshema Tara", "Good"),
            5: ("Pratyak Tara", "Avoid"), 6: ("Sadhana Tara", "Good"),
            7: ("Naidhana Tara", "Strictly Avoid"), 8: ("Mitra Tara", "Good"),
            9: ("Parama Mitra", "Good")
        }

        self.panchakams = {
            1: "Mrityu Panchakam", 2: "Agni Panchakam", 4: "Raja Panchakam",
            6: "Chora Panchakam", 8: "Roga Panchakam",
            3: "Favorable", 5: "Favorable", 7: "Favorable", 0: "Favorable"
        }

        self.rikta_tithis = [4, 9, 14]
        
        self.shunya_tithis = {
            "Chaitra": [8, 9], "Vaisakha": [1, 2], "Jyeshtha": [13, 4],
            "Ashada": [6, 7], "Sravana": [2, 3], "Bhadrapada": [11, 12],
            "Asweyuja": [10, 11], "Karthika": [14, 5], "Margasira": [7, 8],
            "Pushya": [4, 5], "Magha": [5, 6], "Phalguna": [3, 4]
        }

    def check_tara_balam(self, janma_nakshatra: int, muhurtam_nakshatra: int) -> Tuple[bool, str]:
        distance = (muhurtam_nakshatra - janma_nakshatra + 27) % 27 + 1
        tara_num = distance % 9 or 9
        name, status = self.taras[tara_num]
        return status == "Good", f"Tara {tara_num} ({name}): {status}"

    def check_chandra_balam(self, janma_rasi: int, moon_rasi: int, paksha: str) -> Tuple[bool, str]:
        distance = (moon_rasi - janma_rasi + 12) % 12 + 1
        favorable_houses = [1, 2, 3, 5, 6, 7, 9, 10, 11] if paksha.lower() == 'shukla' else [1, 3, 4, 6, 7, 8, 10, 11, 12]
        is_passed = distance in favorable_houses
        return is_passed, f"Moon in House {distance}. Status: {'Favorable' if is_passed else 'Unfavorable'}"

    def check_tithi_and_vara(self, tithi: int, vara: int, month: str, paksha: str) -> Tuple[bool, str]:
        if vara == 3: return False, "Tuesday is universally avoided."
        if tithi in self.rikta_tithis and vara != 7: return False, f"Tithi {tithi} is a Rikta Tithi."
        if tithi in [6, 11] and vara in [1, 3]: return False, f"Tithi {tithi} on Vara {vara} is a Mrityu Tithi."
        
        if month:
            clean_month = month.replace("Adhika ", "").replace("Nija ", "").replace("Kshaya ", "")
            if clean_month in self.shunya_tithis:
                shunya_shukla, shunya_krishna = self.shunya_tithis[clean_month]
                if (paksha.lower() == 'shukla' and tithi == shunya_shukla) or \
                   (paksha.lower() == 'krishna' and tithi == shunya_krishna):
                    return False, f"Tithi {tithi} is Shunya (Void) for {clean_month}."
        return True, "Tithi and Vara are acceptable."

    def check_souramana_masam(self, souramana_month: str) -> Tuple[bool, str]:
        restricted_solar_months = ["Karka (Aadi)", "Dhanus (Margazhi)", "Meena"]
        if souramana_month in restricted_solar_months:
            return False, f"{souramana_month} Masa is generally restricted for auspicious events in Souramana."
        return True, f"{souramana_month} Masa is acceptable."

    def check_panchaka_rahitam(self, tithi: int, vara: int, nakshatra: int, lagna: int) -> Tuple[bool, str]:
        remainder = (tithi + vara + nakshatra + lagna) % 9
        status = self.panchakams[remainder]
        return remainder in [3, 5, 7, 0], f"Remainder {remainder}: {status}"

    def validate(self, janma_nakshatra: int, janma_rasi: int, astro_data: AstroData) -> bool:
        t_pass, _ = self.check_tara_balam(janma_nakshatra, astro_data.nakshatra)
        c_pass, _ = self.check_chandra_balam(janma_rasi, astro_data.moon_rasi, astro_data.paksha)
        p_pass, _ = self.check_panchaka_rahitam(astro_data.tithi, astro_data.vara, astro_data.nakshatra, astro_data.lagna)
        
        # Currently placeholders - needs exact Graha Shuddhi calculation for major events
        g_pass = astro_data.is_7th_empty and astro_data.is_8th_empty
        return all([t_pass, c_pass, p_pass, g_pass])


# ==========================================
# 4. SWISSEPH-RS ASTRONOMICAL ENGINE
# ==========================================

class SwissEphRsEngine:
    def __init__(self, ephe_path: str, lat: float, lon: float):
        config = EphemerisConfig(ephemeris_source=EphemerisSource.MOSHIER)
        self.eph = Ephemeris(config)
        self.lat = lat
        self.lon = lon
        self.flags = CalcFlags.SPEED 

    def _datetime_to_jd(self, dt: datetime.datetime) -> float:
        epoch = datetime.datetime(1970, 1, 1)
        delta = dt - epoch
        return 2440587.5 + (delta.total_seconds() / 86400.0)
        
    def _jd_to_datetime(self, jd: float) -> datetime.datetime:
        epoch = datetime.datetime(1970, 1, 1)
        return epoch + datetime.timedelta(days=(jd - 2440587.5))

    def _get_lahiri_ayanamsa(self, jd: float) -> float:
        years_since_2000 = (jd - 2451545.0) / 365.25
        return 23.853 + (years_since_2000 * 0.0139694)

    def _get_sidereal_sun(self, jd: float) -> float:
        sun_trop = self.eph.calc_ut(jd, Body.SUN, self.flags).data[0]
        aya = self._get_lahiri_ayanamsa(jd)
        return (sun_trop - aya) % 360.0

    def _get_moon_sun_diff(self, jd: float) -> float:
        sun = self.eph.calc_ut(jd, Body.SUN, self.flags).data[0]
        moon = self.eph.calc_ut(jd, Body.MOON, self.flags).data[0]
        return (moon - sun) % 360.0

    def _find_amavasya_boundary(self, start_jd: float, direction: int) -> float:
        curr_jd = start_jd
        for _ in range(35):
            next_jd = curr_jd + (direction * 1.0)
            diff1 = self._get_moon_sun_diff(curr_jd)
            diff2 = self._get_moon_sun_diff(next_jd)
            
            crossed = False
            if direction == 1 and diff1 > 300 and diff2 < 60:
                crossed = True
            elif direction == -1 and diff1 < 60 and diff2 > 300:
                crossed = True
                
            if crossed:
                left = min(curr_jd, next_jd)
                right = max(curr_jd, next_jd) 
                for _ in range(30):
                    mid = (left + right) / 2.0
                    mid_diff = self._get_moon_sun_diff(mid)
                    if mid_diff > 180:
                        left = mid 
                    else:
                        right = mid 
                return (left + right) / 2.0
            curr_jd = next_jd
        return start_jd 

    def get_chandramana_month(self, jd: float) -> str:
        diff = self._get_moon_sun_diff(jd)
        days_since = diff / 12.190749
        
        mid_month_jd = jd - days_since + 14.76
        jd_prev = self._find_amavasya_boundary(mid_month_jd, -1)
        jd_next = self._find_amavasya_boundary(mid_month_jd, 1)
        
        sun_prev = self._get_sidereal_sun(jd_prev)
        sun_next = self._get_sidereal_sun(jd_next)
        
        rasi_prev = math.floor(sun_prev / 30.0)
        rasi_next = math.floor(sun_next / 30.0)
        
        telugu_months = ["Chaitra", "Vaisakha", "Jyeshtha", "Ashada", "Sravana", "Bhadrapada", 
                         "Asweyuja", "Karthika", "Margasira", "Pushya", "Magha", "Phalguna"]
                         
        if rasi_prev == rasi_next:
            return f"Adhika {telugu_months[(rasi_prev + 1) % 12]}"
        elif rasi_next == (rasi_prev + 1) % 12:
            return telugu_months[rasi_next]
        elif rasi_next == (rasi_prev + 2) % 12:
            return f"Kshaya {telugu_months[(rasi_prev + 1) % 12]}"
        
        return telugu_months[rasi_next]

    def get_souramana_month(self, jd: float) -> str:
        sun_sidereal = self._get_sidereal_sun(jd)
        rasi_idx = math.floor(sun_sidereal / 30.0)
        
        souramana_months = [
            "Mesha", "Vrishabha", "Mithuna", "Karka (Aadi)", "Simha", "Kanya", 
            "Tula", "Vrischika", "Dhanus (Margazhi)", "Makara", "Kumbha", "Meena"
        ]
        return souramana_months[rasi_idx]

    def get_daily_base_data(self, date: datetime.date) -> dict:
        dt = datetime.datetime(date.year, date.month, date.day, 6, 0)
        jd = self._datetime_to_jd(dt)
        
        diff = self._get_moon_sun_diff(jd)
        tithi_float = diff / 12.0
        tithi_total = math.floor(tithi_float) + 1 
        
        paksha = "Shukla" if tithi_total <= 15 else "Krishna"
        tithi = tithi_total if tithi_total <= 15 else tithi_total - 15
        
        moon_trop = self.eph.calc_ut(jd, Body.MOON, self.flags).data[0]
        moon_sidereal = (moon_trop - self._get_lahiri_ayanamsa(jd)) % 360.0
        
        nakshatra = math.floor(moon_sidereal / (360.0 / 27.0)) + 1
        moon_rasi = math.floor(moon_sidereal / 30.0) + 1
        
        c_month = self.get_chandramana_month(jd)
        s_month = self.get_souramana_month(jd)

        return {
            "chandramana_month": c_month,
            "souramana_month": s_month,
            "paksha": paksha,
            "tithi": tithi,
            "vara": date.isoweekday() % 7 + 1,  
            "nakshatra": nakshatra,
            "moon_rasi": moon_rasi,
            "moon_sidereal": moon_sidereal,
            "jd": jd
        }

    def get_varjyam(self, jd: float, moon_sidereal: float, nakshatra: int) -> List[Tuple[datetime.datetime, datetime.datetime]]:
        if nakshatra < 1 or nakshatra > 27: return []
            
        nak_start_deg = (nakshatra - 1) * (360.0 / 27.0)
        deg_diff = moon_sidereal - nak_start_deg
        if deg_diff < 0: deg_diff += 360
            
        hours_since_start = deg_diff / 0.549
        start_jd = jd - (hours_since_start / 24.0)
        dt_start = self._jd_to_datetime(start_jd)
        
        varjyam_start_ghatis = [
            0, 50, 24, 30, 40, 14, 21, 30, 20, 32, 30, 20, 18,
            21, 20, 14, 14, 10, 14, 20, 24, 20, 10, 10, 18,
            16, 24, 30
        ]
        
        ghatis = varjyam_start_ghatis[nakshatra]
        varjyam_start = dt_start + datetime.timedelta(minutes=ghatis * 24)
        varjyam_end = varjyam_start + datetime.timedelta(minutes=96) 
        
        return [(varjyam_start, varjyam_end)]

    def get_lagnas_for_day(self, date: datetime.date, base_data: dict, active_month: str) -> List[AstroData]:
        lagnas = []
        try: h_sys = HouseSystem.WHOLE_SIGN
        except AttributeError:
            try: h_sys = HouseSystem.WHOLE
            except AttributeError: h_sys = HouseSystem.W
        
        for hour in range(0, 24, 2):
            dt_start = datetime.datetime(date.year, date.month, date.day, hour, 0)
            dt_end = dt_start + datetime.timedelta(hours=1, minutes=59)
            jd = self._datetime_to_jd(dt_start)
            houses_res = self.eph.houses(jd, self.lat, self.lon, h_sys)
            
            if hasattr(houses_res, 'ascmc'):
                asc_trop = houses_res.ascmc.ascendant if hasattr(houses_res.ascmc, 'ascendant') else houses_res.ascmc.ac
            elif hasattr(houses_res, 'ascendant'):
                asc_trop = houses_res.ascendant
            elif hasattr(houses_res, 'ac'):
                asc_trop = houses_res.ac
            else:
                asc_trop = houses_res[1][0] 

            asc_sidereal = (asc_trop - self._get_lahiri_ayanamsa(jd)) % 360.0
            lagna_sign = math.floor(asc_sidereal / 30.0) + 1
            
            lagnas.append(AstroData(
                date=date,
                window_start=dt_start,
                window_end=dt_end,
                safe_windows=[],
                active_month=active_month,
                paksha=base_data["paksha"],
                tithi=base_data["tithi"],
                vara=base_data["vara"],
                nakshatra=base_data["nakshatra"],
                moon_rasi=base_data["moon_rasi"],
                lagna=lagna_sign,
                is_7th_empty=True, 
                is_8th_empty=True
            ))
        return lagnas


# ==========================================
# 5. MUHURTAM GENERATOR
# ==========================================

class MuhurtamGenerator:
    def __init__(self, astro_engine, validator):
        self.astro_engine = astro_engine
        self.validator = validator

    def find_muhurtams(self, start_date: datetime.date, end_date: datetime.date, 
                       janma_nakshatra: int, janma_rasi: int, sys_choice: int) -> List[AstroData]:
        
        valid_muhurtams = []
        current_date = start_date

        while current_date <= end_date:
            daily_data = self.astro_engine.get_daily_base_data(current_date)
            
            t_pass, _ = self.validator.check_tara_balam(janma_nakshatra, daily_data['nakshatra'])
            c_pass, _ = self.validator.check_chandra_balam(janma_rasi, daily_data['moon_rasi'], daily_data['paksha'])
            
            tv_pass = False
            active_month = ""

            if sys_choice == 1:
                tv_pass, _ = self.validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], daily_data['chandramana_month'], daily_data['paksha'])
                active_month = daily_data['chandramana_month']
            elif sys_choice == 2:
                tv_pass_base, _ = self.validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], "", daily_data['paksha'])
                s_month_pass, _ = self.validator.check_souramana_masam(daily_data['souramana_month'])
                tv_pass = tv_pass_base and s_month_pass
                active_month = daily_data['souramana_month']
            elif sys_choice == 3:
                tv_pass_c, _ = self.validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], daily_data['chandramana_month'], daily_data['paksha'])
                tv_pass_base, _ = self.validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], "", daily_data['paksha'])
                s_month_pass, _ = self.validator.check_souramana_masam(daily_data['souramana_month'])
                tv_pass = tv_pass_c and tv_pass_base and s_month_pass
                active_month = f"{daily_data['chandramana_month']} (C) / {daily_data['souramana_month']} (S)"

            if t_pass and c_pass and tv_pass:
                lagna_windows = self.astro_engine.get_lagnas_for_day(current_date, daily_data, active_month)
                
                rahu = PanchangTimeUtils.get_rahu_kalam(current_date)
                durm = PanchangTimeUtils.get_durmuhurtam(current_date)
                varj = self.astro_engine.get_varjyam(daily_data["jd"], daily_data["moon_sidereal"], daily_data["nakshatra"])
                
                exclusions = [rahu] + durm + varj

                for window in lagna_windows:
                    if self.validator.validate(janma_nakshatra, janma_rasi, window):
                        window.rahu_kalam = rahu
                        window.durmuhurtam = durm
                        window.varjyam = varj
                        
                        safe_slots = PanchangTimeUtils.subtract_intervals(
                            (window.window_start, window.window_end), exclusions
                        )
                        
                        usable_slots = [(s, e) for s, e in safe_slots if (e - s).total_seconds() >= 600]
                        if usable_slots:
                            window.safe_windows = usable_slots
                            valid_muhurtams.append(window)
            
            current_date += datetime.timedelta(days=1)

        return valid_muhurtams


# ==========================================
# 6. COMMAND-LINE INTERFACE
# ==========================================

def display_karyakrama_scope():
    """Displays the scope and limitations of the current Muhurtam engine."""
    print("\n" + "*"*70)
    print(" ⚠️  IMPORTANT CAUTION: KARYAKRAMA SCOPE & LIMITATIONS")
    print("*"*70)
    print("\n✅ ACCEPTED (SADHARANA KARYAKRAMAS):")
    print("   This engine perfectly calculates General Panchanga Shuddhi.")
    print("   You CAN securely use these Muhurtams for:")
    print("   - Udyoga / Vyapara Arambham (Starting jobs/business)")
    print("   - Vahana Krayam (Buying vehicles)")
    print("   - Vidya Arambham (Education/Studies)")
    print("   - Bhoomi / Gruha Krayam (Buying property/land)")
    print("   - Yatra Arambham (Travel/Pilgrimage)")
    print("   - Dravya Grahana & Krayavikrayalu (Financial/Legal signings)")
    print("\n❌ NOT YET ACCEPTED (VISHESHA KARYAKRAMAS):")
    print("   This engine currently lacks specific Graha Shuddhi (e.g., ensuring")
    print("   the 7th/8th houses from the specific Lagna are empty).")
    print("   DO NOT use these Muhurtams yet for:")
    print("   - Vivaham (Marriage - Needs 7th house empty & Venus/Jupiter check)")
    print("   - Gruhapravesam (Housewarming - Needs Sthira Lagna & 4th house check)")
    print("   - Upanayanam (Thread Ceremony - Needs strict 8th house empty check)")
    print("   - Seemantham / Namakaranam")
    print("*"*70 + "\n")

def display_results(results: List[AstroData]):
    if not results:
        print("\nNo valid Muhurtams found for the chosen system. Try extending the date range.")
        return

    grouped_results = {}
    for m in results:
        if m.date not in grouped_results:
            grouped_results[m.date] = []
        grouped_results[m.date].append(m)
        
    for date, daily_muhurtams in grouped_results.items():
        first_m = daily_muhurtams[0]
        
        tithi_name = TITHI_NAMES[first_m.tithi]
        if first_m.tithi == 15:
            tithi_name = "Purnima" if first_m.paksha == "Shukla" else "Amavasya"
            
        print(f"\n✅ VALID DATE: {date} | {first_m.active_month} Masa, {first_m.paksha} Paksha, {tithi_name}")
        print(f"   Day Nakshatra: {NAKSHATRA_NAMES[first_m.nakshatra]}")
        print("\n   [Excluded Inauspicious Timings]")
        
        rs, re = first_m.rahu_kalam
        print(f"      - Rahu Kalam : {rs.strftime('%I:%M %p')} to {re.strftime('%I:%M %p')}")
        
        durm_strs = [f"{ds.strftime('%I:%M %p')} to {de.strftime('%I:%M %p')}" for ds, de in first_m.durmuhurtam]
        print(f"      - Durmuhurtam: {', '.join(durm_strs)}")
        
        if first_m.varjyam:
            varj_strs = [f"{vs.strftime('%I:%M %p')} to {ve.strftime('%I:%M %p')}" for vs, ve in first_m.varjyam]
            print(f"      - Varjyam    : {', '.join(varj_strs)}")
        else:
            print("      - Varjyam    : None")

        print("\n   [Available Safe Muhurtam Windows]")
        for m in daily_muhurtams:
            print(f"      Lagna: {RASI_NAMES[m.lagna]} (Initial Window: {m.window_start.strftime('%I:%M %p')} - {m.window_end.strftime('%I:%M %p')})")
            for s, e in m.safe_windows:
                print(f"         ➜ Safe Slot: {s.strftime('%I:%M %p')} to {e.strftime('%I:%M %p')}")
        
        print("-" * 65)


def get_integer_input(prompt: str, min_val: int, max_val: int) -> int:
    while True:
        try:
            val = int(input(prompt))
            if min_val <= val <= max_val:
                return val
            print(f"Please enter a number between {min_val} and {max_val}.")
        except ValueError:
            print("Invalid input. Please enter a valid number.")

def get_float_input(prompt: str) -> float:
    while True:
        try:
            return float(input(prompt))
        except ValueError:
            print("Invalid input. Please enter a valid decimal number.")

def get_date_input(prompt: str) -> datetime.date:
    while True:
        date_str = input(prompt)
        try:
            return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            print("Invalid format. Please use YYYY-MM-DD.")

def get_auto_location() -> Tuple[Optional[float], Optional[float]]:
    try:
        print("\nFetching current location based on IP...")
        with urllib.request.urlopen("http://ip-api.com/json/", timeout=5) as response:
            data = json.loads(response.read().decode())
            if data['status'] == 'success':
                print(f"📍 Detected Location: {data['city']}, {data['country']} (Lat: {data['lat']}, Lon: {data['lon']})")
                return float(data['lat']), float(data['lon'])
            else:
                raise Exception("API returned a fail status.")
    except Exception as e:
        print(f"Failed to auto-detect location: {e}")
        return None, None

if __name__ == "__main__":
    print("\n" + "="*60)
    print(" WORLDWIDE ASTROLOGICAL MUHURTAM SYSTEM ")
    print("="*60)
    
    # Show the Karyakrama scope caution
    display_karyakrama_scope()
    
    print("\n--- LOCATION SETUP ---")
    print("1. Auto-detect my current location (Requires Internet)")
    print("2. Enter Latitude and Longitude manually")
    loc_choice = get_integer_input("Enter choice (1 or 2): ", 1, 2)

    LATITUDE, LONGITUDE = None, None
    if loc_choice == 1:
        LATITUDE, LONGITUDE = get_auto_location()
        if LATITUDE is None:
            print("Falling back to manual entry.")
            loc_choice = 2

    if loc_choice == 2:
        print("\n(Hint: You can find coordinates on Google Maps. Use negative numbers for South/West)")
        LATITUDE = get_float_input("Enter Latitude (e.g., 51.5074 for London): ")
        LONGITUDE = get_float_input("Enter Longitude (e.g., -0.1278 for London): ")

    EPHE_PATH = "./ephe"
    validator = MuhurtamValidator()
    
    try:
        astro_engine = SwissEphRsEngine(ephe_path=EPHE_PATH, lat=LATITUDE, lon=LONGITUDE)
        generator = MuhurtamGenerator(astro_engine, validator)
    except Exception as e:
        print(f"Failed to initialize Engine. Ensure 'swisseph_rs' is installed and ephemeris files are in '{EPHE_PATH}'. Error: {e}")
        exit(1)

    print("\n--- SYSTEM SELECTION ---")
    print("1. Chandramana (Lunar Calendar - Default in Telugu states)")
    print("2. Souramana (Solar Calendar - Default in Tamil Nadu, Kerala, Bengal)")
    print("3. Best Muhurtam (Strict Mode - Finds common dates valid in BOTH systems)")
    sys_choice = get_integer_input("Enter choice (1, 2, or 3): ", 1, 3)

    print("\n--- OPERATION MODE ---")
    print("1. Validator (Check if a specific date is good)")
    print("2. Generator (Find good Muhurtams for the next 30 days)")
    mode = get_integer_input("Enter your choice (1 or 2): ", 1, 2)

    print("\n" + "-"*30)
    print("Enter Birth Details")
    print("-"*30)
    my_nakshatra = get_integer_input("Enter Janma Nakshatra (1-27, e.g. 15 for Swati): ", 1, 27)
    my_rasi = get_integer_input("Enter Janma Rasi (1-12, e.g. 7 for Tula): ", 1, 12)

    if mode == 1:
        # ---------------- VALIDATOR MODE ----------------
        target_date = get_date_input("\nEnter the Target Date to validate (YYYY-MM-DD): ")
        
        print("\nEvaluating the cosmos...")
        daily_data = astro_engine.get_daily_base_data(target_date)
        
        tithi_name = TITHI_NAMES[daily_data['tithi']]
        if daily_data['tithi'] == 15:
            tithi_name = "Purnima" if daily_data['paksha'] == "Shukla" else "Amavasya"
            
        print("\n--- DAY OVERVIEW ---")
        print(f"Date              : {target_date}")
        print(f"Chandramana Month : {daily_data['chandramana_month']} Masa, {daily_data['paksha']} Paksha")
        print(f"Souramana Month   : {daily_data['souramana_month']} Masa")
        print(f"Tithi             : {tithi_name}")
        print(f"Nakshatra         : {NAKSHATRA_NAMES[daily_data['nakshatra']]}")
        print(f"Moon Rasi         : {RASI_NAMES[daily_data['moon_rasi']]}")
        
        print("\n--- BALAM CHECKS ---")
        t_pass, t_msg = validator.check_tara_balam(my_nakshatra, daily_data['nakshatra'])
        print(f"Tara Balam    : {'✅ Pass' if t_pass else '❌ Fail'} -> {t_msg}")
        
        c_pass, c_msg = validator.check_chandra_balam(my_rasi, daily_data['moon_rasi'], daily_data['paksha'])
        print(f"Chandra Balam : {'✅ Pass' if c_pass else '❌ Fail'} -> {c_msg}")
        
        tv_pass = False
        if sys_choice == 1:
            tv_pass, tv_msg = validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], daily_data['chandramana_month'], daily_data['paksha'])
            print(f"Tithi/Vara (C): {'✅ Pass' if tv_pass else '❌ Fail'} -> {tv_msg}")
        elif sys_choice == 2:
            tv_pass_base, tv_msg_base = validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], "", daily_data['paksha'])
            s_month_pass, s_month_msg = validator.check_souramana_masam(daily_data['souramana_month'])
            tv_pass = tv_pass_base and s_month_pass
            print(f"Tithi/Vara (S): {'✅ Pass' if tv_pass_base else '❌ Fail'} -> {tv_msg_base}")
            print(f"Solar Masa    : {'✅ Pass' if s_month_pass else '❌ Fail'} -> {s_month_msg}")
        elif sys_choice == 3:
            tv_pass_c, tv_msg_c = validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], daily_data['chandramana_month'], daily_data['paksha'])
            tv_pass_base, tv_msg_base = validator.check_tithi_and_vara(daily_data['tithi'], daily_data['vara'], "", daily_data['paksha'])
            s_month_pass, s_month_msg = validator.check_souramana_masam(daily_data['souramana_month'])
            tv_pass = tv_pass_c and tv_pass_base and s_month_pass
            print(f"Tithi/Vara (C): {'✅ Pass' if tv_pass_c else '❌ Fail'} -> {tv_msg_c}")
            print(f"Solar Masa    : {'✅ Pass' if s_month_pass else '❌ Fail'} -> {s_month_msg}")

        if not (t_pass and c_pass and tv_pass):
            print("\n❌ CONCLUSION: This date is unfavored under your selected system and rejected.")
        else:
            print("\n✅ CONCLUSION: The day is generally favorable. Finding specific safe Lagna windows...")
            results = generator.find_muhurtams(target_date, target_date, my_nakshatra, my_rasi, sys_choice)
            display_results(results)

    elif mode == 2:
        # ---------------- GENERATOR MODE ----------------
        start = datetime.date.today()
        end = start + datetime.timedelta(days=30)
        
        sys_str = ["Chandramana", "Souramana", "Best (Strict Intersection)"][sys_choice-1]
        print(f"\nScanning the cosmos for purely valid Muhurtams ({sys_str} system) from {start} to {end}...")
        results = generator.find_muhurtams(start, end, my_nakshatra, my_rasi, sys_choice)
        
        print("\n--- RESULTS FOUND ---")
        display_results(results)
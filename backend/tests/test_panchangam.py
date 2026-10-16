"""Panchangam accuracy tests against Drik Panchang (and Prokerala for Abhijit).

Every expected value below was read from drikpanchang.com (day panchang,
Choghadiya, Gowri Panchangam and Hora pages) for the stated city and date,
in October 2026. They pin the calculation to the traditional convention used
across India: the panchang day runs from sunrise to the next sunrise and a
kala belongs to the day in which it starts.

These are pure calculation tests — no server or database needed:

    cd backend
    pytest tests/test_panchangam.py -v

Times are written "HH:MM" (24h, local IST); a "+1" suffix means the next
calendar day. A tolerance of 90 seconds absorbs Drik's rounding and its
slightly different city coordinates.
"""
import os
import sys
from datetime import date, datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from panchangam.panchangam import compute_panchangam, _masa_and_adhika, _find_next_new_moon, MASA_NAMES  # noqa: E402

HYD = (17.3871, 78.4917)
CHENNAI = (13.0827, 80.2707)
IST_MIN = 330
TOLERANCE = timedelta(seconds=90)

KALAS = ("brahma_muhurta", "abhijit_muhurta", "amrita_kala", "rahukalam",
         "yamaganda", "gulika", "durmuhurta", "varjyam")


def _day(d: date, city=HYD, cal="amanta"):
    return compute_panchangam(d, city[0], city[1], IST_MIN, cal)


def _at(d: date, token: str) -> datetime:
    """'05:54+1' -> naive datetime on d (+1 day)."""
    plus = token.endswith("+1")
    hh, mm = token.removesuffix("+1").split(":")
    return datetime(d.year, d.month, d.day, int(hh), int(mm)) + timedelta(days=1 if plus else 0)


def _expected(d: date, spec: str | None) -> list[tuple[datetime, datetime]]:
    """'08:30-09:17 / 22:49-23:38' -> [(start, end), ...]; None -> []."""
    if not spec:
        return []
    out = []
    for seg in spec.split(" / "):
        a, b = seg.split("-")
        out.append((_at(d, a), _at(d, b)))
    return out


def _actual(p: dict, key: str) -> list[tuple[datetime, datetime]]:
    return [(datetime.fromisoformat(x["start"]).replace(tzinfo=None),
             datetime.fromisoformat(x["end"]).replace(tzinfo=None))
            for x in p["kala_periods"][key]]


def _clock(text: str) -> tuple[int, bool]:
    """'till 7:11 PM (+1)' -> (minutes past midnight, next_day)."""
    t = text.replace("till ", "").strip()
    nxt = t.endswith("(+1)") or t.endswith("(tomorrow)")
    t = t.replace("(+1)", "").replace("(tomorrow)", "").strip()
    hm, ampm = t.split()
    h, m = map(int, hm.split(":"))
    return (h % 12 + (12 if ampm == "PM" else 0)) * 60 + m, nxt


def _assert_clock(label, got: str, want: str):
    (g, gn), (w, wn) = _clock(got), _clock(want)
    assert gn == wn and abs(g - w) <= 1, f"{label}: expected {want!r}, got {got!r}"


def _assert_periods(d, key, got, want):
    assert len(got) == len(want), f"{d} {key}: expected {len(want)} period(s) {want}, got {got}"
    for (gs, ge), (ws, we) in zip(sorted(got), sorted(want)):
        assert abs(gs - ws) <= TOLERANCE and abs(ge - we) <= TOLERANCE, \
            f"{d} {key}: expected {ws:%d %H:%M}-{we:%d %H:%M}, got {gs:%d %H:%M}-{ge:%d %H:%M}"


# ---------------------------------------------------------------- Kala Chakra
# (date, city, {kala: "start-end / ..." or None for "none that day"})
DRIK_KALAS = [
    (date(2026, 10, 11), HYD, dict(brahma_muhurta="04:31-05:20", abhijit_muhurta="11:39-12:26", amrita_kala="15:55-17:34",
        rahukalam="16:29-17:57", yamaganda="12:03-13:31", gulika="15:00-16:29", durmuhurta="16:23-17:10", varjyam="04:27+1-06:08+1")),
    (date(2026, 10, 12), HYD, dict(brahma_muhurta="04:31-05:20", abhijit_muhurta="11:39-12:26", amrita_kala="14:35-16:16",
        rahukalam="07:37-09:05", yamaganda="10:34-12:03", gulika="13:31-15:00", durmuhurta="12:26-13:13 / 14:48-15:35", varjyam="05:54+1-07:37+1")),
    (date(2026, 10, 13), HYD, dict(brahma_muhurta="04:31-05:20", abhijit_muhurta="11:39-12:26", amrita_kala="16:14-17:57",
        rahukalam="14:59-16:28", yamaganda="09:05-10:34", gulika="12:02-13:31", durmuhurta="08:30-09:17 / 22:49-23:38", varjyam="06:06+1-07:51+1")),
    (date(2026, 10, 14), HYD, dict(brahma_muhurta="04:31-05:20", abhijit_muhurta=None, amrita_kala="16:38-18:23",
        rahukalam="12:02-13:30", yamaganda="07:37-09:05", gulika="10:34-12:02", durmuhurta="11:38-12:26", varjyam=None)),
    (date(2026, 3, 19), HYD, dict(brahma_muhurta="04:46-05:34", abhijit_muhurta="12:00-12:48", amrita_kala="23:32-01:03+1",
        rahukalam="13:55-15:25", yamaganda="06:21-07:52", gulika="09:23-10:53", durmuhurta="10:23-11:11 / 15:13-16:02", varjyam="14:26-15:57")),
    (date(2026, 1, 10), HYD, dict(brahma_muhurta="05:06-05:57", abhijit_muhurta="12:01-12:46", amrita_kala="09:10-10:54",
        rahukalam="09:36-11:00", yamaganda="13:47-15:11", gulika="06:49-08:13", durmuhurta="06:49-07:33 / 07:33-08:18", varjyam="00:30+1-02:16+1")),
    (date(2026, 6, 1), HYD, dict(brahma_muhurta="04:14-04:57", abhijit_muhurta="11:48-12:40", amrita_kala="09:16-11:03",
        rahukalam="07:19-08:58", yamaganda="10:36-12:14", gulika="13:52-15:31", durmuhurta="12:40-13:33 / 15:18-16:10", varjyam="04:08+1-05:55+1")),
    (date(2026, 7, 20), HYD, dict(brahma_muhurta="04:24-05:08", abhijit_muhurta="11:56-12:49", amrita_kala="12:55-14:35",
        rahukalam="07:29-09:07", yamaganda="10:45-12:23", gulika="14:00-15:38", durmuhurta="12:49-13:41 / 15:25-16:17", varjyam="03:42+1-05:25+1")),
    (date(2026, 12, 25), HYD, dict(brahma_muhurta="05:00-05:52", abhijit_muhurta="11:54-12:38", amrita_kala="20:43-22:07",
        rahukalam="10:53-12:16", yamaganda="15:03-16:26", gulika="08:07-09:30", durmuhurta="08:57-09:41 / 12:38-13:23",
        varjyam="12:18-13:42 / 05:57+1-07:23+1")),
    (date(2026, 5, 20), HYD, dict(brahma_muhurta="04:15-04:59", abhijit_muhurta=None, amrita_kala="02:00+1-03:28+1",
        rahukalam="12:13-13:50", yamaganda="07:20-08:58", gulika="10:35-12:13", durmuhurta="11:47-12:39", varjyam="17:12-18:40")),
    # 20 Jun 2026: Amrita Kalam left out — Drik lists only 07:06-08:39, Prokerala also lists
    # a second period that night (see test_amrita_20_jun_2026_matches_drik_first_period).
    (date(2026, 6, 20), HYD, dict(brahma_muhurta="04:16-04:59", abhijit_muhurta="11:51-12:44",
        rahukalam="09:00-10:39", yamaganda="13:57-15:35", gulika="05:43-07:21", durmuhurta="05:43-06:35 / 06:35-07:28", varjyam="17:27-19:04")),
    (date(2026, 5, 10), HYD, dict(amrita_kala="13:49-15:30", durmuhurta="16:56-17:48", varjyam=None)),
    (date(2027, 1, 24), HYD, dict(brahma_muhurta="05:08-05:59", abhijit_muhurta="12:06-12:51", amrita_kala="00:30+1-01:57+1",
        rahukalam="16:42-18:07", yamaganda="12:28-13:53", gulika="15:18-16:42", durmuhurta="16:37-17:22", varjyam="15:47-17:14")),
    (date(2027, 4, 13), HYD, dict(brahma_muhurta="04:30-05:16", abhijit_muhurta="11:52-12:42", amrita_kala=None,
        rahukalam="15:24-16:58", yamaganda="09:09-10:43", gulika="12:17-13:51", durmuhurta="08:32-09:22 / 23:08-23:54", varjyam="23:32-01:03+1")),
    (date(2027, 8, 7), HYD, dict(brahma_muhurta="04:28-05:12", abhijit_muhurta="11:56-12:48", amrita_kala="23:43-01:17+1",
        rahukalam="09:09-10:46", yamaganda="13:58-15:34", gulika="05:57-07:33", durmuhurta="05:57-06:48 / 06:48-07:39", varjyam="14:17-15:51")),
    (date(2027, 11, 19), HYD, dict(brahma_muhurta="04:41-05:32", abhijit_muhurta="11:39-12:24", amrita_kala="18:25-19:56",
        rahukalam="10:37-12:01", yamaganda="14:51-16:15", gulika="07:48-09:12", durmuhurta="08:38-09:23 / 12:24-13:09", varjyam="09:23-10:54")),
    (date(2027, 3, 4), CHENNAI, dict(brahma_muhurta="04:47-05:35", abhijit_muhurta="11:57-12:45", amrita_kala="18:23-20:11",
        rahukalam="13:50-15:19", yamaganda="06:23-07:53", gulika="09:22-10:51", durmuhurta="10:22-11:09 / 15:07-15:55",
        varjyam="07:34-09:22 / 06:03+1-07:50+1")),
]


@pytest.mark.parametrize("d,city,kalas", DRIK_KALAS, ids=[f"{d}-{'chennai' if c == CHENNAI else 'hyd'}" for d, c, _ in DRIK_KALAS])
def test_kala_chakra_matches_drik_panchang(d, city, kalas):
    p = _day(d, city)
    for key, spec in kalas.items():
        _assert_periods(d, key, _actual(p, key), _expected(d, spec))
        if spec is None:
            assert p["kalas"][key] == "---", f"{d} {key} should display '---'"


# Abhijit is not observed on Wednesdays (Drik "None", Prokerala "Nil"); the
# Wednesday Durmuhurta sits in that midday slot instead.
WEDNESDAYS = [
    (date(2026, 10, 14), "11:38-12:26"), (date(2026, 10, 21), None), (date(2026, 5, 20), "11:47-12:39"),
    (date(2027, 2, 17), "12:07-12:54"), (date(2027, 6, 23), "11:52-12:45"), (date(2027, 9, 8), "11:49-12:39"),
]


@pytest.mark.parametrize("d,dur", WEDNESDAYS, ids=[str(d) for d, _ in WEDNESDAYS])
def test_no_abhijit_on_wednesday(d, dur):
    assert d.weekday() == 2
    p = _day(d)
    assert p["kala_periods"]["abhijit_muhurta"] == [] and p["kalas"]["abhijit_muhurta"] == "---"
    if dur:
        _assert_periods(d, "durmuhurta", _actual(p, "durmuhurta"), _expected(d, dur))


def test_abhijit_present_on_other_weekdays():
    for i in range(7):
        d = date(2026, 10, 19) + timedelta(days=i)
        assert bool(_day(d)["kala_periods"]["abhijit_muhurta"]) == (d.weekday() != 2), d


def test_amrita_20_jun_2026_matches_drik_first_period():
    d = date(2026, 6, 20)
    got = _actual(_day(d), "amrita_kala")
    _assert_periods(d, "amrita_kala", got[:1], _expected(d, "07:06-08:39"))


# --------------------------------------------------------- Month / calendar
MASA = [
    # date, amanta, purnimanta, adhika (both systems)
    (date(2026, 3, 19), "Phālguna", "Chaitra", False),     # new moon 32 min after sunrise
    (date(2026, 1, 10), "Pauṣa", "Māgha", False),
    (date(2026, 5, 10), "Vaiśākha", "Jyeṣṭha", False),     # Krishna paksha just before Adhika
    (date(2026, 5, 20), "Jyeṣṭha", "Jyeṣṭha", True),
    (date(2026, 6, 1), "Jyeṣṭha", "Jyeṣṭha", True),        # Krishna paksha of Adhika
    (date(2026, 6, 20), "Jyeṣṭha", "Jyeṣṭha", False),
    (date(2026, 10, 12), "Āśvina", "Āśvina", False),
    (date(2026, 12, 25), "Mārgaśīrṣa", "Pauṣa", False),
]


@pytest.mark.parametrize("d,amanta,purnimanta,adhika", MASA, ids=[str(m[0]) for m in MASA])
def test_masa_and_adhika_match_drik(d, amanta, purnimanta, adhika):
    a, p = _day(d, cal="amanta")["general"], _day(d, cal="purnimanta")["general"]
    assert a["masa"]["en"].endswith(amanta) and a["is_adhika_masa"] == adhika, a["masa"]["en"]
    assert p["masa"]["en"].endswith(purnimanta) and p["is_adhika_masa"] == adhika, p["masa"]["en"]


def test_adhika_months_2018_to_2035():
    # 2023 Śrāvaṇa, 2026 Jyeṣṭha, 2029 Chaitra, 2031 Bhādrapada confirmed on Drik
    # Panchang; 2018 Jyeṣṭha and 2020 Āśvina match widely published dates.
    found = {}
    nm = _find_next_new_moon(datetime(2018, 1, 1, tzinfo=timezone.utc))
    while nm.year < 2032:
        idx, adhika = _masa_and_adhika(nm)
        if adhika:
            found[nm.year] = MASA_NAMES[idx]["en"]
        nm = _find_next_new_moon(nm + timedelta(days=1))
    assert found == {2018: "Jyeṣṭha", 2020: "Āśvina", 2023: "Śrāvaṇa", 2026: "Jyeṣṭha", 2029: "Chaitra", 2031: "Bhādrapada"}


def test_samvatsara_changes_on_ugadi():
    assert _day(date(2026, 3, 18))["general"]["samvatsara"]["en"] == "Viśvāvasu"
    assert _day(date(2026, 3, 19))["general"]["samvatsara"]["en"] == "Parābhava"


# ------------------------------------------------ Choghadiya / Gowri / Hora
def test_choghadiya_matches_drik():
    sat = _day(date(2026, 10, 17))["extended"]["choghadiya"]
    assert [x["name"]["en"] for x in sat["day"]] == ["Kaal", "Shubh", "Rog", "Udveg", "Chal", "Labh", "Amrit", "Kaal"]
    assert [x["name"]["en"] for x in sat["night"]] == ["Labh", "Udveg", "Shubh", "Amrit", "Chal", "Rog", "Kaal", "Labh"]
    mon = _day(date(2026, 10, 19))["extended"]["choghadiya"]
    assert [x["name"]["en"] for x in mon["day"]] == ["Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Chal", "Labh", "Amrit"]
    assert [x["name"]["en"] for x in mon["night"]] == ["Chal", "Rog", "Kaal", "Labh", "Udveg", "Shubh", "Amrit", "Chal"]
    assert (sat["day"][0]["start"], sat["day"][0]["end"]) == ("6:10 AM", "7:38 AM")


# Drik Gowri Panchangam, 17-23 Oct 2026 (Sat..Fri): (day, night) sequences.
GOWRI = {
    date(2026, 10, 17): ("soram uthi visham amirdha rogam laabam dhanam sugam", "laabam dhanam sugam soram uthi visham amirdha soram"),
    date(2026, 10, 18): ("uthi amirdha rogam laabam dhanam sugam soram visham", "dhanam sugam soram visham uthi amirdha rogam laabam"),
    date(2026, 10, 19): ("amirdha visham rogam laabam dhanam sugam soram uthi", "sugam soram uthi amirdha visham rogam laabam dhanam"),
    date(2026, 10, 20): ("rogam laabam dhanam sugam soram uthi visham amirdha", "soram uthi visham amirdha rogam laabam dhanam sugam"),
    date(2026, 10, 21): ("laabam dhanam sugam soram visham uthi amirdha rogam", "uthi amirdha rogam laabam dhanam sugam soram visham"),
    date(2026, 10, 22): ("dhanam sugam soram uthi amirdha visham rogam laabam", "amirdha visham rogam laabam dhanam sugam soram uthi"),
    date(2026, 10, 23): ("sugam soram uthi visham amirdha rogam laabam dhanam", "rogam laabam dhanam sugam soram uthi visham amirdha"),
}


@pytest.mark.parametrize("d", list(GOWRI), ids=[f"{d:%a}" for d in GOWRI])
def test_gowri_panchangam_matches_drik(d):
    g = _day(d)["extended"]["gowri_panchangam"]
    day, night = GOWRI[d]
    key = lambda x: x["name"]["en"].split()[0].lower().replace("amirdham", "amirdha")  # noqa: E731
    assert [key(x) for x in g["day"]] == day.split()
    assert [key(x) for x in g["night"]] == night.split()


def test_hora_matches_drik():
    hora = _day(date(2026, 10, 17))["extended"]["hora"][:6]
    assert [(h["name"]["en"], h["start"]) for h in hora] == [
        ("Saturn", "6:10 AM"), ("Jupiter", "7:08 AM"), ("Mars", "8:07 AM"),
        ("Sun", "9:06 AM"), ("Venus", "10:04 AM"), ("Mercury", "11:03 AM"),
    ]


# ------------------------------------------ Sun, Moon and the five angas
def test_sun_moon_and_angas_17_oct_2026():
    p = _day(date(2026, 10, 17))
    for key, want in (("sunrise", "6:10 AM"), ("sunset", "5:53 PM")):
        _assert_clock(key, p["solar"][key], want)
    for key, want in (("moonrise", "11:53 AM"), ("moonset", "10:54 PM")):
        _assert_clock(key, p["lunar"][key], want)
    g = p["general"]
    assert (g["nakshatra"]["en"], g["yoga"]["en"], g["karana"]["en"]) == ("Mūla", "Atigaṇḍa", "Gara")
    _assert_clock("nakshatra end", g["nakshatra_till"]["en"], "9:47 AM")
    _assert_clock("yoga end", g["yoga_till"]["en"], "11:03 PM")
    _assert_clock("karana end", g["karana_till"]["en"], "7:11 PM")


@pytest.mark.parametrize("d,rise,set_", [
    (date(2027, 4, 13), "11:23 AM", "12:52 AM (+1)"),   # no moonset on the 13th itself
    (date(2026, 12, 25), "7:25 PM", "7:51 AM"),
])
def test_moonrise_moonset_match_drik(d, rise, set_):
    lunar = _day(d)["lunar"]
    _assert_clock("moonrise", lunar["moonrise"], rise)
    _assert_clock("moonset", lunar["moonset"], set_)


# ---------------------------------------------------------------- Festivals
# Drik Panchang Telugu calendar, Hyderabad. 2023, 2026, 2029 and 2031 are
# Adhika Masa years (Adhika Shravana, Jyeshtha, Chaitra, Bhadrapada), so these
# also prove festivals fall in the nija month under Chandramana Amanta.
DRIK_FESTIVALS = {
    2023: {"varalakshmi_vratam": "2023-08-25", "raksha_bandhan": "2023-08-30", "krishna_janmashtami": "2023-09-06"},
    2026: {"bhogi": "2026-01-13", "makara_sankranti": "2026-01-14", "kanuma": "2026-01-15",
           "bhishma_ekadasi": "2026-01-29", "maha_shivaratri": "2026-02-15", "ugadi": "2026-03-19",
           "rama_navami": "2026-03-26", "narasimha_jayanthi": "2026-04-30", "hanuman_jayanthi": "2026-05-12",
           "nirjala_ekadasi": "2026-06-25", "toli_ekadasi": "2026-07-25", "guru_pournami": "2026-07-29",
           "naga_panchami": "2026-08-17", "varalakshmi_vratam": "2026-08-28", "raksha_bandhan": "2026-08-28",
           "krishna_janmashtami": "2026-09-04", "polala_amavasya": "2026-09-10", "vinayaka_chavithi": "2026-09-14",
           "ganesh_nimajjanam": "2026-09-25", "vijayadashami": "2026-10-20", "atla_tadde": "2026-10-28",
           "naraka_chaturdashi": "2026-11-08", "diwali": "2026-11-08", "nagula_chavithi": "2026-11-13",
           "chiluka_ekadasi": "2026-11-20", "karthika_pournami": "2026-11-24", "vaikuntha_ekadasi": "2026-12-20",
           "gita_jayanthi": "2026-12-20"},
    2027: {"bhishma_ekadasi": "2027-02-17", "maha_shivaratri": "2027-03-06", "holika_dahan": "2027-03-21",
           "holi": "2027-03-22", "ugadi": "2027-04-07", "rama_navami": "2027-04-15", "hanuman_jayanthi": "2027-05-31",
           "nirjala_ekadasi": "2027-06-14", "toli_ekadasi": "2027-07-14", "varalakshmi_vratam": "2027-08-13",
           "raksha_bandhan": "2027-08-17", "krishna_janmashtami": "2027-08-25", "vinayaka_chavithi": "2027-09-04",
           "ganesh_nimajjanam": "2027-09-14", "vijayadashami": "2027-10-09", "atla_tadde": "2027-10-18",
           "diwali": "2027-10-29", "nagula_chavithi": "2027-11-02", "chiluka_ekadasi": "2027-11-10",
           "vaikuntha_ekadasi": "2027-12-09"},
    2029: {"ugadi": "2029-04-14", "rama_navami": "2029-04-23", "hanuman_jayanthi": "2029-06-06"},
    2031: {"varalakshmi_vratam": "2031-08-01", "raksha_bandhan": "2031-08-02", "krishna_janmashtami": "2031-08-09",
           "vinayaka_chavithi": "2031-09-20", "ganesh_nimajjanam": "2031-09-29"},
}


@pytest.mark.parametrize("year", list(DRIK_FESTIVALS))
def test_festival_dates_match_drik(year):
    from panchangam.extended_panchangam import compute_festival_calendar
    cal = {f["key"]: f["dates"] for f in compute_festival_calendar(year, HYD[0], HYD[1], IST_MIN)}
    for key, want in DRIK_FESTIVALS[year].items():
        assert cal[key] == [want], f"{year} {key}: expected {want}, got {cal[key]}"


@pytest.mark.parametrize("year", [2023, 2026, 2029, 2031])
def test_no_festival_falls_in_an_adhika_month(year):
    from panchangam.extended_panchangam import compute_festival_calendar
    for f in compute_festival_calendar(year, HYD[0], HYD[1], IST_MIN):
        d = date.fromisoformat(f["dates"][0])
        assert not _day(d)["general"]["is_adhika_masa"], f"{year} {f['key']} on {d} is in an Adhika month"


def test_holika_dahan_standard_rule():
    # Purnima at pradosh, Holi the next day. 2026 had a lunar eclipse on
    # Phalguna Purnima and panchangs split (2 Mar by the standard rule, 3 Mar
    # on Drik); the standard rule is kept.
    from panchangam.extended_panchangam import compute_festival_calendar
    for year, holika, holi in ((2024, "2024-03-24", "2024-03-25"), (2025, "2025-03-13", "2025-03-14"),
                               (2027, "2027-03-21", "2027-03-22")):
        cal = {f["key"]: f["dates"] for f in compute_festival_calendar(year, HYD[0], HYD[1], IST_MIN)}
        assert (cal["holika_dahan"], cal["holi"]) == ([holika], [holi]), year

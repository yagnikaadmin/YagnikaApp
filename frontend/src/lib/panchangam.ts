/* Native Panchangam client — talks to the in-app backend (/api/panchangam*).
   All astrology values come back already localised as { en, te, hi, ta, kn, ml };
   `pick()` selects the active language with an English fallback. */

import { apiFetch } from '@/src/context/AuthContext';

export type Loc = Partial<Record<string, string>> & { en: string };
export type LangCode = 'en' | 'te' | 'hi' | 'ta' | 'kn' | 'ml';

export const pick = (v: Loc | string | null | undefined, lang: string): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] || v.en || '';
};

export interface Period { start: string; end: string; name: Loc; good?: boolean }

export interface Panchangam {
  date: string;               // "DD/MM/YYYY"
  weekday: number;            // Mon=0 .. Sun=6
  calendar_type: string;
  solar: { sunrise: string; sunset: string; solar_noon?: string };
  lunar: { moonrise: string; moonset: string; moon_illumination?: number };
  general: Record<string, Loc>;
  kalas: Record<string, string>;   // id -> "4:30 AM – 5:16 AM" (may be "a – b / c – d", or "---")
  // id -> exact periods as local ISO timestamps (same order as `kalas`).
  kala_periods?: Record<string, { start: string; end: string }[]>;
  extended?: {
    graha_positions?: Record<string, any>;
    lagna?: { rashi: Loc; degree: number };
    choghadiya?: { day: Period[]; night: Period[] };
    hora?: Period[];
    gowri_panchangam?: { day: Period[]; night: Period[] };
    nakshatra_info?: Record<string, Loc>;
    disha_shoola?: Loc;
    special_days?: { ekadashi?: boolean; pournami?: boolean; amavasya?: boolean };
    bhadra?: boolean;
    festivals?: { name: Loc; tithi_start?: string; tithi_end?: string }[];
  };
}

export interface Festival { key?: string; name: Loc; dates: string[]; tithi_start?: string; tithi_end?: string }

export interface Coords { latitude: number; longitude: number; tzOffsetMin: number; label?: string }

/* A short preset list for the location picker; IST offset for all (India). */
export const CITIES: { label: string; latitude: number; longitude: number }[] = [
  { label: 'Hyderabad', latitude: 17.385, longitude: 78.4867 },
  { label: 'Bengaluru', latitude: 12.9716, longitude: 77.5946 },
  { label: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
  { label: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
  { label: 'Delhi', latitude: 28.6139, longitude: 77.209 },
  { label: 'Kolkata', latitude: 22.5726, longitude: 88.3639 },
  { label: 'Pune', latitude: 18.5204, longitude: 73.8567 },
  { label: 'Visakhapatnam', latitude: 17.6868, longitude: 83.2185 },
  { label: 'Vijayawada', latitude: 16.5062, longitude: 80.648 },
  { label: 'Tirupati', latitude: 13.6288, longitude: 79.4192 },
  { label: 'Varanasi', latitude: 25.3176, longitude: 82.9739 },
  { label: 'Ahmedabad', latitude: 23.0225, longitude: 72.5714 },
];

export const DEFAULT_CITY: Coords = { ...CITIES[0], tzOffsetMin: 330, label: 'Hyderabad' };

// Uses expo-location to resolve the device's current position + a place name.
export async function resolveDeviceLocation(): Promise<Coords | null> {
  try {
    const Location = await import('expo-location');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const tzOffsetMin = -new Date().getTimezoneOffset();
    let label: string | undefined;
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      label = geo?.[0]?.city || geo?.[0]?.subregion || geo?.[0]?.region || undefined;
    } catch { /* name is optional */ }
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, tzOffsetMin, label };
  } catch {
    return null;
  }
}

/* ---------------- API ---------------- */

const q = (coords?: Coords | null) =>
  coords ? `&latitude=${coords.latitude}&longitude=${coords.longitude}&tz_offset_min=${coords.tzOffsetMin}` : '';

export async function fetchPanchangam(dateIso: string, coords?: Coords | null, calType = 'amanta'): Promise<Panchangam> {
  const res = await apiFetch(`/panchangam?date=${dateIso}&calendar_type=${calType}${q(coords)}`);
  if (!res.ok) throw new Error(`panchangam ${res.status}`);
  return res.json();
}

export async function fetchFestivals(year: number, coords?: Coords | null): Promise<Festival[]> {
  const res = await apiFetch(`/panchangam/festivals?year=${year}${q(coords)}`);
  if (!res.ok) throw new Error(`festivals ${res.status}`);
  const data = await res.json();
  return data.festivals || [];
}

export async function checkMuhurtam(body: {
  start_date: string; end_date: string;
  janma_nakshatra?: number | null; janma_rasi?: number | null;
  system?: string; latitude?: number; longitude?: number; tz_offset_min?: number;
}): Promise<any> {
  const res = await apiFetch('/panchangam/muhurtam', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`muhurtam ${res.status}`);
  return res.json();
}

export async function fetchKundali(body: {
  birth_date: string; birth_time: string;
  latitude?: number; longitude?: number; tz_offset_min?: number;
}): Promise<any> {
  const res = await apiFetch('/panchangam/kundali', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`kundali ${res.status}`);
  return res.json();
}

export async function fetchSkyView(body: {
  birth_date: string; birth_time: string;
  latitude?: number; longitude?: number; tz_offset_min?: number;
}): Promise<any> {
  const res = await apiFetch('/panchangam/sky-view', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`sky-view ${res.status}`);
  return res.json();
}

// "8:31 AM" / "12:05 PM" -> "08:31" / "12:05" (24h HH:MM)
export function to24h(s: string): string {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '12:00';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'AM' && h === 12) h = 0;
  if (ap === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${min}`;
}

// 12 rāśi, short forms per language — for the Kundali grid cells.
export const RASI_NAMES: Loc[] = [
  { en: 'Mesha', te: 'మేష', hi: 'मेष', ta: 'மேஷ', kn: 'ಮೇಷ', ml: 'മേഷം' },
  { en: 'Vrisha', te: 'వృష', hi: 'वृष', ta: 'ரிஷப', kn: 'ವೃಷಭ', ml: 'ഇടവം' },
  { en: 'Mithuna', te: 'మిథున', hi: 'मिथुन', ta: 'மிதுன', kn: 'ಮಿಥುನ', ml: 'മിഥുനം' },
  { en: 'Karka', te: 'కర్కాటక', hi: 'कर्क', ta: 'கடக', kn: 'ಕರ್ಕ', ml: 'കർക്കടകം' },
  { en: 'Simha', te: 'సింహ', hi: 'सिंह', ta: 'சிம்ம', kn: 'ಸಿಂಹ', ml: 'ചിങ്ങം' },
  { en: 'Kanya', te: 'కన్య', hi: 'कन्या', ta: 'கன்னி', kn: 'ಕನ್ಯಾ', ml: 'കന്നി' },
  { en: 'Tula', te: 'తుల', hi: 'तुला', ta: 'துலா', kn: 'ತುಲಾ', ml: 'തുലാം' },
  { en: 'Vrischika', te: 'వృశ్చిక', hi: 'वृश्चिक', ta: 'விருச்சிக', kn: 'ವೃಶ್ಚಿಕ', ml: 'വൃശ്ചികം' },
  { en: 'Dhanu', te: 'ధను', hi: 'धनु', ta: 'தனுசு', kn: 'ಧನು', ml: 'ധനു' },
  { en: 'Makara', te: 'మకర', hi: 'मकर', ta: 'மகர', kn: 'ಮಕರ', ml: 'മകരം' },
  { en: 'Kumbha', te: 'కుంభ', hi: 'कुंभ', ta: 'கும்ப', kn: 'ಕುಂಭ', ml: 'കുംഭം' },
  { en: 'Meena', te: 'మీన', hi: 'मीन', ta: 'மீன', kn: 'ಮೀನ', ml: 'മീനം' },
];

/* ---------------- Kala helpers ---------------- */

export const KALA_ORDER = [
  'brahma_muhurta', 'durmuhurta', 'abhijit_muhurta', 'yamaganda',
  'gulika', 'amrita_kala', 'rahukalam', 'varjyam',
] as const;

export type KalaId = typeof KALA_ORDER[number];

export const AUSPICIOUS_KALAS = new Set<string>(['brahma_muhurta', 'abhijit_muhurta', 'amrita_kala']);

export const KALA_NAMES: Record<KalaId, Loc> = {
  brahma_muhurta: { en: 'Brahma Muhurta', te: 'బ్రహ్మ ముహూర్తం', hi: 'ब्रह्म मुहूर्त', ta: 'பிரம்ம முகூர்த்தம்', kn: 'ಬ್ರಹ್ಮ ಮುಹೂರ್ತ', ml: 'ബ്രഹ്മ മുഹൂർത്തം' },
  durmuhurta: { en: 'Durmuhurta', te: 'దుర్ముహూర్తం', hi: 'दुर्मुहूर्त', ta: 'துர்முகூர்த்தம்', kn: 'ದುರ್ಮುಹೂರ್ತ', ml: 'ദുർമുഹൂർത്തം' },
  abhijit_muhurta: { en: 'Abhijit Lagnam', te: 'అభిజిత్ లగ్నం', hi: 'अभिजित लग्न', ta: 'அபிஜித் லக்னம்', kn: 'ಅಭಿಜಿತ್ ಲಗ್ನ', ml: 'അഭിജിത് ലഗ്നം' },
  yamaganda: { en: 'Yamaganda', te: 'యమగండం', hi: 'यमगण्ड', ta: 'யமகண்டம்', kn: 'ಯಮಗಂಡ', ml: 'യമഗണ്ഡം' },
  gulika: { en: 'Gulika Kalam', te: 'గుళిక కాలం', hi: 'गुलिक काल', ta: 'குளிக காலம்', kn: 'ಗುಳಿಕ ಕಾಲ', ml: 'ഗുളികകാലം' },
  amrita_kala: { en: 'Amrita Kalam', te: 'అమృత కాలం', hi: 'अमृत काल', ta: 'அமிர்த காலம்', kn: 'ಅಮೃತ ಕಾಲ', ml: 'അമൃതകാലം' },
  rahukalam: { en: 'Rahu Kalam', te: 'రాహు కాలం', hi: 'राहु काल', ta: 'ராகு காலம்', kn: 'ರಾಹು ಕಾಲ', ml: 'രാഹുകാലം' },
  varjyam: { en: 'Varjyam', te: 'వర్జ్యం', hi: 'वर्ज्यम्', ta: 'வர்ஜ்யம்', kn: 'ವರ್ಜ್ಯ', ml: 'വർജ്യം' },
};

export interface KalaPeriod { start: Date; end: Date }

// `time` is for display ("(+1)" marks a period that runs into or starts on the
// next calendar day); `periods` are the exact instants, used for the
// "current kala" highlight and its countdown.
export interface KalaEntry { id: KalaId; name: Loc; time: string; periods?: KalaPeriod[] }

export function getSpecialKalas(p?: Panchangam | null): KalaEntry[] {
  const k = p?.kalas || {};
  const exact = p?.kala_periods;
  // Viewed day as YYYY-MM-DD, from the panchang's "DD/MM/YYYY".
  const [dd, mm, yyyy] = (p?.date || '').split('/');
  const viewedIso = yyyy ? `${yyyy}-${mm}-${dd}` : '';
  return KALA_ORDER.map((id) => {
    const text = k[id] || '---';
    const raw = exact?.[id];
    if (!raw) return { id, name: KALA_NAMES[id], time: text };
    const segments = text === '---' ? [] : text.split(' / ');
    const time = segments.length
      ? segments.map((seg, i) => {
          // ISO strings carry the location's local date, e.g. "2026-01-11T00:30:00+05:30".
          const nextDay = !!viewedIso && !!raw[i] && raw[i].end.slice(0, 10) > viewedIso;
          return nextDay ? `${seg} (+1)` : seg;
        }).join(' / ')
      : '---';
    return {
      id, name: KALA_NAMES[id], time,
      periods: raw.map((r) => ({ start: new Date(r.start), end: new Date(r.end) })),
    };
  });
}

/* ---------------- time helpers ---------------- */

// "6:03 AM" / "14:30" -> Date today. Returns null on "---" / empty.
export function parseClock(str?: string | null): Date | null {
  if (!str || str === '---' || str === '—') return null;
  const s = str.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'AM') { if (h === 12) h = 0; }
  else if (ap === 'PM') { if (h !== 12) h += 12; }
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

export function inRange(now: Date, startStr: string, endStr: string): boolean {
  const start = parseClock(startStr);
  const end = parseClock(endStr);
  if (!start || !end) return false;
  const s = new Date(start), e = new Date(end);
  if (e < s) { if (now < e) s.setDate(s.getDate() - 1); else e.setDate(e.getDate() + 1); }
  return now >= s && now < e;
}

// Split "a – b / c – d" or "a - b" into [{start,end}, ...]
export function splitPeriods(time: string): { start: string; end: string }[] {
  if (!time || time === '---') return [];
  return time.split(' / ').map((seg) => {
    const parts = seg.includes(' – ') ? seg.split(' – ') : seg.split(' - ');
    return parts.length === 2 ? { start: parts[0].trim(), end: parts[1].trim() } : null;
  }).filter(Boolean) as { start: string; end: string }[];
}

// The kala running at `now`. With exact periods this is date-aware, so a
// period that is really on the next day (e.g. a 12:30 AM Varjyam that belongs
// to the following night) is never mistaken for one happening this morning.
// Without them (older backend) it falls back to clock times, today only.
export function activeKala(kalas: KalaEntry[], now: Date, isToday: boolean): { kala: KalaEntry; end: Date } | null {
  const t = now.getTime();
  for (const k of kalas) {
    if (k.periods) {
      const hit = k.periods.find((p) => t >= p.start.getTime() && t < p.end.getTime());
      if (hit) return { kala: k, end: hit.end };
      continue;
    }
    if (!isToday) continue;
    for (const p of splitPeriods(k.time)) {
      if (inRange(now, p.start, p.end)) {
        const end = parseClock(p.end);
        if (end) {
          if (end < now) end.setDate(end.getDate() + 1);
          return { kala: k, end };
        }
      }
    }
  }
  return null;
}

export function countdown(now: Date, end: Date | string): string {
  const endAt = typeof end === 'string' ? parseClock(end) : end;
  if (!endAt) return '';
  let ms = endAt.getTime() - now.getTime();
  if (ms < 0 && typeof end === 'string') ms += 86400000;
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/* ---------------- date helpers ---------------- */

export const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayIso = () => isoOf(new Date());
export const parseIso = (s: string) => new Date(`${s}T00:00:00`);

export function greetingKey(p: Panchangam | null | undefined, now: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const sr = parseClock(p?.solar?.sunrise);
  const ss = parseClock(p?.solar?.sunset);
  const noon = parseClock(p?.solar?.solar_noon);
  if (!sr || !ss || !noon) {
    const h = now.getHours();
    return h < 12 && h >= 4 ? 'morning' : h < 16 ? 'afternoon' : h < 19 ? 'evening' : 'night';
  }
  const evStart = new Date(ss.getTime() - 2 * 3600000);
  const evEnd = new Date(ss.getTime() + 2 * 3600000);
  if (now >= sr && now < noon) return 'morning';
  if (now >= noon && now < evStart) return 'afternoon';
  if (now >= evStart && now < evEnd) return 'evening';
  return 'night';
}

import type { TFunction } from 'i18next';

// Shared metadata + translation helpers for the priest service catalogue.
// The backend catalogue keys everything by its ENGLISH name (stable ids
// sc-N-M under the hood); this module maps those English strings to a
// language-independent slug, a sacred symbol used as the category "icon",
// a colour, and the i18n lookup helpers so category / subcategory names
// and descriptions render in the chosen language.

// Display order. The backend appends "Pitru Karma / Uttara Kriya" last
// (to keep every other category's sc-<idx>-<n> ids stable), but on screen
// it belongs right after the Subha Karyas category.
export const CATEGORY_ORDER = [
  'Daiva Karyakramas (Divine Services)',
  'Manushya Karyakramas (Subha Karyas)',
  'Manushya Karyakramas (Pitru Karma / Uttara Kriya)',
  'Alankara Sevas (Deity Decoration Services)',
  'Paricharaka Sevas (Priest Assistance Services)',
  'Vanta Brahmana Sevas (Religious Cooking Services)',
  'Parayana Sevas (Sacred Recitations)',
  'Jyotisha Sevas (Astrology Services)',
  'Danas (Accepted Ritual Offerings)',
];

// Danas can't be offered on their own — a priest must also perform at least
// one service from another category. Enforced in ServiceCategoryPicker, the
// registration form and the backend (server.py DANA_CATEGORY).
export const DANA_CATEGORY = 'Danas (Accepted Ritual Offerings)';

export const CATEGORY_SLUG: Record<string, string> = {
  'Daiva Karyakramas (Divine Services)': 'daiva',
  'Manushya Karyakramas (Subha Karyas)': 'manushya',
  'Manushya Karyakramas (Pitru Karma / Uttara Kriya)': 'pitru',
  'Alankara Sevas (Deity Decoration Services)': 'alankara',
  'Paricharaka Sevas (Priest Assistance Services)': 'paricharaka',
  'Vanta Brahmana Sevas (Religious Cooking Services)': 'vanta',
  'Parayana Sevas (Sacred Recitations)': 'parayanam',
  'Jyotisha Sevas (Astrology Services)': 'jyotisha',
  'Danas (Accepted Ritual Offerings)': 'dana',
};

// Sacred symbols used as the category icon (rendered as text, so they
// scale, need no assets, and read the same in every UI language).
export const CATEGORY_GLYPH: Record<string, string> = {
  daiva: '🕉️',        // Om — deity worship
  manushya: '👪',      // family — the auspicious life-cycle samskaras
  pitru: '🪔',         // deepam — ancestral rites (Pitru Karma / Uttara Kriya)
  alankara: '🌸',      // flower — deity adornment
  paricharaka: '🔔',   // ghanta (temple bell) — priestly assistance
  vanta: '🔥',         // sacred fire — naivedyam / offerings kitchen
  parayanam: '📿',     // japa mala — recitation
  jyotisha: '🔯',      // shatkona yantra — astrology
  dana: '₹',           // rupee on a gold disc — ritual offering / dakshina
};

export const CATEGORY_COLOR: Record<string, string> = {
  daiva: '#B45309',
  manushya: '#9333EA',
  pitru: '#6D28D9',
  alankara: '#DB2777',
  paricharaka: '#0891B2',
  vanta: '#EA580C',
  parayanam: '#2563EB',
  jyotisha: '#4F46E5',
  dana: '#C79200', // gold — reads as a gold coin behind the ₹ glyph
};

export function slugForCategory(englishName: string): string {
  return CATEGORY_SLUG[englishName] || englishName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function subSlug(englishSub: string): string {
  return englishSub.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function catMeta(englishName: string) {
  const slug = slugForCategory(englishName);
  return { slug, glyph: CATEGORY_GLYPH[slug] || '🕉️', color: CATEGORY_COLOR[slug] || '#7A0A0A' };
}

// t is react-i18next's TFunction. English string is always passed as the
// fallback so an un-translated / unknown entry still shows something.
export function catName(t: TFunction, englishName: string): string {
  return t(`catalog.cat.${slugForCategory(englishName)}.name`, { defaultValue: englishName });
}
export function catShort(t: TFunction, englishName: string): string {
  const slug = slugForCategory(englishName);
  return t(`catalog.cat.${slug}.short`, { defaultValue: t(`catalog.cat.${slug}.name`, { defaultValue: englishName }) });
}
export function catDesc(t: TFunction, englishName: string): string {
  return t(`catalog.cat.${slugForCategory(englishName)}.desc`, { defaultValue: '' });
}
export function subName(t: TFunction, englishSub: string): string {
  if (!englishSub) return '';
  return t(`catalog.sub.${subSlug(englishSub)}`, { defaultValue: englishSub });
}
// Individual service / seva item name, translated. Falls back to the English
// name for anything outside the catalogue (e.g. the demo poojas p1..p10).
export function svcName(t: TFunction, englishName: string): string {
  if (!englishName) return '';
  return t(`catalog.svc.${subSlug(englishName)}`, { defaultValue: englishName });
}

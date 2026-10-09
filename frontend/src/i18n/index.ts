import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import hi from './locales/hi.json';
import te from './locales/te.json';
import ta from './locales/ta.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', labelKey: 'lang.english' },
  { code: 'te', labelKey: 'lang.telugu' },
  { code: 'hi', labelKey: 'lang.hindi' },
  { code: 'ta', labelKey: 'lang.tamil' },
  { code: 'kn', labelKey: 'lang.kannada' },
  { code: 'ml', labelKey: 'lang.malayalam' },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const resources = {
  en: { translation: en },
  hi: { translation: hi },
  te: { translation: te },
  ta: { translation: ta },
  kn: { translation: kn },
  ml: { translation: ml },
};

const STORAGE_KEY = 'yagnika_language';
const CODES = SUPPORTED_LANGUAGES.map(l => l.code) as string[];

function deviceLanguage(): LangCode {
  try {
    const codes = getLocales().map(l => (l.languageCode || '').toLowerCase());
    const match = codes.find(c => CODES.includes(c));
    return (match as LangCode) || 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // replaced by loadStoredLanguage() on startup
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Call once on app start (after i18n is initialised).
export async function loadStoredLanguage(): Promise<void> {
  let lng: LangCode = deviceLanguage();
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && CODES.includes(stored)) lng = stored as LangCode;
  } catch {}
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
}

export async function setLanguage(code: LangCode): Promise<void> {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {}
}

export default i18n;

/* PanchangamScreen — native Panchangam feature inside the Panchangam tab of
   both apps. One scroll + slide-up sheets (Complete Panchangam / Muhurtam /
   Kundali / Festivals / Location). Data from the in-app backend. */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, ActivityIndicator,
  StyleSheet, TextInput, RefreshControl, Platform, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/src/theme';
import MiniCalendar from '@/src/components/MiniCalendar';
import KalaChakra from '@/src/components/panchangam/KalaChakra';
import SkyMap from '@/src/components/panchangam/SkyMap';
import {
  Panchangam, Festival, Coords, pick as pickLoc, fetchPanchangam, fetchFestivals,
  checkMuhurtam, fetchKundali, fetchSkyView, getSpecialKalas, activeKala, countdown,
  AUSPICIOUS_KALAS, isoOf, todayIso, parseIso, greetingKey, to24h, RASI_NAMES,
  CITIES, DEFAULT_CITY, resolveDeviceLocation,
} from '@/src/lib/panchangam';

const M = colors.darkRed;
const GOLD = colors.amber700;
const GREEN = colors.emerald800;
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const SCREEN_BG = '#FCF5D8';   // light yellow — whole Panchangam screen
const CARD = '#FFFDF0';        // pale yellow card
const SHEET_BG = '#FBF3D2';    // light yellow sheet / detail background
const LINE = '#E7D9B4';        // warm hairline

// yagnika.in hero backgrounds (Ganesha by the river) — one per day phase.
const HERO_IMG: Record<string, any> = {
  morning: require('../../assets/panchangam/hero-morning.png'),
  afternoon: require('../../assets/panchangam/hero-afternoon.png'),
  evening: require('../../assets/panchangam/hero-evening.png'),
  night: require('../../assets/panchangam/hero-night.png'),
};

// Gregorian month names for the hero date line (Hermes has no reliable Intl
// locale data, so we localise the display date ourselves).
const MONTHS: Record<string, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  te: ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'],
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  ta: ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'],
  kn: ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'],
  ml: ['ജനുവരി', 'ഫെബ്രുവരി', 'മാർച്ച്', 'ഏപ്രിൽ', 'മേയ്', 'ജൂൺ', 'ജൂലൈ', 'ഓഗസ്റ്റ്', 'സെപ്റ്റംബർ', 'ഒക്ടോബർ', 'നവംബർ', 'ഡിസംബർ'],
};
const monthArr = (lang: string) => MONTHS[lang] || MONTHS.en;

/* ===================================================================== */

export default function PanchangamScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const P = useCallback((v: any) => pickLoc(v, lang), [lang]);
  // Keeps the last card clear of the dashboard tab bar, which grows by this inset.
  const insets = useSafeAreaInsets();
  // Kala Chakra size follows the web app on phones: 85% of the screen width, at most 450.
  const { width: screenW } = useWindowDimensions();
  const wheelSize = Math.round(Math.min(screenW * 0.85, 450));

  const [dateIso, setDateIso] = useState(todayIso);
  const [coords, setCoords] = useState<Coords>(DEFAULT_CITY);
  const [data, setData] = useState<Panchangam | null>(null);
  // Data shown is for `loadedKey`; while it differs from the requested day and
  // place, the screen is loading.
  const [loadedKey, setLoadedKey] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => new Date());

  const [sheet, setSheet] = useState<null | 'detail' | 'muhurtam' | 'kundali' | 'festivals' | 'date' | 'location'>(null);

  const load = useCallback(async (iso: string, c: Coords) => {
    try { setData(await fetchPanchangam(iso, c)); setErr(''); }
    catch (e: any) { setErr(e?.message || 'Failed to load panchangam'); }
  }, []);

  const requestKey = `${dateIso}|${coords.latitude},${coords.longitude}`;
  const loading = loadedKey !== requestKey;
  // State is only updated when the response arrives, and only for the latest
  // request: switching days quickly can't let an older response overwrite it.
  useEffect(() => {
    let alive = true;
    fetchPanchangam(dateIso, coords)
      .then((d) => { if (alive) { setData(d); setErr(''); } })
      .catch((e: any) => { if (alive) setErr(e?.message || 'Failed to load panchangam'); })
      .finally(() => { if (alive) setLoadedKey(requestKey); });
    return () => { alive = false; };
  }, [dateIso, coords, requestKey]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(dateIso, coords); setRefreshing(false); }, [dateIso, coords, load]);

  const isToday = dateIso === todayIso();
  const refDate = useMemo(() => parseIso(dateIso), [dateIso]);
  const kalas = useMemo(() => getSpecialKalas(data), [data]);
  const active = useMemo(() => activeKala(kalas, now, isToday), [kalas, now, isToday]);
  const phase = useMemo(() => greetingKey(data, now), [data, now]);
  const g = data?.general;

  const then = t('panchangam.then');
  const pcgList = g ? [
    { k: t('panchangam.samvatsara'), v: P(g.samvatsara) },
    { k: t('panchangam.ayana'), v: P(g.ayanam) },
    { k: t('panchangam.ritu'), v: P(g.ritu) },
    { k: t('panchangam.masa'), v: P(g.masa) },
    { k: t('panchangam.paksha'), v: P(g.paksha) },
    { k: t('panchangam.tithi'), v: `${P(g.tithi)} ${P(g.tithi_till)}${g.tithi_next ? `, ${then} ${P(g.tithi_next)}` : ''}`.trim() },
    { k: t('panchangam.varam'), v: P(g.varam) },
    { k: t('panchangam.nakshatra'), v: `${P(g.nakshatra)} ${P(g.nakshatra_till)}`.trim() },
    { k: t('panchangam.yoga'), v: `${P(g.yoga)} ${P(g.yoga_till)}`.trim() },
    { k: t('panchangam.karana'), v: `${P(g.karana)} ${P(g.karana_till)}`.trim() },
  ] : [];

  const todaysFestival = data?.extended?.festivals?.[0];

  // Localised display date: "<weekday>, <dd> <Month> <yyyy>"
  const heroDate = (() => {
    const mm = monthArr(lang);
    let d = refDate.getDate(), m = refDate.getMonth(), y = refDate.getFullYear();
    if (data?.date && /^\d{2}\/\d{2}\/\d{4}$/.test(data.date)) {
      const [dd, mo, yy] = data.date.split('/').map(Number);
      d = dd; m = mo - 1; y = yy;
    }
    const wd = g && P(g.varam) ? P(g.varam) : '';
    return `${wd ? wd + ', ' : ''}${d} ${mm[m]} ${y}`;
  })();
  const dateNavLabel = isToday ? t('panchangam.today') : `${refDate.getDate()} ${monthArr(lang)[refDate.getMonth()]}`;

  return (
    <View style={styles.root}>
      {/* The dashboard renders the shared red header above this. A small
          location chip floats over the hero (below). */}
      {loading && !data ? (
        <View style={styles.center}><ActivityIndicator color={M} size="large" /></View>
      ) : err && !data ? (
        <View style={styles.center}>
          <Text style={styles.errText}>{err}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load(dateIso, coords)}><Text style={styles.retryText}>{t('panchangam.retry')}</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 130 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={M} />}
        >
          {/* hero — the FULL brightened yagnika.in Ganesha photo, mirrored
              (deity on the right). Text overlaid on top over a soft top
              scrim so it reads while Ganesha below stays bright. */}
          <View style={styles.hero}>
            <Image
              source={HERO_IMG[phase]}
              style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}
              contentFit="cover"
              transition={250}
            />
            <LinearGradient
              colors={['rgba(18,10,4,0.62)', 'rgba(18,10,4,0.28)', 'transparent']}
              locations={[0, 0.28, 0.55]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Pressable style={styles.heroLocPill} onPress={() => setSheet('location')}>
              <Ionicons name="location-sharp" size={12} color="#FFF" />
              <Text style={styles.heroLocText} numberOfLines={1}>{coords.label || 'Hyderabad'}</Text>
              <Ionicons name="chevron-down" size={11} color="#FFF" />
            </Pressable>
            <View style={styles.heroInner}>
              <Text style={styles.greet}>{t(`panchangam.greet.${phase}`)}</Text>
              <Text style={styles.greetName}>{t('common.appName')} 🙏</Text>
              <Text style={styles.greetDate}>{heroDate}</Text>
              <View style={styles.sunRow}>
                <View style={styles.sunItem}>
                  <Ionicons name="sunny" size={16} color="#FFE0A0" />
                  <View>
                    <Text style={styles.sunLbl}>{t('panchangam.sunrise')}</Text>
                    <Text style={styles.sunVal}>{data?.solar?.sunrise || '--'}</Text>
                  </View>
                </View>
                <View style={styles.sunSep} />
                <View style={styles.sunItem}>
                  <Ionicons name="moon" size={15} color="#E7DBFF" />
                  <View>
                    <Text style={styles.sunLbl}>{t('panchangam.moonrise')}</Text>
                    <Text style={styles.sunVal}>{data?.lunar?.moonrise || '--'}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.shloka} numberOfLines={3}>“{t('panchangam.shloka')}”  ॐ</Text>
            </View>
          </View>

          {/* today's panchangam — full details, classic list */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardIcon}><Ionicons name="flower" size={16} color={GOLD} /></View>
              <Text style={styles.cardTitle}>{t('panchangam.todaysPanchangam')}</Text>
            </View>
            {loading && pcgList.length === 0 ? (
              <Text style={styles.pcgLoading}>…</Text>
            ) : pcgList.map((r, i) => <PcgRow key={i} k={r.k} v={r.v} first={i === 0} />)}

            {/* date selector — above "View Complete Panchangam", same style, in this card */}
            <Pressable style={styles.completeBtn} onPress={() => setSheet('date')}>
              <Ionicons name="calendar-outline" size={15} color={M} />
              <Text style={styles.completeText}>{dateNavLabel}</Text>
              <Ionicons name="chevron-down" size={15} color={M} />
            </Pressable>

            <Pressable style={styles.completeBtn} onPress={() => setSheet('detail')}>
              <Ionicons name="document-text-outline" size={15} color={M} />
              <Text style={styles.completeText}>{t('panchangam.viewComplete')}</Text>
              <Ionicons name="chevron-forward" size={15} color={M} />
            </Pressable>
          </View>

          {/* kala chakra */}
          <Text style={styles.kalaHeading}>〜 {t('panchangam.kalaChakra')} 〜</Text>
          <View style={{ alignItems: 'center', marginTop: 2 }}>
            <KalaChakra kalas={kalas} refDate={refDate} activeId={active?.kala.id} lang={lang} size={wheelSize} />
          </View>

          {active ? (
            <View style={[styles.kalaActive, AUSPICIOUS_KALAS.has(active.kala.id) ? styles.kaGood : styles.kaBad]}>
              <Text style={{ fontSize: 17 }}>{AUSPICIOUS_KALAS.has(active.kala.id) ? '🪷' : '⚠️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kaName, { color: AUSPICIOUS_KALAS.has(active.kala.id) ? GREEN : M }]}>
                  {P(active.kala.name)}  <Text style={styles.kaNow}>({t('panchangam.activeNow')})</Text>
                </Text>
                <Text style={styles.kaTime}>{active.kala.time}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.kaEndsLbl}>{t('panchangam.endsIn')}</Text>
                <Text style={styles.kaEndsVal}>{countdown(now, active.end)}</Text>
              </View>
            </View>
          ) : null}

          {/* quick view */}
          <Text style={styles.sectionTitle}>✳ {t('panchangam.quickView')}</Text>
          <View style={styles.quickRow}>
            <QuickCard tint="#F6EAD3" border="#EBDBB6" icon="calendar" iconColor={GOLD}
              title={t('panchangam.findMuhurtham')} sub={t('panchangam.muhurthamSub')} onPress={() => setSheet('muhurtam')} />
            <QuickCard tint="#ECE7FA" border="#DDD3F5" icon="star" iconColor="#6247A6"
              title={t('panchangam.myKundali')} sub={t('panchangam.kundaliSub')} onPress={() => setSheet('kundali')} />
            <QuickCard tint="#E3EEF9" border="#D0E2F3" icon="moon" iconColor="#2C6BB0"
              title={t('panchangam.festivals')} sub={todaysFestival ? P(todaysFestival.name) : t('panchangam.festivalsSub')} onPress={() => setSheet('festivals')} />
          </View>
        </ScrollView>
      )}

      {/* sheets */}
      <Sheet visible={sheet === 'date'} title={t('panchangam.pickDate')} onClose={() => setSheet(null)}>
        <MiniCalendar mode="single" value={dateIso} onChange={(v: string) => { setDateIso(v); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === 'location'} title={t('panchangam.pickLocation')} onClose={() => setSheet(null)}>
        <LocationPicker value={coords} t={t} onChange={(c) => { setCoords(c); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === 'detail'} title={t('panchangam.completeTitle')} onClose={() => setSheet(null)}>
        {data && <DetailBody data={data} P={P} t={t} kalas={kalas} />}
      </Sheet>

      <Sheet visible={sheet === 'muhurtam'} title={t('panchangam.findMuhurtham')} onClose={() => setSheet(null)}>
        <MuhurtamBody P={P} t={t} lang={lang} initialCoords={coords} />
      </Sheet>

      <Sheet visible={sheet === 'kundali'} title={t('panchangam.myKundali')} onClose={() => setSheet(null)}>
        <KundaliBody P={P} t={t} lang={lang} initialCoords={coords} />
      </Sheet>

      <Sheet visible={sheet === 'festivals'} title={t('panchangam.festivals')} onClose={() => setSheet(null)}>
        <FestivalsBody P={P} t={t} year={refDate.getFullYear()} coords={coords} />
      </Sheet>
    </View>
  );
}

/* ===================== small pieces ===================== */

function QuickCard({ tint, border, icon, iconColor, title, sub, onPress }: any) {
  return (
    <Pressable style={[styles.quickCard, { backgroundColor: tint, borderColor: border }]} onPress={onPress}>
      <View style={styles.quickIco}><Ionicons name={icon} size={18} color={iconColor} /></View>
      <Text style={[styles.quickTitle, { color: iconColor }]}>{title}</Text>
      <Text style={styles.quickSub} numberOfLines={3}>{sub}</Text>
      <Ionicons name="arrow-forward" size={14} color={colors.gray400} style={{ alignSelf: 'flex-end', marginTop: 'auto' }} />
    </Pressable>
  );
}

function Sheet({ visible, title, onClose, children }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable hitSlop={10} onPress={onClose}><Ionicons name="close" size={22} color={colors.gray500} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Location picker (also used inside Muhurtam / Kundali) ---------- */

function LocationPicker({ value, onChange, t }: { value: Coords; onChange: (c: Coords) => void; t: any }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const useDevice = async () => {
    setBusy(true); setMsg('');
    const c = await resolveDeviceLocation();
    setBusy(false);
    if (c) onChange(c);
    else setMsg(t('panchangam.locDenied'));
  };

  return (
    <View>
      <Pressable style={styles.primaryBtn} onPress={useDevice} disabled={busy}>
        <Ionicons name="navigate" size={15} color="#fff" />
        <Text style={styles.primaryBtnText}>{busy ? t('panchangam.locating') : t('panchangam.useMyLocation')}</Text>
      </Pressable>
      {msg ? <Text style={styles.errText}>{msg}</Text> : null}
      <Text style={styles.locGroupLbl}>{t('panchangam.chooseCity')}</Text>
      <View style={styles.cityWrap}>
        {CITIES.map((c) => {
          const on = Math.abs(c.latitude - value.latitude) < 0.02 && Math.abs(c.longitude - value.longitude) < 0.02;
          return (
            <Pressable key={c.label} style={[styles.cityChip, on && styles.cityChipOn]}
              onPress={() => onChange({ ...c, tzOffsetMin: 330, label: c.label })}>
              <Text style={[styles.cityChipText, on && { color: '#fff' }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LocationField({ value, onChange, t }: { value: Coords; onChange: (c: Coords) => void; t: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 10 }}>
      <Pressable style={styles.locField} onPress={() => setOpen((o) => !o)}>
        <Ionicons name="location-sharp" size={15} color={M} />
        <Text style={styles.locFieldText}>{value.label || `${value.latitude.toFixed(2)}, ${value.longitude.toFixed(2)}`}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.gray500} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8 }}>
          <LocationPicker value={value} t={t} onChange={(c) => { onChange(c); setOpen(false); }} />
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Detail ---------- */

function DL({ children }: any) { return <View style={styles.dl}>{children}</View>; }
function DRow({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return <View style={styles.dlRow}><Text style={styles.dlK}>{k}</Text><Text style={styles.dlV}>{v}</Text></View>;
}

// Classic panchangam list row: "label:" + value, maroon text, thin gold rule.
function PcgRow({ k, v, first }: { k: string; v?: string | null; first?: boolean }) {
  if (!v) return null;
  return (
    <View style={[styles.pcgItem, first && { borderTopWidth: 0 }]}>
      <Text style={styles.pcgK}>{k}:</Text>
      <Text style={styles.pcgV}>{v}</Text>
    </View>
  );
}
function PeriodTable({ list, P }: { list: any[]; P: (v: any) => string }) {
  return (
    <View style={{ marginTop: 4 }}>
      {(list || []).map((p, i) => (
        <View key={i} style={styles.ptRow}>
          <Text style={[styles.ptName, p.good === true && { color: GREEN }, p.good === false && { color: M }]} numberOfLines={1}>{P(p.name)}</Text>
          <Text style={styles.ptTime}>{p.start}–{p.end}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailBody({ data, P, t, kalas }: any) {
  const g = data.general; const ext = data.extended || {};
  const then = t('panchangam.then');
  const tithi = g && `${P(g.tithi)} ${P(g.tithi_till)}${g.tithi_next ? `, ${then} ${P(g.tithi_next)}` : ''}`.trim();
  const nak = g && `${P(g.nakshatra)} ${P(g.nakshatra_till)}`.trim();
  const grahaOrder = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'];

  return (
    <View>
      <Text style={styles.detSecTitle}>{t('panchangam.details')}</Text>
      <View style={styles.pcgListCard}>
        <PcgRow first k={t('panchangam.samvatsara')} v={g && P(g.samvatsara)} />
        <PcgRow k={t('panchangam.ayana')} v={g && P(g.ayanam)} />
        <PcgRow k={t('panchangam.ritu')} v={g && P(g.ritu)} />
        <PcgRow k={t('panchangam.masa')} v={g && P(g.masa)} />
        <PcgRow k={t('panchangam.paksha')} v={g && P(g.paksha)} />
        <PcgRow k={t('panchangam.tithi')} v={tithi} />
        <PcgRow k={t('panchangam.varam')} v={g && P(g.varam)} />
        <PcgRow k={t('panchangam.nakshatra')} v={nak} />
        <PcgRow k={t('panchangam.yoga')} v={g && `${P(g.yoga)} ${P(g.yoga_till)}`.trim()} />
        <PcgRow k={t('panchangam.karana')} v={g && `${P(g.karana)} ${P(g.karana_till)}`.trim()} />
      </View>

      <Text style={styles.detSecTitle}>{t('panchangam.timingsKalas')}</Text>
      <DL>
        <DRow k={t('panchangam.sunrise')} v={data.solar?.sunrise} />
        <DRow k={t('panchangam.sunset')} v={data.solar?.sunset} />
        <DRow k={t('panchangam.moonrise')} v={data.lunar?.moonrise} />
        <DRow k={t('panchangam.moonset')} v={data.lunar?.moonset} />
      </DL>
      <View style={{ height: 8 }} />
      <DL>{kalas.map((k: any) => <DRow key={k.id} k={P(k.name)} v={k.time && k.time !== '---' ? k.time : '—'} />)}</DL>

      {ext.festivals?.length ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.festival')}</Text>
          <DL>{ext.festivals.map((f: any, i: number) => <DRow key={i} k={P(f.name)} v={f.tithi_start ? `${f.tithi_start} – ${f.tithi_end}` : '—'} />)}</DL>
        </>
      ) : null}

      {ext.choghadiya ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.choghadiya')}</Text>
          <View style={styles.dnRow}>
            <View style={{ flex: 1 }}><Text style={styles.dnHead}>{t('panchangam.day')}</Text><PeriodTable list={ext.choghadiya.day} P={P} /></View>
            <View style={{ flex: 1 }}><Text style={styles.dnHead}>{t('panchangam.night')}</Text><PeriodTable list={ext.choghadiya.night} P={P} /></View>
          </View>
        </>
      ) : null}

      {ext.hora?.length ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.hora')}</Text>
          <View style={styles.dnRow}>
            <View style={{ flex: 1 }}><PeriodTable list={ext.hora.slice(0, Math.ceil(ext.hora.length / 2))} P={P} /></View>
            <View style={{ flex: 1 }}><PeriodTable list={ext.hora.slice(Math.ceil(ext.hora.length / 2))} P={P} /></View>
          </View>
        </>
      ) : null}

      {ext.gowri_panchangam ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.gowri')}</Text>
          <View style={styles.dnRow}>
            <View style={{ flex: 1 }}><Text style={styles.dnHead}>{t('panchangam.day')}</Text><PeriodTable list={ext.gowri_panchangam.day} P={P} /></View>
            <View style={{ flex: 1 }}><Text style={styles.dnHead}>{t('panchangam.night')}</Text><PeriodTable list={ext.gowri_panchangam.night} P={P} /></View>
          </View>
        </>
      ) : null}

      {ext.graha_positions ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.graha')}</Text>
          <DL>
            {grahaOrder.map((key) => {
              const p = ext.graha_positions[key];
              if (!p) return null;
              const flags = `${p.retrograde ? ' ↺' : ''}${p.combust ? ' ☌' : ''}`;
              return <DRow key={key} k={P(p.name)} v={`${P(p.rashi)} ${typeof p.degree === 'number' ? p.degree.toFixed(1) + '°' : ''}${flags}`} />;
            })}
          </DL>
        </>
      ) : null}

      {ext.nakshatra_info ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.nakshatraInfo')}</Text>
          <DL>
            <DRow k={t('panchangam.lord')} v={P(ext.nakshatra_info.lord)} />
            <DRow k={t('panchangam.deity')} v={P(ext.nakshatra_info.deity)} />
            <DRow k={t('panchangam.gana')} v={P(ext.nakshatra_info.gana)} />
            <DRow k={t('panchangam.nadi')} v={P(ext.nakshatra_info.nadi)} />
          </DL>
        </>
      ) : null}

      {(ext.lagna || ext.disha_shoola || ext.special_days || ext.bhadra) ? (
        <>
          <Text style={styles.detSecTitle}>{t('panchangam.lagnaMore')}</Text>
          {ext.lagna ? <Text style={styles.note}>{t('panchangam.lagna')}: {P(ext.lagna.rashi)} {typeof ext.lagna.degree === 'number' ? ext.lagna.degree.toFixed(1) + '°' : ''}</Text> : null}
          {ext.disha_shoola ? <Text style={styles.note}>{t('panchangam.dishaShoola')}: {P(ext.disha_shoola)}</Text> : null}
          {ext.special_days && (ext.special_days.ekadashi || ext.special_days.pournami || ext.special_days.amavasya) ? (
            <Text style={styles.note}>
              {t('panchangam.todayIs')}: {[
                ext.special_days.ekadashi && t('panchangam.ekadashi'),
                ext.special_days.pournami && t('panchangam.pournami'),
                ext.special_days.amavasya && t('panchangam.amavasya'),
              ].filter(Boolean).join(', ')}
            </Text>
          ) : null}
          {ext.bhadra ? <Text style={[styles.note, styles.noteWarn]}>{t('panchangam.bhadra')}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

/* ---------- Muhurtam ---------- */

function MuhurtamBody({ P, t, lang, initialCoords }: any) {
  const [start, setStart] = useState(todayIso);
  const [end, setEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return isoOf(d); });
  const [showCal, setShowCal] = useState<null | 'start' | 'end'>(null);
  const [coords, setCoords] = useState<Coords>(initialCoords);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState('');
  const [slot, setSlot] = useState<{ key: string; loading: boolean; chart?: any; err?: string } | null>(null);

  const run = async () => {
    setLoading(true); setError(''); setRes(null); setSlot(null);
    try {
      setRes(await checkMuhurtam({
        start_date: start, end_date: end,
        latitude: coords.latitude, longitude: coords.longitude, tz_offset_min: coords.tzOffsetMin,
      }));
    } catch (e: any) { setError(e?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const openSlot = async (key: string, dateIso: string, startStr: string) => {
    if (slot?.key === key) { setSlot(null); return; }
    setSlot({ key, loading: true });
    try {
      const chart = await fetchKundali({
        birth_date: dateIso, birth_time: to24h(startStr),
        latitude: coords.latitude, longitude: coords.longitude, tz_offset_min: coords.tzOffsetMin,
      });
      setSlot({ key, loading: false, chart });
    } catch (e: any) {
      setSlot({ key, loading: false, err: e?.message || 'Failed' });
    }
  };

  return (
    <View>
      <Text style={styles.note}>{t('panchangam.muhurthamNote')}</Text>
      <LocationField value={coords} onChange={setCoords} t={t} />
      <View style={styles.mFieldRow}>
        <Pressable style={styles.mField} onPress={() => setShowCal('start')}>
          <Text style={styles.mFieldLbl}>{t('panchangam.from')}</Text><Text style={styles.mFieldVal}>{start}</Text>
        </Pressable>
        <Pressable style={styles.mField} onPress={() => setShowCal('end')}>
          <Text style={styles.mFieldLbl}>{t('panchangam.to')}</Text><Text style={styles.mFieldVal}>{end}</Text>
        </Pressable>
      </View>
      {showCal ? (
        <MiniCalendar mode="single" value={showCal === 'start' ? start : end} min={showCal === 'end' ? start : undefined}
          onChange={(v: string) => { if (showCal === 'start') setStart(v); else setEnd(v); setShowCal(null); }} />
      ) : null}
      <Pressable style={styles.primaryBtn} onPress={run} disabled={loading}>
        <Text style={styles.primaryBtnText}>{loading ? t('panchangam.checking') : t('panchangam.findGoodMuhurtams')}</Text>
      </Pressable>
      {error ? <Text style={styles.errText}>{error}</Text> : null}
      {res?.results?.length === 0 ? <Text style={styles.note}>{t('panchangam.noMuhurtams')}</Text> : null}
      {res?.results?.length ? <Text style={styles.mHint}>{t('panchangam.tapSlotHint')}</Text> : null}
      {res?.results?.map((r: any, i: number) => (
        <View key={i} style={styles.mResult}>
          <Text style={styles.mResultDate}>{parseIso(r.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</Text>
          <Text style={styles.mResultSub}>{P(r.tithi)} · {P(r.nakshatra)} · {P(r.paksha)}</Text>
          <View style={styles.mWindows}>
            {(r.windows || []).map((w: any, j: number) => {
              const key = `${i}-${j}`;
              const open = slot?.key === key;
              return (
                <Pressable key={j} style={[styles.mWindow, open && styles.mWindowOn]} onPress={() => openSlot(key, r.date, w.start)}>
                  <Text style={[styles.mWindowTime, open && { color: '#fff' }]}>{w.start} – {w.end}</Text>
                  {w.lagna ? <Text style={[styles.mWindowLagna, open && { color: 'rgba(255,255,255,0.85)' }]}>{t('panchangam.lagna')}: {P(w.lagna)}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          {slot && slot.key.startsWith(`${i}-`) ? (
            <View style={styles.slotChart}>
              {slot.loading ? <ActivityIndicator color={M} /> :
               slot.err ? <Text style={styles.errText}>{slot.err}</Text> :
               slot.chart ? (
                 <>
                   <Text style={styles.note}>{t('panchangam.lagna')}: {P(slot.chart.ascendant?.rashi)} {typeof slot.chart.ascendant?.degree === 'number' ? slot.chart.ascendant.degree.toFixed(1) + '°' : ''}</Text>
                   <KundaliGrid chart={slot.chart} t={t} lang={lang} />
                 </>
               ) : null}
            </View>
          ) : null}
          {r.excluded ? (
            <Text style={styles.mExcluded}>
              {t('panchangam.avoid')}: {Object.entries(r.excluded).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join('  ·  ')}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ---------- Kundali ---------- */

const SI_CELLS: (number | null)[] = [11, 0, 1, 2, 10, null, null, 3, 9, null, null, 4, 8, 7, 6, 5];

function KundaliGrid({ chart, t, lang }: any) {
  const bySign: Record<number, string[]> = {};
  Object.entries(chart.planets || {}).forEach(([, p]: any) => {
    const idx = p.rashi_index;
    (bySign[idx] = bySign[idx] || []).push(pickLoc(p.name, lang).slice(0, 3));
  });
  const ascIdx = chart.ascendant?.rashi_index;
  const ascShort = (t('panchangam.lagna') || 'Lagna').slice(0, 3);
  return (
    <View style={styles.kGrid}>
      {SI_CELLS.map((sign, i) => {
        if (sign === null) {
          return <View key={i} style={[styles.kCell, styles.kCentre]}>{i === 5 ? <Text style={styles.kCentreText}>{t('panchangam.rasiD1')}</Text> : null}</View>;
        }
        return (
          <View key={i} style={styles.kCell}>
            <Text style={styles.kCellSign} numberOfLines={1}>{pickLoc(RASI_NAMES[sign], lang).slice(0, 4)}</Text>
            <View style={styles.kCellBodies}>
              {ascIdx === sign ? <Text style={[styles.kBody, styles.kAsc]}>{ascShort}</Text> : null}
              {(bySign[sign] || []).map((ab, j) => <Text key={j} style={styles.kBody}>{ab}</Text>)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function KundaliBody({ P, t, lang, initialCoords }: any) {
  const [date, setDate] = useState('1990-01-01');
  const [time, setTime] = useState('12:00');
  const [showCal, setShowCal] = useState(false);
  const [coords, setCoords] = useState<Coords>(initialCoords);
  const [view, setView] = useState<'chart' | 'sky'>('chart');
  const [loading, setLoading] = useState(false);
  const [chart, setChart] = useState<any>(null);
  const [sky, setSky] = useState<any>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true); setError(''); setChart(null); setSky(null);
    const body = {
      birth_date: date, birth_time: time,
      latitude: coords.latitude, longitude: coords.longitude, tz_offset_min: coords.tzOffsetMin,
    };
    try {
      const [c, s] = await Promise.all([fetchKundali(body), fetchSkyView(body).catch(() => null)]);
      setChart(c); setSky(s);
    } catch (e: any) { setError(e?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const dirLabels = {
    n: t('panchangam.dirN'), e: t('panchangam.dirE'), s: t('panchangam.dirS'), w: t('panchangam.dirW'),
  };

  return (
    <View>
      <Text style={styles.note}>{t('panchangam.kundaliNote')}</Text>
      <LocationField value={coords} onChange={setCoords} t={t} />
      <View style={styles.mFieldRow}>
        <Pressable style={styles.mField} onPress={() => setShowCal(true)}>
          <Text style={styles.mFieldLbl}>{t('panchangam.birthDate')}</Text><Text style={styles.mFieldVal}>{date}</Text>
        </Pressable>
        <View style={styles.mField}>
          <Text style={styles.mFieldLbl}>{t('panchangam.birthTime')}</Text>
          <TextInput style={styles.mFieldVal} value={time} onChangeText={setTime} placeholder="HH:MM"
            placeholderTextColor={colors.gray400} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      {showCal ? <MiniCalendar mode="single" value={date} max={todayIso()} onChange={(v: string) => { setDate(v); setShowCal(false); }} /> : null}
      <Pressable style={styles.primaryBtn} onPress={run} disabled={loading}>
        <Text style={styles.primaryBtnText}>{loading ? t('panchangam.computing') : t('panchangam.showChart')}</Text>
      </Pressable>
      {error ? <Text style={styles.errText}>{error}</Text> : null}

      {chart ? (
        <View style={{ marginTop: 12 }}>
          <View style={styles.segRow}>
            <Pressable style={[styles.segBtn, view === 'chart' && styles.segBtnOn]} onPress={() => setView('chart')}>
              <Text style={[styles.segText, view === 'chart' && styles.segTextOn]}>{t('panchangam.chartTab')}</Text>
            </Pressable>
            <Pressable style={[styles.segBtn, view === 'sky' && styles.segBtnOn]} onPress={() => setView('sky')} disabled={!sky}>
              <Text style={[styles.segText, view === 'sky' && styles.segTextOn, !sky && { opacity: 0.4 }]}>{t('panchangam.skyTab')}</Text>
            </Pressable>
          </View>

          {view === 'chart' ? (
            <>
              <Text style={styles.note}>{t('panchangam.lagna')}: {P(chart.ascendant?.rashi)} {typeof chart.ascendant?.degree === 'number' ? chart.ascendant.degree.toFixed(1) + '°' : ''}</Text>
              <KundaliGrid chart={chart} t={t} lang={lang} />
              <DL>
                {Object.entries(chart.planets || {}).map(([key, p]: any) => (
                  <DRow key={key} k={P(p.name)} v={`${P(p.rashi)} ${typeof p.degree === 'number' ? p.degree.toFixed(1) + '°' : ''}${p.retrograde ? ' ↺' : ''}${p.combust ? ' ☌' : ''}`} />
                ))}
              </DL>
            </>
          ) : sky ? (
            <>
              <Text style={styles.note}>{t('panchangam.skyNote')}</Text>
              <SkyMap planets={sky.planets} lang={lang} dirLabels={dirLabels} size={300} />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Festivals ---------- */

function FestivalsBody({ P, t, year, coords }: any) {
  const [list, setList] = useState<Festival[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetchFestivals(year, coords)
      .then((f) => { if (!cancelled) setList(f); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed'); });
    return () => { cancelled = true; };
  }, [year, coords]);

  if (error) return <Text style={styles.errText}>{error}</Text>;
  if (!list) return <ActivityIndicator color={M} style={{ marginTop: 24 }} />;

  const flat = list.flatMap((f) => (f.dates || []).map((d) => ({ ...f, date: d })));
  flat.sort((a, b) => a.date.localeCompare(b.date));
  const today = todayIso();
  const monthOf = (iso: string) => parseIso(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return (
    <View>
      {flat.map((it, i) => {
        const d = parseIso(it.date);
        const mk = monthOf(it.date);
        const showMonth = i === 0 || mk !== monthOf(flat[i - 1].date);
        return (
          <View key={`${i}-${it.date}`}>
            {showMonth ? <Text style={styles.festMonth}>{mk}</Text> : null}
            <View style={styles.festRow}>
              <View style={styles.festDate}><Text style={styles.festD}>{d.getDate()}</Text><Text style={styles.festM}>{d.toLocaleDateString('en-US', { month: 'short' })}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.festName}>{P(it.name)}</Text>
                {it.tithi_start ? <Text style={styles.festSub}>{it.tithi_start} – {it.tithi_end}</Text> : null}
              </View>
              {it.date === today ? <Text style={styles.festToday}>{t('panchangam.today')}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ===================== styles ===================== */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errText: { color: M, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  retryBtn: { backgroundColor: M, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },

  heroLocPill: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 160 },
  heroLocText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', flexShrink: 1 },
  headerWrap: { backgroundColor: colors.deepRed },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 86 },
  wordmark: { alignItems: 'center' },
  wmMain: { fontFamily: SERIF, fontSize: 24, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  wmSub: { fontSize: 12, fontWeight: '600', color: '#F6D9A6', marginTop: 0, letterSpacing: 0 },
  locPill: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 128, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
  locPillText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12, flexShrink: 1 },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 10, marginTop: 6 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F3E3D6', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  datePillText: { color: M, fontWeight: '700', fontSize: 12.5 },

  hero: { overflow: 'hidden', aspectRatio: 853 / 1327, backgroundColor: '#241610' },
  heroInner: { padding: 16, paddingTop: 14 },
  greet: { fontFamily: SERIF, fontSize: 29, fontWeight: '700', color: '#FFF7E8', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 9 },
  greetName: { fontFamily: SERIF, fontSize: 19, fontWeight: '700', color: '#FFEFD9', marginTop: 2, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 7 },
  greetDate: { marginTop: 4, fontSize: 12.5, color: '#F6EADB', fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 6 },
  sunRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  sunItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sunSep: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.4)' },
  sunLbl: { fontSize: 10, color: '#F0E6D8', fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 5 },
  sunVal: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 5 },
  shloka: { fontFamily: SERIF, fontStyle: 'italic', fontSize: 11.5, color: '#F6EBDC', marginTop: 10, lineHeight: 17, maxWidth: '74%', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 5 },

  card: { backgroundColor: CARD, marginHorizontal: 12, marginTop: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: LINE, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  cardIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1E1BF', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: M },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F3E3D6', paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  completeText: { color: M, fontWeight: '700', fontSize: 13 },

  pcgItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E0CFA8' },
  pcgK: { width: '33%', fontSize: 13.5, fontWeight: '600', color: M, paddingRight: 8 },
  pcgV: { flex: 1, fontSize: 13.5, fontWeight: '700', color: M, lineHeight: 19 },
  pcgLoading: { paddingVertical: 16, textAlign: 'center', color: colors.gray400 },
  pcgListCard: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 2 },

  kalaHeading: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: M, textAlign: 'center', marginTop: 22 },

  kalaActive: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginTop: 6, borderRadius: radius.md, borderWidth: 1, padding: 12 },
  kaGood: { backgroundColor: '#E3EFE6', borderColor: '#CBE1D2' },
  kaBad: { backgroundColor: '#F3E3D6', borderColor: '#E6CDC1' },
  kaName: { fontWeight: '800', fontSize: 13 },
  kaNow: { fontWeight: '600', fontSize: 11, color: colors.gray600 },
  kaTime: { fontSize: 11.5, color: colors.gray600, marginTop: 1 },
  kaEndsLbl: { fontSize: 10, color: colors.gray500 },
  kaEndsVal: { fontSize: 14, fontWeight: '800', color: colors.gray800, fontVariant: ['tabular-nums'] },

  sectionTitle: { fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: M, marginHorizontal: 16, marginTop: 22, marginBottom: 8 },

  quickRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12 },
  quickCard: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: 12, minHeight: 134 },
  quickIco: { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  quickTitle: { fontWeight: '800', fontSize: 12.5 },
  quickSub: { fontSize: 10.5, color: colors.gray600, marginTop: 4, lineHeight: 14 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(40,20,12,0.45)' },
  sheetCard: { backgroundColor: SHEET_BG, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%', paddingHorizontal: 16, paddingTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  sheetTitle: { fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: M },

  locField: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray200, borderRadius: 12, padding: 12, backgroundColor: CARD },
  locFieldText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.gray800 },
  locGroupLbl: { fontSize: 11, color: colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  cityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cityChip: { borderWidth: 1, borderColor: colors.gray300, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: CARD },
  cityChipOn: { backgroundColor: M, borderColor: M },
  cityChipText: { fontSize: 12.5, fontWeight: '600', color: colors.gray700 },

  dl: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: radius.md, overflow: 'hidden' },
  dlRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.gray100 },
  dlK: { color: colors.gray500, width: '40%', fontSize: 13 },
  dlV: { color: colors.gray800, fontWeight: '600', flex: 1, textAlign: 'right', fontSize: 13 },
  detSecTitle: { fontFamily: SERIF, fontSize: 15, fontWeight: '700', color: M, marginTop: 16, marginBottom: 6, borderBottomWidth: 2, borderBottomColor: '#F6EAD3', paddingBottom: 4 },
  dnRow: { flexDirection: 'row', gap: 10 },
  dnHead: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.gray400, marginBottom: 2 },
  ptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  ptName: { fontSize: 11.5, color: colors.gray700, flex: 1 },
  ptTime: { fontSize: 10.5, color: colors.gray500 },
  note: { fontSize: 12.5, color: colors.gray600, backgroundColor: '#F6EAD3', borderRadius: 10, padding: 10, marginTop: 8 },
  noteWarn: { backgroundColor: '#F7E9E4', color: M },

  mFieldRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  mField: { flex: 1, borderWidth: 1, borderColor: colors.gray200, borderRadius: 12, padding: 10, backgroundColor: CARD },
  mFieldLbl: { fontSize: 10, color: colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  mFieldVal: { fontSize: 14, fontWeight: '700', color: colors.gray800, marginTop: 2, padding: 0 },
  primaryBtn: { flexDirection: 'row', gap: 8, backgroundColor: M, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  mResult: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: radius.md, padding: 12, marginTop: 10 },
  mResultDate: { fontWeight: '800', color: M, fontSize: 14 },
  mResultSub: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  mWindows: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  mWindow: { backgroundColor: '#E3EFE6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  mWindowOn: { backgroundColor: M },
  mWindowTime: { fontSize: 11.5, fontWeight: '700', color: GREEN },
  mWindowLagna: { fontSize: 9.5, color: colors.gray600 },
  mExcluded: { fontSize: 10.5, color: colors.gray500, marginTop: 8 },
  mHint: { fontSize: 11, color: colors.gray500, fontStyle: 'italic', marginTop: 10 },
  slotChart: { marginTop: 10, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: LINE, alignItems: 'center', backgroundColor: CARD },
  segBtnOn: { backgroundColor: M, borderColor: M },
  segText: { fontSize: 13, fontWeight: '700', color: M },
  segTextOn: { color: '#fff' },

  kGrid: { flexDirection: 'row', flexWrap: 'wrap', aspectRatio: 1, borderWidth: 1, borderColor: M, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  kCell: { width: '25%', height: '25%', borderWidth: 0.5, borderColor: colors.gray300, padding: 3 },
  kCentre: { backgroundColor: '#FBEFE0', alignItems: 'center', justifyContent: 'center' },
  kCentreText: { fontSize: 11, fontWeight: '800', color: M },
  kCellSign: { fontSize: 8, color: colors.gray400, fontWeight: '700' },
  kCellBodies: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 1 },
  kBody: { fontSize: 10, fontWeight: '700', color: colors.gray800 },
  kAsc: { color: M },

  festMonth: { fontFamily: SERIF, fontSize: 14, fontWeight: '700', color: M, marginTop: 14, marginBottom: 6 },
  festRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  festDate: { width: 42, alignItems: 'center' },
  festD: { fontSize: 18, fontWeight: '800', color: M },
  festM: { fontSize: 10, textTransform: 'uppercase', color: colors.gray500, letterSpacing: 1 },
  festName: { fontSize: 14, fontWeight: '700', color: colors.gray800 },
  festSub: { fontSize: 11, color: colors.gray500 },
  festToday: { fontSize: 10, fontWeight: '800', color: GREEN, backgroundColor: '#E5F1E8', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});

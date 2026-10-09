import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import MiniCalendar from '@/src/components/MiniCalendar';
import DeityHero from '@/src/components/DeityHero';

const SHIVA_HERO = require('../src/assets/panchangam/hero-shiva.png');
const M = colors.darkRed;                    // maroon — primary
const DKEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof DKEYS[number];
type Mode = 'both' | 'inperson' | 'epuja';
interface Slot { start: string; end: string }
interface WDay { off: boolean; unavailable: Slot[] }
interface Override { id: string; date: string; available: boolean; slots: Slot[] }
interface Availability {
  offline_paused: boolean; epuja_paused: boolean; same_availability: boolean;
  weekly: Record<DayKey, WDay>; weekly_inperson: Record<DayKey, WDay>; weekly_epuja: Record<DayKey, WDay>;
  buffer_minutes: number;
}

const isoToday = () => new Date().toISOString().slice(0, 10);
const dayLabel = (i: number) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' });
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINS = ['00', '15', '30', '45'];

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim()) || ['', '9', '00', 'AM'];
  const hour = +m[1] || 9, min = m[2] || '00', ap = (m[3] || 'AM').toUpperCase();
  const emit = (h: number, mm: string, a: string) => onChange(`${h}:${mm} ${a}`);
  return (
    <View style={styles.tpBox}>
      <View style={styles.chipRow}>
        {HOURS.map(h => (
          <Pressable key={h} onPress={() => emit(h, min, ap)} style={[styles.tpChip, hour === h && styles.chipOn]}>
            <Text style={[styles.tpChipT, hour === h && styles.chipOnT]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chipRow}>
        {MINS.map(mm => (
          <Pressable key={mm} onPress={() => emit(hour, mm, ap)} style={[styles.chip, min === mm && styles.chipOn]}>
            <Text style={[styles.chipT, min === mm && styles.chipOnT]}>:{mm}</Text>
          </Pressable>
        ))}
        {['AM', 'PM'].map(a => (
          <Pressable key={a} onPress={() => emit(hour, min, a)} style={[styles.chip, ap === a && styles.chipOn]}>
            <Text style={[styles.chipT, ap === a && styles.chipOnT]}>{a}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SlotsEditor({ slots, onChange, addLabel }: { slots: Slot[]; onChange: (s: Slot[]) => void; addLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (i: number, k: 'start' | 'end', v: string) => onChange(slots.map((s, j) => j === i ? { ...s, [k]: v } : s));
  return (
    <View style={{ gap: 8 }}>
      {slots.map((s, i) => (
        <View key={i} style={{ gap: 6 }}>
          <View style={styles.slotRow}>
            <Pressable style={styles.timeField} onPress={() => setOpen(open === `${i}-s` ? null : `${i}-s`)}>
              <Text style={styles.timeFieldT}>{s.start || '--:--'}</Text>
            </Pressable>
            <Text style={{ color: colors.gray400, fontWeight: '800' }}>–</Text>
            <Pressable style={styles.timeField} onPress={() => setOpen(open === `${i}-e` ? null : `${i}-e`)}>
              <Text style={styles.timeFieldT}>{s.end || '--:--'}</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => onChange(slots.filter((_, j) => j !== i))}>
              <Ionicons name="trash-outline" size={18} color={colors.red600} />
            </Pressable>
          </View>
          {open === `${i}-s` && <TimePicker value={s.start || '9:00 AM'} onChange={v => set(i, 'start', v)} />}
          {open === `${i}-e` && <TimePicker value={s.end || '10:00 AM'} onChange={v => set(i, 'end', v)} />}
        </View>
      ))}
      <Pressable onPress={() => onChange([...slots, { start: '9:00 AM', end: '10:00 AM' }])} style={styles.addLink}>
        <Ionicons name="add" size={16} color={M} />
        <Text style={styles.addLinkT}>{addLabel}</Text>
      </Pressable>
    </View>
  );
}

export default function PriestAvailability({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [av, setAv] = useState<Availability | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [viewMode, setViewMode] = useState<'inperson' | 'epuja'>('epuja');

  const [editDay, setEditDay] = useState<DayKey | null>(null);
  const [editOff, setEditOff] = useState(false);
  const [editSlots, setEditSlots] = useState<Slot[]>([]);
  const [editMode, setEditMode] = useState<Mode>('both');
  const [showBuffer, setShowBuffer] = useState(false);
  const [buffer, setBuffer] = useState('0');

  const [ovOpen, setOvOpen] = useState(false);
  const [ovDate, setOvDate] = useState<string | null>(null);
  const [ovAvail, setOvAvail] = useState(true);
  const [ovSlots, setOvSlots] = useState<Slot[]>([]);

  const load = useCallback(async () => {
    const r = await apiFetch('/priest/availability', {}, token);
    const d = await r.json();
    setAv(d.availability); setOverrides(d.overrides || []);
  }, [token]);
  useEffect(() => { (async () => { try { await load(); } catch { setErr('Could not load.'); } finally { setLoading(false); } })(); }, [load]);

  const weeklyKey = useMemo<'weekly' | 'weekly_inperson' | 'weekly_epuja'>(() => {
    if (!av || av.same_availability) return 'weekly';
    return viewMode === 'inperson' ? 'weekly_inperson' : 'weekly_epuja';
  }, [av, viewMode]);
  const weekly = av ? av[weeklyKey] : null;

  const patchModes = async (body: any) => {
    setBusy(true); setErr('');
    try {
      const r = await apiFetch('/priest/availability', { method: 'PATCH', body: JSON.stringify(body) }, token);
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).detail || 'Could not save.'); return; }
      setAv((await r.json()).availability);
    } finally { setBusy(false); }
  };

  const openEditDay = (day: DayKey) => {
    const wd = weekly?.[day] || { off: false, unavailable: [] };
    setEditDay(day);
    setEditMode(av?.same_availability ? 'both' : viewMode);
    setEditOff(wd.off);
    setEditSlots(JSON.parse(JSON.stringify(wd.unavailable || [])));
    setBuffer(String(av?.buffer_minutes || 0));
    setShowBuffer((av?.buffer_minutes || 0) > 0);
  };
  const saveDay = async () => {
    if (!editDay) return;
    setBusy(true); setErr('');
    try {
      const r = await apiFetch(`/priest/availability/weekly/${editDay}`, {
        method: 'PUT',
        body: JSON.stringify({
          mode: editMode, off: editOff, unavailable: editOff ? [] : editSlots,
          buffer_minutes: showBuffer ? Math.max(0, parseInt(buffer || '0', 10) || 0) : 0,
        }),
      }, token);
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).detail || 'Could not save.'); return; }
      setAv((await r.json()).availability);
      setEditDay(null);
    } finally { setBusy(false); }
  };

  const openOverride = (date?: string) => {
    const ex = date ? overrides.find(o => o.date === date) : undefined;
    setOvDate(date || null);
    setOvAvail(ex ? ex.available : true);
    setOvSlots(ex ? JSON.parse(JSON.stringify(ex.slots)) : []);
    setOvOpen(true);
  };
  const saveOverride = async () => {
    if (!ovDate) { setErr(t('avail.pickDate')); return; }
    setBusy(true); setErr('');
    try {
      const r = await apiFetch(`/priest/availability/overrides/${ovDate}`, {
        method: 'PUT', body: JSON.stringify({ available: ovAvail, slots: ovAvail ? ovSlots : [] }),
      }, token);
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).detail || 'Could not save.'); return; }
      await load(); setOvOpen(false);
    } finally { setBusy(false); }
  };
  const deleteOverride = async (date: string) => {
    setBusy(true);
    try { await apiFetch(`/priest/availability/overrides/${date}`, { method: 'DELETE' }, token); await load(); }
    finally { setBusy(false); }
  };

  // Header chrome — a plain element (NOT a component) so it never remounts
  // on re-render. Red bar (no back button) as a dashboard tab, or the
  // original back-arrow header when opened as its own route.
  // When embedded as a dashboard tab, the dashboard renders the shared red
  // header (avatar / name / badge) above this — so we render no header here.
  const chromeHeader = embedded ? null : (
    <SafeAreaView edges={['top']}>
      <Head t={t} onBack={() => router.back()} />
    </SafeAreaView>
  );

  if (loading || !av) {
    return (
      <View style={styles.root}>
        {chromeHeader}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={M} /></View>
      </View>
    );
  }

  const marks: Record<string, 'custom' | 'na'> = {};
  overrides.forEach(o => { marks[o.date] = o.available ? 'custom' : 'na'; });

  return (
    <View style={styles.root} testID="priest-availability">
      {chromeHeader}
      <ScrollView contentContainerStyle={{ paddingBottom: embedded ? 120 : 40 }} showsVerticalScrollIndicator={false}>
        {embedded ? <DeityHero image={SHIVA_HERO} shloka={t('avail.shivaSloka')} aspectRatio={4 / 5} /> : null}
        <View style={{ padding: 16 }}>
        {err ? <Text style={styles.err}>{err}</Text> : null}

        <View style={styles.priestRow}>
          <Avatar photoUrl={user?.photo_url} role="priest" size={44} ringColor={colors.gray100} />
          <Text style={styles.priestName}>{user?.name}</Text>
        </View>

        {/* Service Modes — pause toggles */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('avail.serviceModes')}</Text>
          <Text style={styles.cardSub}>{t('avail.serviceModesSub')}</Text>
          <View style={styles.modeRow}>
            <View style={[styles.modeIcon, { backgroundColor: '#FDECEC' }]}><Ionicons name="business" size={18} color={M} /></View>
            <Text style={styles.modeName}>{t('avail.pauseOffline')}</Text>
            <Switch value={av.offline_paused} disabled={busy} onValueChange={v => patchModes({ offline_paused: v })} trackColor={{ true: M }} />
          </View>
          <View style={styles.modeRow}>
            <View style={[styles.modeIcon, { backgroundColor: '#EEF2FF' }]}><Ionicons name="videocam" size={18} color="#4F46E5" /></View>
            <Text style={styles.modeName}>{t('avail.pauseEpuja')}</Text>
            <Switch value={av.epuja_paused} disabled={busy} onValueChange={v => patchModes({ epuja_paused: v })} trackColor={{ true: M }} />
          </View>
        </View>

        {/* Same availability toggle */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('avail.useSame')}</Text>
              <Text style={styles.cardSub}>{t('avail.useSameSub')}</Text>
            </View>
            <Switch value={av.same_availability} disabled={busy} onValueChange={v => patchModes({ same_availability: v })} trackColor={{ true: M }} />
          </View>
        </View>

        {/* mode toggle when different */}
        {!av.same_availability && (
          <View style={styles.segment}>
            {(['inperson', 'epuja'] as const).map(mm => (
              <Pressable key={mm} onPress={() => setViewMode(mm)} style={[styles.segBtn, viewMode === mm && styles.segBtnOn]}>
                <Text style={[styles.segT, viewMode === mm && styles.segTOn]}>{mm === 'inperson' ? t('avail.inperson') : t('avail.epuja')}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Weekly unavailability */}
        <Text style={[styles.cardTitle, { marginTop: 6 }]}>{t('avail.weekly')}</Text>
        <Text style={styles.cardSub}>{t('avail.weeklySub')}</Text>
        <View style={styles.card}>
          {DKEYS.map((d, i) => {
            const wd = weekly![d] || { off: false, unavailable: [] };
            return (
              <View key={d} style={[styles.dayRow, i < 6 && styles.dayRowBorder]}>
                <Text style={styles.dayName}>{dayLabel(i)}</Text>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {wd.off
                    ? <Text style={styles.naText}>{t('avail.unavailableAllDay')}</Text>
                    : wd.unavailable.length === 0
                      ? <Text style={styles.okText}>{t('avail.availableAllDay')}</Text>
                      : wd.unavailable.map((s, j) => <Text key={j} style={styles.naPill}>{s.start} – {s.end}</Text>)}
                </View>
                <Pressable hitSlop={8} onPress={() => openEditDay(d)}><Ionicons name="create-outline" size={18} color={colors.gray500} /></Pressable>
              </View>
            );
          })}
        </View>

        <Pressable onPress={() => openOverride()} style={styles.bigBtn}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.bigBtnT}>{t('avail.overrideDate')}</Text>
        </Pressable>

        {overrides.length > 0 && (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={styles.cardTitle}>{t('avail.overridesList')}</Text>
            {overrides.map(o => (
              <View key={o.id} style={styles.ovRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ovDate}>{o.date}</Text>
                  <Text style={o.available ? styles.ovOk : styles.naText}>
                    {o.available ? (o.slots.map(s => `${s.start}–${s.end}`).join(', ') || t('avail.available')) : t('avail.notAvailable')}
                  </Text>
                </View>
                <Pressable hitSlop={6} onPress={() => openOverride(o.date)}><Ionicons name="create-outline" size={17} color={colors.gray500} /></Pressable>
                <Pressable hitSlop={6} onPress={() => deleteOverride(o.date)}><Ionicons name="trash-outline" size={16} color={colors.red600} /></Pressable>
              </View>
            ))}
          </View>
        )}
        </View>
      </ScrollView>

      {/* ---- Set Unavailable Times ---- */}
      <Modal visible={editDay !== null} animationType="slide" onRequestClose={() => setEditDay(null)}>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <View style={styles.headerBar}>
            <Pressable onPress={() => setEditDay(null)} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={M} /></Pressable>
            <Text style={styles.headerTitle}>{t('avail.editDefault')}</Text>
            <Pressable onPress={saveDay} disabled={busy}><Text style={[styles.saveLink, busy && { opacity: 0.5 }]}>{t('avail.save')}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {err ? <Text style={styles.err}>{err}</Text> : null}
            <Text style={styles.label}>{t('avail.selectDay')}</Text>
            <View style={styles.chipRow}>
              {DKEYS.map((d, i) => (
                <Pressable key={d} onPress={() => {
                  const wd = weekly?.[d] || { off: false, unavailable: [] };
                  setEditDay(d); setEditOff(wd.off); setEditSlots(JSON.parse(JSON.stringify(wd.unavailable || [])));
                }} style={[styles.dayChip, editDay === d && styles.chipOn]}>
                  <Text style={[styles.chipT, editDay === d && styles.chipOnT]}>{dayLabel(i)}</Text>
                </Pressable>
              ))}
            </View>

            {!av.same_availability && (
              <>
                <Text style={styles.label}>{t('avail.applyTo')}</Text>
                <View style={styles.chipRow}>
                  {(['both', 'inperson', 'epuja'] as const).map(mm => (
                    <Pressable key={mm} onPress={() => setEditMode(mm)} style={[styles.chip, editMode === mm && styles.chipOn]}>
                      <Text style={[styles.chipT, editMode === mm && styles.chipOnT]}>
                        {mm === 'both' ? t('avail.bothModes') : mm === 'inperson' ? t('avail.inperson') : t('avail.epuja')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <View style={styles.offRow}>
              <Text style={styles.offLabel}>{t('avail.unavailableAllDay')}</Text>
              <Switch value={editOff} onValueChange={setEditOff} trackColor={{ true: M }} />
            </View>

            {!editOff && (
              <>
                <Text style={styles.label}>{t('avail.timeSlots')}</Text>
                <SlotsEditor slots={editSlots} onChange={setEditSlots} addLabel={t('avail.addSlot')} />

                <Pressable onPress={() => setShowBuffer(v => !v)} style={styles.breakRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.breakTitle}>{t('avail.breakGap')}</Text>
                    <Text style={styles.cardSub}>{t('avail.breakGapSub')}</Text>
                  </View>
                  <Ionicons name={showBuffer ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.gray400} />
                </Pressable>
                {showBuffer && (
                  <View style={styles.slotRow}>
                    <TextInput value={buffer} onChangeText={setBuffer} keyboardType="number-pad" maxLength={3}
                      style={styles.numInput} placeholder="15" placeholderTextColor={colors.gray400} />
                    <Text style={styles.cardSub}>{t('avail.minutes')}</Text>
                  </View>
                )}
              </>
            )}

            <Pressable onPress={saveDay} disabled={busy} style={[styles.bigBtn, { marginTop: 22 }, busy && { opacity: 0.6 }]}>
              <Text style={styles.bigBtnT}>{t('avail.save')}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ---- Override Date ---- */}
      <Modal visible={ovOpen} animationType="slide" onRequestClose={() => setOvOpen(false)}>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <View style={styles.headerBar}>
            <Pressable onPress={() => setOvOpen(false)} style={styles.backBtn}><Ionicons name="close" size={20} color={M} /></Pressable>
            <Text style={styles.headerTitle}>{t('avail.overrideTitle')}</Text>
            <Pressable onPress={saveOverride} disabled={busy}><Text style={[styles.saveLink, busy && { opacity: 0.5 }]}>{t('avail.save')}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {err ? <Text style={styles.err}>{err}</Text> : null}
            <Text style={styles.cardSub}>{t('avail.overrideSub')}</Text>
            <View style={{ height: 8 }} />
            <MiniCalendar mode="single" min={isoToday()} value={ovDate} marks={marks} onChange={(d: string) => setOvDate(d)} />
            {ovDate ? <Text style={styles.selDate}>{new Date(ovDate + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}</Text> : null}

            <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
              {[true, false].map(v => (
                <Pressable key={String(v)} onPress={() => setOvAvail(v)} style={styles.radioRow}>
                  <View style={[styles.radio, ovAvail === v && styles.radioOn]}>{ovAvail === v && <View style={styles.radioDot} />}</View>
                  <Text style={styles.radioT}>{v ? t('avail.available') : t('avail.notAvailable')}</Text>
                </Pressable>
              ))}
            </View>

            {ovAvail && (
              <>
                <Text style={styles.label}>{t('avail.overrideSlots')}</Text>
                <SlotsEditor slots={ovSlots} onChange={setOvSlots} addLabel={t('avail.addAvail')} />
              </>
            )}

            <Pressable onPress={saveOverride} disabled={busy} style={[styles.bigBtn, { marginTop: 22 }, busy && { opacity: 0.6 }]}>
              <Text style={styles.bigBtnT}>{t('avail.save')}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Head({ t, onBack }: { t: any; onBack: () => void }) {
  return (
    <View style={styles.headerBar}>
      <Pressable onPress={onBack} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={M} /></Pressable>
      <Text style={styles.headerTitle}>{t('avail.screenTitle')}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  redHead: { backgroundColor: colors.deepRed },
  redHeadInner: { minHeight: 72, justifyContent: 'center', paddingHorizontal: 20 },
  redHeadTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.gray100, backgroundColor: '#FFF' },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#FCEEEE', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  saveLink: { fontSize: 15, fontWeight: '800', color: M },

  err: { backgroundColor: colors.red50, color: colors.red600, fontSize: 12.5, padding: 10, borderRadius: 8, marginBottom: 10 },
  priestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  priestName: { fontSize: 16, fontWeight: '800', color: colors.navy },

  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.lg, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.navy },
  cardSub: { fontSize: 12, color: colors.gray500, marginTop: 2, lineHeight: 16 },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  modeIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  modeName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.gray800, lineHeight: 16 },

  segment: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: 4, gap: 4, marginBottom: 12 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segBtnOn: { backgroundColor: M },
  segT: { fontSize: 12, fontWeight: '800', color: colors.gray500 },
  segTOn: { color: '#FFF' },

  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dayRowBorder: { borderBottomWidth: 1, borderColor: colors.gray100 },
  dayName: { width: 38, fontSize: 12.5, fontWeight: '800', color: colors.navy },
  naPill: { fontSize: 11, fontWeight: '700', color: colors.red600, backgroundColor: '#FEECEC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  naText: { fontSize: 11.5, fontWeight: '800', color: colors.red600 },
  okText: { fontSize: 11.5, fontWeight: '800', color: '#16A34A' },

  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: M, paddingVertical: 15, borderRadius: radius.md, marginTop: 16 },
  bigBtnT: { color: '#FFF', fontSize: 15, fontWeight: '800' },

  ovRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, padding: 12 },
  ovDate: { fontSize: 13, fontWeight: '800', color: colors.navy },
  ovOk: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },

  label: { fontSize: 11, fontWeight: '800', color: colors.gray500, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.gray300, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFF' },
  dayChip: { borderWidth: 1, borderColor: colors.gray300, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#FFF' },
  tpChip: { borderWidth: 1, borderColor: colors.gray300, borderRadius: 14, width: 34, paddingVertical: 6, alignItems: 'center', backgroundColor: '#FFF' },
  chipOn: { backgroundColor: M, borderColor: M },
  chipT: { fontSize: 12, fontWeight: '700', color: colors.gray700 },
  tpChipT: { fontSize: 12, fontWeight: '800', color: colors.gray700 },
  chipOnT: { color: '#FFF' },

  offRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, padding: 14, marginTop: 16 },
  offLabel: { fontSize: 13.5, fontWeight: '800', color: colors.gray800 },

  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeField: { flex: 1, borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#FFF', alignItems: 'center' },
  timeFieldT: { fontSize: 14, fontWeight: '700', color: colors.gray800 },
  numInput: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#FFF', fontSize: 14, minWidth: 70, color: colors.gray800 },
  tpBox: { backgroundColor: '#FBFBFB', borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, padding: 10, gap: 8 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  addLinkT: { fontSize: 13, fontWeight: '800', color: M },

  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, padding: 14, marginTop: 16 },
  breakTitle: { fontSize: 13, fontWeight: '800', color: colors.gray800 },

  selDate: { fontSize: 13, fontWeight: '700', color: colors.gray700, marginTop: 10 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: M },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: M },
  radioT: { fontSize: 13, fontWeight: '700', color: colors.gray700 },
});
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import PoojaImage from '@/src/components/PoojaImage';
import MiniCalendar from '@/src/components/MiniCalendar';
import TimeField, { timeToMinutes } from '@/src/components/TimeField';
import MapPicker, { PickedPlace } from '@/src/components/MapPicker';
import { svcName } from '@/src/i18n/catalog';
import { fetchPanchangam, pick, type Panchangam, type Coords } from '@/src/lib/panchangam';

interface Pooja {
  id: string; name: string; sanskrit_name: string; duration: string;
  duration_minutes?: number; price: number; description: string;
}

const IST_OFFSET_MIN = 330;
const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isoPlus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// "YYYY-MM-DD" + "hh:mm AM" -> local Date
const combine = (iso: string, time: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  const mins = timeToMinutes(time);
  return new Date(y, (m || 1) - 1, d || 1, Math.floor(mins / 60), mins % 60, 0, 0);
};
const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/^0/, '');
const durLabel = (p: Pooja | null) => {
  if (!p) return '';
  if (p.duration && p.duration.trim()) return p.duration;
  const mm = p.duration_minutes || 0;
  if (!mm) return '';
  const h = Math.floor(mm / 60), rem = mm % 60;
  return h ? `${h}h${rem ? ` ${rem}m` : ''}` : `${rem}m`;
};

export default function BookingScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { token, user } = useAuth();
  const { poojaId } = useLocalSearchParams<{ poojaId: string }>();
  const lang = i18n.language;

  const [pooja, setPooja] = useState<Pooja | null>(null);
  const [date, setDate] = useState(isoToday());
  const [time, setTime] = useState('08:00 AM');

  // Devotee details — prefilled from profile, editable per booking.
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.mobile || '');
  const [gothram, setGothram] = useState(user?.gothram || '');
  const [place, setPlace] = useState(user?.address || '');
  const [venue, setVenue] = useState<{ latitude: number; longitude: number } | null>(
    user?.latitude != null && user?.longitude != null
      ? { latitude: user.latitude, longitude: user.longitude }
      : null,
  );
  const [notes, setNotes] = useState('');

  const [mapOpen, setMapOpen] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Panchangam for the selected date.
  const [panch, setPanch] = useState<Panchangam | null>(null);
  const [panchBusy, setPanchBusy] = useState(false);
  const [panchErr, setPanchErr] = useState(false);

  useEffect(() => {
    if (!poojaId) return;
    apiFetch('/poojas', {}, token).then(r => r.json()).then(list => {
      const found = (list as Pooja[]).find(p => p.id === poojaId);
      setPooja(found || null);
    });
  }, [poojaId, token]);

  // venue -> profile -> backend default (Hyderabad)
  const coords: Coords | null = useMemo(() => {
    if (venue) return { latitude: venue.latitude, longitude: venue.longitude, tzOffsetMin: IST_OFFSET_MIN };
    if (user?.latitude != null && user?.longitude != null)
      return { latitude: user.latitude, longitude: user.longitude, tzOffsetMin: IST_OFFSET_MIN };
    return null;
  }, [venue, user?.latitude, user?.longitude]);

  useEffect(() => {
    let alive = true;
    setPanchBusy(true); setPanchErr(false);
    fetchPanchangam(date, coords)
      .then(p => { if (alive) setPanch(p); })
      .catch(() => { if (alive) { setPanch(null); setPanchErr(true); } })
      .finally(() => { if (alive) setPanchBusy(false); });
    return () => { alive = false; };
  }, [date, coords]);

  const onPickMap = (p: PickedPlace) => {
    setVenue({ latitude: p.latitude, longitude: p.longitude });
    if (p.address) setPlace(p.address);
  };

  const useCurrentLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('profileEdit.locationDenied')); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setVenue({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const rev = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const r = rev?.[0];
      if (r) setPlace([r.name, r.street, r.district, r.city, r.region, r.postalCode].filter(Boolean).join(', '));
    } catch { Alert.alert(t('profileEdit.locationFailed')); }
    finally { setLocBusy(false); }
  };

  const startAt = useMemo(() => combine(date, time), [date, time]);
  const endAt = useMemo(
    () => new Date(startAt.getTime() + (pooja?.duration_minutes || 0) * 60000),
    [startAt, pooja?.duration_minutes],
  );

  const submit = async () => {
    if (!poojaId) return setError(t('book.failed'));
    if (!name.trim()) return setError(t('devoteeReg.errName'));
    if (!phone.trim()) return setError(t('devoteeReg.errMobile'));
    if (!gothram.trim()) return setError(t('book.errGothram'));
    if (!place.trim()) return setError(t('book.errPlace'));
    if (!date.trim()) return setError(t('book.errDate'));
    if (!time.trim()) return setError(t('book.errTime'));
    setError(''); setBusy(true);
    try {
      const res = await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          pooja_id: poojaId, booking_date: date, booking_time: time,
          sankalp_name: name.trim(), gothram: gothram.trim(), place: place.trim(),
          contact_mobile: phone.trim(), notes: notes.trim(),
          latitude: venue?.latitude ?? null, longitude: venue?.longitude ?? null,
        }),
      }, token);
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      const booking = await res.json();
      router.replace(`/(devotee)/booking-confirmation/${booking.id}`);
    } catch (e: any) { setError(e.message || t('book.failed')); } finally { setBusy(false); }
  };

  const g = panch?.general;
  const k = panch?.kalas;

  return (
    <View style={styles.root} testID="booking-screen">
      <SafeAreaView edges={['top']}>
        <View style={styles.headerBar}>
          <Pressable testID="btn-book-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.darkRed} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('book.header')}</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {pooja && (
            <PoojaImage id={pooja.id} name={pooja.name} height={150} radius={radius.lg}>
              <Text style={styles.poojaSanskrit}>{pooja.sanskrit_name}</Text>
              <Text style={styles.poojaName}>{svcName(t, pooja.name)}</Text>
              <Text style={styles.poojaDesc} numberOfLines={2}>{pooja.description}</Text>
              <View style={styles.poojaMetaRow}>
                <Ionicons name="time-outline" size={13} color={colors.gold} />
                <Text style={styles.poojaMeta}>{durLabel(pooja)}  •  ₹{pooja.price}</Text>
              </View>
            </PoojaImage>
          )}

          {error ? <Text style={styles.error} testID="book-error">{error}</Text> : null}

          {/* ---- Your details ---- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('book.yourDetails')}</Text>

            <Field label={t('book.name')}>
              <TextInput testID="input-name" value={name} onChangeText={setName} placeholder={t('book.namePlaceholder')} style={styles.input} placeholderTextColor={colors.gray400} />
            </Field>
            <Field label={t('book.phone')}>
              <TextInput testID="input-phone" value={phone} onChangeText={setPhone} placeholder={t('devoteeReg.mobilePlaceholder')} keyboardType="phone-pad" style={styles.input} placeholderTextColor={colors.gray400} />
            </Field>
            <Field label={t('book.gothram')}>
              <TextInput testID="input-gothram" value={gothram} onChangeText={setGothram} placeholder={t('book.gothramPlaceholder')} style={styles.input} placeholderTextColor={colors.gray400} />
            </Field>
            <Field label={t('book.place')}>
              <TextInput testID="input-place" value={place} onChangeText={setPlace} placeholder={t('book.placePlaceholder')} multiline style={[styles.input, { minHeight: 58, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} />
              <View style={styles.addrBtns}>
                <Pressable onPress={() => setMapOpen(true)} style={styles.addrBtn} testID="btn-pick-map">
                  <Ionicons name="map" size={13} color={colors.orange} />
                  <Text style={styles.addrBtnText}>{t('book.pickOnMap')}</Text>
                </Pressable>
                <Pressable onPress={useCurrentLocation} disabled={locBusy} style={styles.addrBtn} testID="btn-use-location">
                  {locBusy ? <ActivityIndicator size="small" color={colors.orange} /> : <Ionicons name="locate" size={13} color={colors.orange} />}
                  <Text style={styles.addrBtnText}>{t('register.useLocation')}</Text>
                </Pressable>
              </View>
              {venue && <Text style={styles.coord}>📍 {venue.latitude.toFixed(4)}, {venue.longitude.toFixed(4)}</Text>}
            </Field>
          </View>

          {/* ---- Date ---- */}
          <View>
            <Text style={styles.label}>{t('book.selectDate')}</Text>
            <MiniCalendar mode="single" value={date} onChange={(v: string) => setDate(v)} min={isoToday()} max={isoPlus(120)} />
            <Text style={styles.selectedDate}>{fmtDate(combine(date, '12:00 PM'))}</Text>
          </View>

          {/* ---- Panchangam for selected date (between date & time) ---- */}
          <View style={styles.panchCard} testID="panchangam-panel">
            <View style={styles.panchHead}>
              <Ionicons name="planet-outline" size={15} color={colors.amber700} />
              <Text style={styles.panchTitle}>{t('book.panchangamFor')}</Text>
              {panchBusy && <ActivityIndicator size="small" color={colors.amber700} style={{ marginLeft: 'auto' }} />}
            </View>

            {panchErr ? (
              <Text style={styles.panchErr}>{t('book.panchangamError')}</Text>
            ) : (
              <>
                <View style={styles.panchList}>
                  <PRow label={t('panchangam.tithi')} value={g ? pick(g.tithi, lang) : '—'} />
                  <PRow label={t('panchangam.varam')} value={g ? pick(g.varam || g.vara, lang) : '—'} />
                  <PRow label={t('panchangam.nakshatra')} value={g ? pick(g.nakshatra, lang) : '—'} last />
                </View>
                <Text style={styles.inauspHead}>{t('book.inauspicious')}</Text>
                <View style={styles.panchList}>
                  <PRow label={t('book.rahuKalam')} value={k?.rahukalam || '—'} warn />
                  <PRow label={t('book.gulikaKalam')} value={k?.gulika || '—'} warn />
                  <PRow label={t('book.durmuhurtham')} value={k?.durmuhurta || '—'} warn />
                  <PRow label={t('book.varjyam')} value={k?.varjyam || '—'} warn last />
                </View>
              </>
            )}
          </View>

          {/* ---- Time ---- */}
          <View>
            <Text style={styles.label}>{t('book.selectTime')}</Text>
            <TimeField value={time} onChange={setTime} />
            <View style={styles.timingBox} testID="pooja-timing">
              <Text style={styles.timingRow}>
                <Text style={styles.timingKey}>{t('book.starts')}: </Text>{fmtDate(startAt)} · {fmtTime(startAt)}
              </Text>
              <Text style={styles.timingRow}>
                <Text style={styles.timingKey}>{t('book.ends')}: </Text>
                {pooja?.duration_minutes ? `${fmtDate(endAt)} · ${fmtTime(endAt)}` : '—'}
                {pooja ? <Text style={styles.timingDur}>  ({durLabel(pooja)})</Text> : null}
              </Text>
            </View>
          </View>

          {/* ---- Notes ---- */}
          <View>
            <Text style={styles.label}>{t('book.notes')}</Text>
            <TextInput testID="input-notes" value={notes} onChangeText={setNotes} placeholder={t('book.notesPlaceholder')} style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} multiline />
          </View>

          <Pressable testID="btn-submit-booking" onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{busy ? t('book.submitting') : t('book.submit')}</Text>
          </Pressable>
          <Text style={styles.hint}>{t('book.hint')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <MapPicker
        visible={mapOpen}
        initial={venue}
        onClose={() => setMapOpen(false)}
        onPick={onPickMap}
      />
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PRow({ label, value, warn, last }: { label: string; value: string; warn?: boolean; last?: boolean }) {
  return (
    <View style={[styles.pRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.pRowLabel}>{label}</Text>
      <Text style={[styles.pRowValue, warn && { color: colors.red600 }]}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: colors.gray100 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  poojaSanskrit: { color: colors.goldLight, fontSize: 11, fontWeight: '700' },
  poojaName: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 4 },
  poojaDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4, lineHeight: 16 },
  poojaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  poojaMeta: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, textAlign: 'center', fontSize: 13, borderWidth: 1, borderColor: colors.red100 },

  label: { fontSize: 12, color: colors.gray500, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFF', fontSize: 14, color: colors.gray800 },

  card: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.gray100 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.navy },
  fieldLabel: { fontSize: 12, color: colors.gray600, fontWeight: '700', marginBottom: 6 },
  addrBtns: { flexDirection: 'row', gap: 16, marginTop: 8 },
  addrBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  addrBtnText: { fontSize: 12, color: colors.orange, fontWeight: '800' },
  coord: { fontSize: 11, color: colors.gray500, marginTop: 6 },

  selectedDate: { fontSize: 12, fontWeight: '800', color: colors.orange, marginTop: 8, textAlign: 'center' },

  panchCard: { backgroundColor: '#FFFBEB', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.amber100, gap: 8 },
  panchHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  panchTitle: { fontSize: 13, fontWeight: '800', color: colors.amber800 },
  panchErr: { fontSize: 12, color: colors.gray500 },
  inauspHead: { fontSize: 10, fontWeight: '800', color: colors.gray500, letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' },
  panchList: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, paddingHorizontal: 12 },
  pRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  pRowLabel: { fontSize: 12.5, color: colors.gray500, fontWeight: '600' },
  pRowValue: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.gray800, textAlign: 'right' },

  timingBox: { backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: 12, marginTop: 10, gap: 4 },
  timingRow: { fontSize: 12.5, color: colors.gray700 },
  timingKey: { fontWeight: '800', color: colors.navy },
  timingDur: { color: colors.gray400, fontSize: 11.5, fontWeight: '700' },

  cta: { backgroundColor: colors.orange, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center' },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 11, color: colors.gray500, textAlign: 'center', lineHeight: 16 },
});

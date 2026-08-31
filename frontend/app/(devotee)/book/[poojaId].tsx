import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import PoojaImage from '@/src/components/PoojaImage';

interface Pooja { id: string; name: string; sanskrit_name: string; duration: string; price: number; description: string; }

const TIMES = ['06:00 AM', '08:00 AM', '10:30 AM', '12:00 PM', '04:00 PM', '06:30 PM'];

// Generate next 14 days
function nextDays(n = 14): { value: string; label: string }[] {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    out.push({ value: iso, label });
  }
  return out;
}

export default function BookingScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { poojaId } = useLocalSearchParams<{ poojaId: string }>();
  const [pooja, setPooja] = useState<Pooja | null>(null);
  const [date, setDate] = useState(nextDays(1)[0].value);
  const [time, setTime] = useState('08:00 AM');
  const [sankalp, setSankalp] = useState(user?.name || '');
  const [gothram, setGothram] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const days = nextDays(14);

  useEffect(() => {
    if (!poojaId) return;
    apiFetch('/poojas', {}, token).then(r => r.json()).then(list => {
      const found = (list as Pooja[]).find(p => p.id === poojaId);
      setPooja(found || null);
    });
  }, [poojaId, token]);

  const submit = async () => {
    if (!poojaId) return setError('Missing pooja');
    if (!date.trim()) return setError('Please select a date');
    if (!time.trim()) return setError('Please select a time');
    if (!sankalp.trim()) return setError('Please enter Sankalp name');
    if (!gothram.trim()) return setError('Please enter Gothram');
    if (!place.trim()) return setError('Please enter the place / address');
    setError(''); setBusy(true);
    try {
      const res = await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          pooja_id: poojaId, booking_date: date, booking_time: time,
          sankalp_name: sankalp, gothram, place, notes,
        }),
      }, token);
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      const booking = await res.json();
      router.replace(`/(devotee)/booking-confirmation/${booking.id}`);
    } catch (e: any) { setError(e.message || 'Booking failed'); } finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="booking-screen">
      <SafeAreaView edges={['top']}>
        <View style={styles.headerBar}>
          <Pressable testID="btn-book-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.darkRed} />
          </Pressable>
          <Text style={styles.headerTitle}>Book Pooja</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {pooja && (
            <PoojaImage id={pooja.id} name={pooja.name} height={150} radius={radius.lg}>
              <Text style={styles.poojaSanskrit}>{pooja.sanskrit_name}</Text>
              <Text style={styles.poojaName}>{pooja.name}</Text>
              <Text style={styles.poojaDesc} numberOfLines={2}>{pooja.description}</Text>
              <Text style={styles.poojaMeta}>{pooja.duration} • ₹{pooja.price}</Text>
            </PoojaImage>
          )}

          {error ? <Text style={styles.error} testID="book-error">{error}</Text> : null}

          <View>
            <Text style={styles.label}>Select Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {days.map(d => (
                <Pressable key={d.value} testID={`pick-date-${d.value}`} onPress={() => setDate(d.value)} style={[styles.dateChip, date === d.value && styles.dateChipOn]}>
                  <Text style={[styles.dateChipText, date === d.value && styles.dateChipTextOn]}>{d.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View>
            <Text style={styles.label}>Select Time (Muhurtham)</Text>
            <View style={styles.timeGrid}>
              {TIMES.map(t => (
                <Pressable key={t} testID={`pick-time-${t}`} onPress={() => setTime(t)} style={[styles.timeBtn, time === t && styles.timeBtnOn]}>
                  <Text style={[styles.timeText, time === t && styles.timeTextOn]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View><Text style={styles.label}>Sankalp Name</Text>
            <TextInput testID="input-sankalp" value={sankalp} onChangeText={setSankalp} placeholder="Devotee name for sankalp" style={styles.input} placeholderTextColor={colors.gray400} /></View>
          <View><Text style={styles.label}>Gothram</Text>
            <TextInput testID="input-gothram" value={gothram} onChangeText={setGothram} placeholder="e.g. Bharadwaja" style={styles.input} placeholderTextColor={colors.gray400} /></View>
          <View><Text style={styles.label}>Place / Address</Text>
            <TextInput testID="input-place" value={place} onChangeText={setPlace} placeholder="Full address where the pooja will be performed" style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} multiline /></View>
          <View><Text style={styles.label}>Additional Notes (optional)</Text>
            <TextInput testID="input-notes" value={notes} onChangeText={setNotes} placeholder="Any special requests" style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} multiline /></View>

          <Pressable testID="btn-submit-booking" onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{busy ? 'Submitting...' : 'Book Pooja'}</Text>
          </Pressable>
          <Text style={styles.hint}>The booking will be delivered to all eligible priests. First to accept becomes your assigned Yagnika.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
  poojaMeta: { color: colors.gold, fontSize: 13, fontWeight: '800', marginTop: 8 },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, textAlign: 'center', fontSize: 13, borderWidth: 1, borderColor: colors.red100 },
  label: { fontSize: 12, color: colors.gray500, fontWeight: '700', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFF', fontSize: 14, color: colors.gray800 },
  dateChip: { flexShrink: 0, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.gray200, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  dateChipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  dateChipText: { fontSize: 12, fontWeight: '700', color: colors.gray700 },
  dateChipTextOn: { color: '#FFF' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray200, backgroundColor: '#FFF' },
  timeBtnOn: { backgroundColor: '#FEF3C7', borderColor: colors.orange },
  timeText: { fontSize: 12, fontWeight: '600', color: colors.gray600 },
  timeTextOn: { color: colors.orange, fontWeight: '800' },
  cta: { backgroundColor: colors.orange, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center' },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 11, color: colors.gray500, textAlign: 'center', lineHeight: 16 },
});

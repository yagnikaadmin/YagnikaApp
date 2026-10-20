import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme';

// Dependency-free 12-hour time selector. Emits "hh:mm AM" / "hh:mm PM"
// (zero-padded hour + minute) to match the backend's "%I:%M %p" parser.
const STEP = 5;

export function parseTime(v: string): { h: number; m: number; ap: 'AM' | 'PM' } {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((v || '').trim());
  if (!m) return { h: 8, m: 0, ap: 'AM' };
  let hh = Math.min(12, Math.max(1, parseInt(m[1], 10)));
  let mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  mm = Math.round(mm / STEP) * STEP % 60;
  return { h: hh, m: mm, ap: (m[3].toUpperCase() as 'AM' | 'PM') };
}

export function formatTime(h: number, m: number, ap: 'AM' | 'PM'): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}

// "hh:mm AM" -> minutes from midnight (0..1439)
export function timeToMinutes(v: string): number {
  const { h, m, ap } = parseTime(v);
  const h24 = ap === 'AM' ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
  return h24 * 60 + m;
}

// minutes from midnight (wrapped into 0..1439) -> "hh:mm AM"; inverse of timeToMinutes
export function minutesToTime(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60);
  return formatTime(h24 % 12 === 0 ? 12 : h24 % 12, t % 60, h24 < 12 ? 'AM' : 'PM');
}

export default function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { h, m, ap } = parseTime(value);
  const set = (nh: number, nm: number, nap: 'AM' | 'PM') => onChange(formatTime(nh, nm, nap));

  // Step on a 24-hour clock so 11 AM -> 12 PM (not 12 AM), like a real clock.
  const bumpH = (d: number) => onChange(minutesToTime(timeToMinutes(value) + d * 60));
  const bumpM = (d: number) => onChange(minutesToTime(timeToMinutes(value) + d * STEP));

  return (
    <View style={styles.row}>
      <Stepper value={String(h).padStart(2, '0')} onUp={() => bumpH(1)} onDown={() => bumpH(-1)} testID="time-hour" />
      <Text style={styles.colon}>:</Text>
      <Stepper value={String(m).padStart(2, '0')} onUp={() => bumpM(1)} onDown={() => bumpM(-1)} testID="time-minute" />
      <View style={styles.apWrap}>
        {(['AM', 'PM'] as const).map(x => (
          <Pressable key={x} onPress={() => set(h, m, x)} style={[styles.apBtn, ap === x && styles.apBtnOn]} testID={`time-${x}`}>
            <Text style={[styles.apText, ap === x && styles.apTextOn]}>{x}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Stepper({ value, onUp, onDown, testID }: { value: string; onUp: () => void; onDown: () => void; testID?: string }) {
  return (
    <View style={styles.stepper} testID={testID}>
      <Pressable onPress={onUp} style={styles.chev} hitSlop={8}><Ionicons name="chevron-up" size={18} color={colors.gray500} /></Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={onDown} style={styles.chev} hitSlop={8}><Ionicons name="chevron-down" size={18} color={colors.gray500} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: { alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: 14, minWidth: 58 },
  chev: { paddingVertical: 2 },
  stepVal: { fontSize: 20, fontWeight: '800', color: colors.gray800, marginVertical: 2 },
  colon: { fontSize: 20, fontWeight: '800', color: colors.gray500 },
  apWrap: { marginLeft: 6, gap: 6 },
  apBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.gray200, backgroundColor: '#FFF' },
  apBtnOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  apText: { fontSize: 12, fontWeight: '800', color: colors.gray600 },
  apTextOn: { color: '#FFF' },
});

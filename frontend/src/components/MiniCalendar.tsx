import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s?: string | null) => (s ? new Date(s + 'T00:00:00') : null);
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface CalRange { start: string | null; end: string | null }

// Lightweight month-grid date picker (no native dependency).
// mode "single": value is a YYYY-MM-DD string. mode "range": value is {start,end}.
export default function MiniCalendar({
  mode, value, onChange, min, max, marks,
}: {
  mode: 'single' | 'range';
  value: string | CalRange | null;
  onChange: (v: any) => void;
  min?: string;            // earliest selectable YYYY-MM-DD
  max?: string;            // latest selectable
  marks?: Record<string, 'open' | 'booked' | 'custom' | 'na'>;  // small dot under a date
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const anchor = mode === 'single'
    ? (parse(value as string) || today)
    : (parse((value as CalRange)?.start) || today);
  const [view, setView] = useState(new Date(anchor.getFullYear(), anchor.getMonth(), 1));

  const minD = parse(min) || null;
  const maxD = parse(max) || null;
  const range = mode === 'range' ? (value as CalRange || { start: null, end: null }) : null;
  const single = mode === 'single' ? (value as string || null) : null;

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view]);

  const disabled = (d: Date) => (minD && d < minD) || (maxD && d > maxD);
  const inRange = (d: Date) => {
    if (!range?.start || !range?.end) return false;
    const s = parse(range.start)!, e = parse(range.end)!;
    return d > s && d < e;
  };
  const isEdge = (d: Date) => {
    const k = iso(d);
    if (single) return k === single;
    return k === range?.start || k === range?.end;
  };

  const pick = (d: Date) => {
    if (disabled(d)) return;
    const k = iso(d);
    if (mode === 'single') { onChange(k); return; }
    if (!range?.start || (range.start && range.end)) { onChange({ start: k, end: null }); return; }
    // second click completes the range (swap if before start)
    if (parse(k)! < parse(range.start)!) onChange({ start: k, end: range.start });
    else onChange({ start: range.start, end: k });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable hitSlop={8} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}>
          <Ionicons name="chevron-back" size={20} color={colors.darkRed} />
        </Pressable>
        <Text style={styles.title}>{view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Pressable hitSlop={8} onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}>
          <Ionicons name="chevron-forward" size={20} color={colors.darkRed} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {DOW.map((d, i) => <Text key={i} style={styles.dow}>{d}</Text>)}
      </View>
      {Array.from({ length: 6 }, (_, w) => (
        <View key={w} style={styles.row}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            const other = d.getMonth() !== view.getMonth();
            const dis = disabled(d);
            const edge = isEdge(d);
            const mid = inRange(d);
            const mark = marks?.[iso(d)];
            return (
              <Pressable key={i} onPress={() => pick(d)} style={[styles.cell, mid && styles.cellMid]}>
                <View style={[styles.day, edge && styles.dayOn]}>
                  <Text style={[styles.dayText, other && styles.dayOther, dis && styles.dayDis, edge && styles.dayTextOn]}>
                    {d.getDate()}
                  </Text>
                </View>
                {mark ? <View style={[styles.dot, mark === 'booked' ? styles.dotBooked : mark === 'custom' ? styles.dotCustom : mark === 'na' ? styles.dotNa : styles.dotOpen]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.gray200, borderRadius: 14, padding: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 8 },
  title: { fontSize: 14, fontWeight: '800', color: colors.navy },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: colors.gray400, paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellMid: { backgroundColor: '#FFF1E6' },
  day: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.orange },
  dayText: { fontSize: 12.5, fontWeight: '700', color: colors.gray800 },
  dayTextOn: { color: '#FFF' },
  dayOther: { color: colors.gray300 },
  dayDis: { color: colors.gray200 },
  dot: { width: 5, height: 5, borderRadius: 3, position: 'absolute', bottom: 3 },
  dotOpen: { backgroundColor: '#16A34A' },
  dotBooked: { backgroundColor: '#2563EB' },
  dotCustom: { backgroundColor: '#7C3AED' },
  dotNa: { backgroundColor: '#DC2626' },
});

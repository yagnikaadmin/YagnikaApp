import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/src/theme';

const OPTIONS: { key: 'mr' | 'mrs'; label: string }[] = [
  { key: 'mr', label: 'Mr.' },
  { key: 'mrs', label: 'Mrs.' },
];

export default function TitlePicker({ value, onChange, testIDPrefix = 'title' }: { value?: string | null; onChange: (v: 'mr' | 'mrs') => void; testIDPrefix?: string }) {
  return (
    <View style={styles.row}>
      {OPTIONS.map(o => {
        const on = value === o.key;
        return (
          <Pressable key={o.key} testID={`${testIDPrefix}-${o.key}`} onPress={() => onChange(o.key)} style={[styles.opt, on && styles.optOn]}>
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray200, backgroundColor: '#FBFBFB' },
  optOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  label: { fontSize: 14, fontWeight: '700', color: colors.gray600 },
  labelOn: { color: '#FFF' },
});

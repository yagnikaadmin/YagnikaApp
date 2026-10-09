import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { SUPPORTED_LANGUAGES, setLanguage, LangCode } from '@/src/i18n';

// A compact language toggle. Renders as a small pill; tapping opens a
// sheet with all six languages. Works anywhere in the app.
export default function LanguagePicker({ tint = colors.gray600, compact = false }: { tint?: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const pick = async (code: LangCode) => {
    await setLanguage(code);
    setOpen(false);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.pill, { borderColor: tint }]} testID="btn-language">
        <Ionicons name="language" size={14} color={tint} />
        {!compact && <Text style={[styles.pillText, { color: tint }]}>{t(current.labelKey)}</Text>}
        <Ionicons name="chevron-down" size={12} color={tint} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{t('lang.choose')}</Text>
              <Pressable onPress={() => setOpen(false)}><Ionicons name="close" size={22} color={colors.gray500} /></Pressable>
            </View>
            {SUPPORTED_LANGUAGES.map(l => {
              const on = l.code === i18n.language;
              return (
                <Pressable key={l.code} onPress={() => pick(l.code)} style={[styles.row, on && styles.rowOn]} testID={`lang-${l.code}`}>
                  <Text style={[styles.rowText, on && styles.rowTextOn]}>{t(l.labelKey)}</Text>
                  {on && <Ionicons name="checkmark-circle" size={20} color={colors.orange} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: colors.navy },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: radius.md, marginTop: 6,
    borderWidth: 1, borderColor: colors.gray200,
  },
  rowOn: { borderColor: colors.orange, backgroundColor: '#FFF7ED' },
  rowText: { fontSize: 15, fontWeight: '700', color: colors.gray700 },
  rowTextOn: { color: colors.orangeDark },
});

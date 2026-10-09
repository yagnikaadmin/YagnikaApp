import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { useAuth, apiFetch } from '@/src/context/AuthContext';

type Stage = 'submitted' | 'interview' | 'approved' | 'rejected';
interface RegStatus { stage: Stage; status: string; review_note?: string; }

const ORDER: Record<Stage, number> = { submitted: 0, interview: 1, approved: 2, rejected: 2 };

// Shown after a priest registers (or logs in while still pending). The
// account stays inactive until an admin approves it in the Admin Web UI.
export default function PriestPending() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, token, logout, refreshUser } = useAuth();
  const [reg, setReg] = useState<RegStatus | null>(null);

  const steps: { key: Stage; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'submitted', title: t('pending.step1t'), desc: t('pending.step1d'), icon: 'document-text' },
    { key: 'interview', title: t('pending.step2t'), desc: t('pending.step2d'), icon: 'people' },
    { key: 'approved', title: t('pending.step3t'), desc: t('pending.step3d'), icon: 'shield-checkmark' },
  ];

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiFetch('/priest/my-registration', {}, token);
      if (!r.ok) return;
      const data = (await r.json()) as RegStatus;
      setReg(data);
      if (data.status === 'approved') {
        await refreshUser().catch(() => {});
        router.replace('/priest-dashboard');
      }
    } catch { /* keep showing last known state */ }
  }, [token, refreshUser, router]);

  useFocusEffect(useCallback(() => {
    poll();
    const id = setInterval(poll, 12000);
    return () => clearInterval(id);
  }, [poll]));

  useEffect(() => {
    if (user?.approval_status === 'approved') router.replace('/priest-dashboard');
  }, [user, router]);

  const signOut = async () => { await logout(); router.replace('/login?role=priest'); };

  const current: Stage = reg?.stage ?? 'submitted';
  const rejected = reg?.status === 'rejected' || current === 'rejected';
  const currentIdx = ORDER[current];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="priest-pending">
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={[styles.badge, rejected && { backgroundColor: colors.red600 }]}>
          <Ionicons name={rejected ? 'close' : 'hourglass-outline'} size={38} color="#FFF" />
        </View>

        <Text style={styles.title}>{rejected ? t('pending.rejectedTitle') : t('pending.reviewTitle')}</Text>
        <Text style={styles.body}>
          {rejected
            ? t('pending.rejectedBody')
            : user?.name
              ? t('pending.intro', { name: user.name })
              : t('pending.introNoName')}
        </Text>

        {!rejected && (
          <View style={styles.steps}>
            {steps.map((s, i) => {
              const done = i < currentIdx || current === 'approved';
              const active = i === currentIdx && current !== 'approved';
              const suffix = active ? ` · ${t('pending.inProgress')}` : done ? ` · ${t('pending.done')}` : '';
              return (
                <View key={s.key} style={styles.step}>
                  <View style={styles.stepRail}>
                    <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                      <Ionicons name={done ? 'checkmark' : s.icon} size={16} color={done || active ? '#FFF' : colors.gray400} />
                    </View>
                    {i < steps.length - 1 && <View style={[styles.line, done && styles.lineDone]} />}
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={[styles.stepTitle, (done || active) && { color: colors.navy }]}>{s.title}{suffix}</Text>
                    <Text style={styles.stepDesc}>{s.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {reg?.review_note ? (
          <View style={styles.noteBox}><Text style={styles.noteText}>{t('pending.adminNote', { note: reg.review_note })}</Text></View>
        ) : null}

        <Pressable onPress={signOut} style={styles.cta} testID="btn-pending-signout">
          <Text style={styles.ctaText}>{t('pending.backToLogin')}</Text>
        </Pressable>
        <Text style={styles.hint}>{t('pending.autoUpdate')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  badge: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.amber600, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  body: { fontSize: 14, color: colors.gray600, textAlign: 'center', lineHeight: 21 },
  steps: { alignSelf: 'stretch', marginTop: 16, backgroundColor: '#FFF', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, padding: 18 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 32 },
  dot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.amber600 },
  dotDone: { backgroundColor: colors.emerald800 },
  line: { width: 2, flex: 1, minHeight: 26, backgroundColor: colors.gray200, marginVertical: 2 },
  lineDone: { backgroundColor: colors.emerald800 },
  stepBody: { flex: 1, paddingBottom: 18 },
  stepTitle: { fontSize: 14, fontWeight: '800', color: colors.gray400 },
  stepDesc: { fontSize: 12, color: colors.gray500, marginTop: 2, lineHeight: 17 },
  noteBox: { alignSelf: 'stretch', backgroundColor: '#FEF3C7', borderRadius: radius.md, padding: 12, marginTop: 4 },
  noteText: { fontSize: 12.5, color: colors.amber800, lineHeight: 18 },
  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', marginTop: 14 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 12, color: colors.gray500, textAlign: 'center' },
});

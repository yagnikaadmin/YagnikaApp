import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import { poojaImageFor } from '@/src/utils/poojaImages';

interface Booking {
  id: string; pooja_name: string;
  booking_date: string; booking_time: string; status: string;
  sankalp_name: string; gothram: string; notes: string; place: string;
  priest_name?: string | null; priest_mobile?: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'Pending Priest Assignment': { bg: '#FEF3C7', fg: colors.amber800 },
  'Priest Assigned': { bg: '#D1FAE5', fg: colors.emerald800 },
  'Completed': { bg: '#DBEAFE', fg: '#1E40AF' },
  'Cancelled': { bg: '#FEE2E2', fg: colors.red600 },
};

export default function BookingDetails() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(() => {
    if (!token || !id) return;
    apiFetch(`/bookings/${id}`, {}, token)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then(b => { setBooking(b); setNotFound(false); loadedOnce.current = true; })
      .catch(() => { if (!loadedOnce.current) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [id, token]);

  useFocusEffect(useCallback(() => {
    load();
    const tm = setInterval(load, 6000);
    return () => clearInterval(tm);
  }, [load]));

  const assigned = booking?.status === 'Priest Assigned';
  const sc = STATUS_COLORS[booking?.status || ''] || { bg: colors.gray100, fg: colors.gray700 };

  const statusLabel = (s?: string) => {
    switch (s) {
      case 'Pending Priest Assignment': return t('dashboard.pending');
      case 'Priest Assigned': return t('dashboard.accepted');
      case 'Completed': return t('dashboard.completed');
      default: return s || t('dashboard.pending');
    }
  };

  return (
    <View style={styles.root} testID="booking-details">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.deepRed }}>
        <View style={styles.headerBar}>
          <Pressable testID="btn-details-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('bookingConfirm.detailsTitle')}</Text>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.darkRed} /></View>
      ) : notFound ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>📭</Text>
          <Text style={styles.emptyText}>{t('bookingDetails.notFound')}</Text>
          <Pressable onPress={() => router.back()} style={styles.cta}>
            <Text style={styles.ctaText}>{t('common.back')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          <View style={styles.hero}>
            {booking?.pooja_name && (
              <Image source={{ uri: poojaImageFor('', booking.pooja_name) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
            <LinearGradient colors={['rgba(255,255,255,0.94)', 'rgba(255,255,255,0.98)', '#FFF']} style={StyleSheet.absoluteFill} />
            <Text style={styles.heroTitle}>{booking?.pooja_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusText, { color: sc.fg }]}>{statusLabel(booking?.status)}</Text>
            </View>
          </View>

          {assigned && (
            <View style={styles.priestCard} testID="details-priest-card">
              <Ionicons name="person-circle" size={32} color={colors.emerald800} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pLabel}>{t('bookingConfirm.assignedYagnika')}</Text>
                <Text style={styles.pName}>{booking?.priest_name}</Text>
                <Text style={styles.pMobile}>📞 {booking?.priest_mobile}</Text>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('bookingConfirm.detailsTitle')}</Text>
            <Row label={t('bookingConfirm.pooja')} value={booking?.pooja_name} />
            <Row label={t('bookingConfirm.date')} value={booking?.booking_date} />
            <Row label={t('bookingConfirm.time')} value={booking?.booking_time} />
            <Row label={t('bookingConfirm.sankalp')} value={booking?.sankalp_name} />
            <Row label={t('bookingConfirm.gothram')} value={booking?.gothram} />
            <Row label={t('bookingConfirm.place')} value={booking?.place} />
            {booking?.notes ? <Row label={t('bookingConfirm.notes')} value={booking.notes} /> : null}
            <Row label={t('bookingConfirm.bookingId')} value={booking?.id} lines={0} />
          </View>

          <Pressable testID="btn-details-back-cta" onPress={() => router.back()} style={styles.cta}>
            <Text style={styles.ctaText}>{t('common.back')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value, lines = 3 }: { label: string; value?: string; lines?: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={lines || undefined} selectable>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 14, color: colors.gray500, textAlign: 'center' },
  hero: { alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 24, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray100, overflow: 'hidden' },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  statusPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '800' },
  priestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ECFDF5', padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: '#10B981' },
  pLabel: { fontSize: 10, fontWeight: '800', color: colors.emerald800, letterSpacing: 1 },
  pName: { fontSize: 15, fontWeight: '800', color: colors.gray800, marginTop: 2 },
  pMobile: { fontSize: 13, color: colors.emerald800, marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.gray100 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.navy, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.gray100, gap: 12 },
  rowLabel: { fontSize: 12, color: colors.gray500, fontWeight: '600' },
  rowValue: { fontSize: 13, color: colors.gray800, fontWeight: '700', flex: 1, textAlign: 'right' },
  cta: { backgroundColor: colors.darkRed, paddingVertical: 16, borderRadius: radius.md, alignItems: 'center' },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});

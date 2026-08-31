import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import { poojaImageFor } from '@/src/utils/poojaImages';

interface Booking {
  id: string; pooja_name: string;
  booking_date: string; booking_time: string; status: string;
  sankalp_name: string; gothram: string; notes: string; place: string;
  priest_name?: string | null; priest_mobile?: string | null;
}

export default function BookingConfirmation() {
  const router = useRouter();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);

  const load = useCallback(() => {
    if (!token || !id) return;
    apiFetch(`/bookings/${id}`, {}, token).then(r => r.json()).then(setBooking).catch(() => {});
  }, [id, token]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]));

  const assigned = booking?.status === 'Priest Assigned';
  const pending = booking?.status === 'Pending Priest Assignment';

  return (
    <View style={styles.root} testID="booking-confirmation">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.deepRed }}>
        <View style={styles.headerBar}>
          <Pressable testID="btn-conf-home" onPress={() => router.replace('/(devotee)/dashboard')} style={styles.backBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{assigned ? 'Booking Confirmed' : 'Booking Submitted'}</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <View style={styles.hero}>
          {booking?.pooja_name && (
            <Image source={{ uri: poojaImageFor('', booking.pooja_name) }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          )}
          <LinearGradient colors={['rgba(255,255,255,0.94)', 'rgba(255,255,255,0.98)', '#FFF']} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.checkCircle, { backgroundColor: assigned ? '#10B981' : colors.gold }]}>
            <Ionicons name={assigned ? 'checkmark' : 'time'} size={44} color="#FFF" />
          </View>
          <Text style={styles.heroTitle}>{assigned ? 'Booking Confirmed' : 'Booking Request Submitted'}</Text>
          <Text style={styles.heroSub}>{
            assigned
              ? 'A Yagnika has accepted your booking. Contact details below.'
              : pending
                ? 'Waiting for a Priest to accept your booking.'
                : `Status: ${booking?.status || '—'}`
          }</Text>
          <View style={[styles.statusPill, { backgroundColor: assigned ? '#D1FAE5' : '#FEF3C7' }]}>
            <Text style={[styles.statusText, { color: assigned ? '#065F46' : colors.amber800 }]}>
              {booking?.status || 'Pending'}
            </Text>
          </View>
        </View>

        {assigned && (
          <View style={styles.priestCard} testID="assigned-priest-card">
            <Ionicons name="person-circle" size={32} color={colors.emerald800} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pLabel}>Assigned Yagnika</Text>
              <Text style={styles.pName}>{booking?.priest_name}</Text>
              <Text style={styles.pMobile}>📞 {booking?.priest_mobile}</Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Booking Details</Text>
          <Row label="Pooja" value={booking?.pooja_name} />
          <Row label="Date" value={booking?.booking_date} />
          <Row label="Time" value={booking?.booking_time} />
          <Row label="Sankalp" value={booking?.sankalp_name} />
          <Row label="Gothram" value={booking?.gothram} />
          <Row label="Place" value={booking?.place} />
          {booking?.notes ? <Row label="Notes" value={booking.notes} /> : null}
          <Row label="Booking ID" value={booking?.id?.slice(0, 8) + '...'} />
        </View>

        <Pressable testID="btn-conf-dashboard" onPress={() => router.replace('/(devotee)/dashboard')} style={styles.cta}>
          <Text style={styles.ctaText}>Back to Dashboard</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  hero: { alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 24, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray100, overflow: 'hidden' },
  checkCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  heroSub: { fontSize: 13, color: colors.gray500, textAlign: 'center', lineHeight: 19 },
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

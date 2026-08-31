import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';
import { poojaImageFor } from '@/src/utils/poojaImages';

const PANCHANGAM_URL = 'https://panchangam-frontend-dev.onrender.com/';

interface Booking {
  id: string; pooja_id: string; pooja_name: string;
  user_name: string; user_mobile?: string;
  booking_date: string; booking_time: string;
  sankalp_name: string; gothram: string; place: string; notes: string;
  status: string;
}

const SECTIONS = [
  { key: 'Pending', label: 'Pending', endpoint: '/bookings/priest/inbox', icon: 'time' as const },
  { key: 'Accepted', label: 'Accepted', endpoint: '/bookings/priest/accepted', icon: 'checkmark-done' as const },
  { key: 'Completed', label: 'Completed', endpoint: '/bookings/priest/completed', icon: 'trophy' as const },
];

export default function PriestDashboard() {
  const router = useRouter();
  const { user, token, logout, updateProfile } = useAuth();
  const [tab, setTab] = useState<'Pending' | 'Accepted' | 'Completed'>('Pending');
  const [data, setData] = useState<Record<string, Booking[]>>({ Pending: [], Accepted: [], Completed: [] });
  const [busyId, setBusyId] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showPanchangam, setShowPanchangam] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const changePhoto = async () => {
    try {
      setPhotoBusy(true);
      const dataUri = await pickProfilePhoto();
      if (dataUri) await updateProfile({ photo_url: dataUri });
    } catch (e: any) {
      Alert.alert('Could not update photo', e.message || 'Something went wrong');
    } finally { setPhotoBusy(false); }
  };

  const load = useCallback(async () => {
    if (!token) return;
    const results = await Promise.all(SECTIONS.map(s => apiFetch(s.endpoint, {}, token).then(r => r.ok ? r.json() : []).catch(() => [])));
    setData({ Pending: results[0], Accepted: results[1], Completed: results[2] });
  }, [token]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]));

  const act = async (id: string, action: 'accept' | 'reject' | 'complete') => {
    setBusyId(id);
    try {
      const res = await apiFetch(`/bookings/${id}/${action}`, { method: 'POST' }, token);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('action error', err);
      }
      await load();
    } finally { setBusyId(''); }
  };

  const doLogout = async () => { await logout(); router.replace('/home'); };
  const current = data[tab] || [];

  return (
    <View style={styles.root} testID="priest-dashboard">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.deepRed }}>
        <View style={styles.header}>
          <Pressable testID="btn-priest-avatar" onPress={() => setShowProfile(true)}>
            <Avatar photoUrl={user?.photo_url} role="priest" size={52} ringColor="rgba(255,255,255,0.4)" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerLabel}>Namaste 🙏</Text>
            <Text style={styles.headerName}>{user?.name}</Text>
            <View style={styles.badge}><Text style={styles.badgeText}>✦ VERIFIED YAGNIKA (PRIEST) ✦</Text></View>
          </View>
          <Pressable testID="btn-priest-panchangam" onPress={() => setShowPanchangam(true)} style={styles.logoutIcon}>
            <Ionicons name="moon" size={22} color="#FFF" />
          </Pressable>
          <Pressable testID="btn-priest-logout" onPress={doLogout} style={styles.logoutIcon}>
            <Ionicons name="log-out-outline" size={22} color="#FFF" />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SECTIONS.map(s => (
            <Pressable key={s.key} testID={`chip-${s.key}`} onPress={() => setTab(s.key as any)} style={[styles.chip, tab === s.key && styles.chipActive]}>
              <Ionicons name={s.icon} size={12} color={tab === s.key ? colors.deepRed : 'rgba(255,255,255,0.85)'} />
              <Text style={[styles.chipText, tab === s.key && styles.chipTextActive]}>{s.label} ({data[s.key]?.length || 0})</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {current.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>📜</Text>
            <Text style={styles.emptyText}>No {tab.toLowerCase()} bookings</Text>
          </View>
        )}
        {current.map(b => {
          const showMobile = tab !== 'Pending';
          return (
            <View key={b.id} style={styles.card} testID={`priest-booking-${b.id}`}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Image source={{ uri: poojaImageFor(b.pooja_id, b.pooja_name) }} style={styles.poojaThumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pooja}>{b.pooja_name}</Text>
                  <Text style={styles.devotee}>Devotee: <Text style={{ fontWeight: '800' }}>{b.user_name}</Text></Text>
                  {showMobile && b.user_mobile ? <Text style={styles.mobile}>📱 {b.user_mobile}</Text> : null}
                </View>
              </View>

              <View style={styles.metaBox}>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>DATE</Text><Text style={styles.metaValue}>{b.booking_date}</Text></View>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>TIME</Text><Text style={styles.metaValue}>{b.booking_time}</Text></View>
              </View>
              <View style={styles.metaBox}>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>SANKALP</Text><Text style={styles.metaValue}>{b.sankalp_name}</Text></View>
                <View style={styles.metaCell}><Text style={styles.metaLabel}>GOTHRAM</Text><Text style={styles.metaValue}>{b.gothram}</Text></View>
              </View>
              <View style={styles.placeBox}><Ionicons name="location" size={12} color={colors.gray500} /><Text style={styles.placeText}>{b.place}</Text></View>
              {b.notes ? <Text style={styles.notes}>📝 {b.notes}</Text> : null}

              {tab === 'Pending' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <Pressable disabled={busyId === b.id} testID={`btn-accept-${b.id}`} onPress={() => act(b.id, 'accept')} style={[styles.actionBtn, { backgroundColor: '#10B981' }]}>
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                    <Text style={styles.actionText}>Accept</Text>
                  </Pressable>
                  <Pressable disabled={busyId === b.id} testID={`btn-reject-${b.id}`} onPress={() => act(b.id, 'reject')} style={[styles.actionBtn, { backgroundColor: colors.red500 }]}>
                    <Ionicons name="close" size={16} color="#FFF" />
                    <Text style={styles.actionText}>Reject</Text>
                  </Pressable>
                </View>
              )}
              {tab === 'Accepted' && (
                <Pressable disabled={busyId === b.id} testID={`btn-complete-${b.id}`} onPress={() => act(b.id, 'complete')} style={[styles.actionBtn, { backgroundColor: colors.orange, marginTop: 4 }]}>
                  <Ionicons name="checkmark-done" size={16} color="#FFF" />
                  <Text style={styles.actionText}>Mark Completed</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={showProfile} animationType="slide" transparent onRequestClose={() => setShowProfile(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.navy }}>My Profile</Text>
              <Pressable testID="btn-close-priest-profile" onPress={() => setShowProfile(false)}><Ionicons name="close" size={22} color={colors.gray500} /></Pressable>
            </View>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Avatar testID="priest-profile-avatar" photoUrl={user?.photo_url} role="priest" size={84} editable busy={photoBusy} onEdit={changePhoto} ringColor={colors.gray100} />
              <Pressable onPress={changePhoto} disabled={photoBusy}><Text style={styles.changePhotoText}>{photoBusy ? 'Updating…' : 'Change photo'}</Text></Pressable>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.gray800 }}>{user?.name}</Text>
              <Text style={{ fontSize: 12, color: colors.gray500 }}>{user?.email}</Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPanchangam} animationType="slide" onRequestClose={() => setShowPanchangam(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }} edges={['top', 'bottom']}>
          <View style={styles.panchangamHeader}>
            <Text style={styles.panchangamTitle}>Yagnika Panchangam</Text>
            <Pressable testID="btn-close-priest-panchangam" onPress={() => setShowPanchangam(false)}><Ionicons name="close" size={22} color={colors.gray500} /></Pressable>
          </View>
          <WebView testID="priest-panchangam-webview" source={{ uri: PANCHANGAM_URL }} style={{ flex: 1 }} startInLoadingState />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  headerName: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 2 },
  badge: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: colors.goldLight, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  logoutIcon: { padding: 8 },
  chipRow: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip: { flexShrink: 0, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', gap: 6 },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.deepRed },
  empty: { padding: 40, alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100 },
  emptyText: { fontSize: 13, color: colors.gray500 },
  card: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.gray100, gap: 10 },
  pooja: { fontSize: 16, fontWeight: '800', color: colors.navy },
  devotee: { fontSize: 13, color: colors.gray600, marginTop: 4 },
  mobile: { fontSize: 12, color: colors.gray500, marginTop: 2 },
  metaBox: { flexDirection: 'row', gap: 10, backgroundColor: colors.cream, padding: 10, borderRadius: radius.md },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 9, color: colors.gray400, fontWeight: '800', letterSpacing: 0.8 },
  metaValue: { fontSize: 12, fontWeight: '700', color: colors.gray800, marginTop: 2 },
  placeBox: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', padding: 10, backgroundColor: '#FFF8E7', borderRadius: 8 },
  placeText: { flex: 1, fontSize: 12, color: colors.amber800 },
  notes: { fontSize: 12, color: colors.gray600, padding: 10, backgroundColor: '#F9FAFB', borderRadius: 8, fontStyle: 'italic' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  actionText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  poojaThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.gray100 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', padding: 20, paddingBottom: 32, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  label: { fontSize: 12, color: colors.gray500, fontWeight: '700', marginBottom: 8 },
  changePhotoText: { fontSize: 12, color: colors.orange, fontWeight: '700' },
  panchangamHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.gray100 },
  panchangamTitle: { fontSize: 16, fontWeight: '800', color: colors.navy },
});

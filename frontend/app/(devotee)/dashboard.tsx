import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { useAuth, apiFetch } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import PoojaImage from '@/src/components/PoojaImage';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';

const PANCHANGAM_URL = 'https://panchangam-frontend-dev.onrender.com/';

interface Pooja { id: string; name: string; sanskrit_name: string; description: string; duration: string; price: number; }
interface Booking { id: string; pooja_name: string; booking_date: string; booking_time: string; status: string; priest_name?: string | null; priest_mobile?: string | null; place: string; }

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'Pending Priest Assignment': { bg: '#FEF3C7', fg: '#92400E' },
  'Priest Assigned': { bg: '#D1FAE5', fg: '#065F46' },
  'Completed': { bg: '#DBEAFE', fg: '#1E40AF' },
  'Cancelled': { bg: '#FEE2E2', fg: '#DC2626' },
};

export default function DevoteeDashboard() {
  const router = useRouter();
  const { user, token, logout, updateProfile } = useAuth();
  const [tab, setTab] = useState<'home' | 'bookings' | 'panchangam' | 'profile'>('home');
  const [poojas, setPoojas] = useState<Pooja[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
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
    const [po, bk] = await Promise.all([
      apiFetch('/poojas', {}, token).then(r => r.json()).catch(() => []),
      apiFetch('/bookings/mine', {}, token).then(r => r.json()).catch(() => []),
    ]);
    setPoojas(Array.isArray(po) ? po : []);
    setBookings(Array.isArray(bk) ? bk : []);
  }, [token]);

  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]));

  const doLogout = async () => { await logout(); router.replace('/home'); };

  return (
    <View style={styles.root} testID="devotee-dashboard">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.orange }}>
        <View style={styles.orangeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.namaste}>Namaste 🙏</Text>
            <Text style={styles.userName}>{user?.name || 'Devotee'}</Text>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>✦ YAJMANA (DEVOTEE) ✦</Text></View>
          </View>
          <Pressable onPress={() => setTab('profile')}>
            <Avatar photoUrl={user?.photo_url} role="devotee" title={user?.title} size={48} ringColor="rgba(255,255,255,0.5)" />
          </Pressable>
        </View>
      </SafeAreaView>

      {tab === 'panchangam' ? (
        <View style={styles.panchangamWrap} testID="panchangam-webview-wrap">
          <WebView testID="panchangam-webview" source={{ uri: PANCHANGAM_URL }} style={{ flex: 1 }} startInLoadingState />
        </View>
      ) : (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {tab === 'home' && (
          <View>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="flame" size={18} color={colors.amber700} />
                <Text style={styles.sectionTitle}>Available Poojas</Text>
              </View>
              <View style={{ paddingHorizontal: 20, gap: 10 }}>
                {poojas.map(p => (
                  <View key={p.id} style={styles.poojaCard}>
                    <PoojaImage id={p.id} name={p.name} height={100} radius={0} style={{ borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }}>
                      <Text style={styles.poojaSanskritOnImg}>{p.sanskrit_name}</Text>
                      <Text style={styles.poojaNameOnImg}>{p.name}</Text>
                    </PoojaImage>
                    <View style={styles.poojaCardBody}>
                      <Text style={styles.poojaDesc} numberOfLines={2}>{p.description}</Text>
                      <View style={styles.poojaCardFooter}>
                        <Text style={styles.poojaMeta}>{p.duration} • ₹{p.price}</Text>
                        <Pressable testID={`btn-book-pooja-${p.id}`} onPress={() => router.push(`/(devotee)/book/${p.id}`)} style={styles.bookNowBtn}>
                          <Text style={styles.bookNowText}>Book</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
                {poojas.length === 0 && <Text style={{ color: colors.gray500, textAlign: 'center', padding: 20 }}>No poojas available.</Text>}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="clipboard" size={18} color={colors.amber700} />
                <Text style={styles.sectionTitle}>Recent Bookings</Text>
                {bookings.length > 3 && <Pressable onPress={() => setTab('bookings')}><Text style={styles.seeAll}>See all</Text></Pressable>}
              </View>
              <View style={{ paddingHorizontal: 20, gap: 10 }}>
                {bookings.slice(0, 3).map(b => (
                  <BookingCard key={b.id} b={b} />
                ))}
                {bookings.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={{ fontSize: 30 }}>🙏</Text>
                    <Text style={styles.emptyText}>No bookings yet. Book your first pooja above!</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {tab === 'bookings' && (
          <View style={{ padding: 20 }}>
            <Text style={styles.pageTitle}>My Bookings</Text>
            {bookings.length === 0 ? (
              <View style={[styles.emptyBox, { minHeight: 240 }]}>
                <Text style={{ fontSize: 40 }}>📖</Text>
                <Text style={styles.emptyText}>No bookings yet</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>{bookings.map(b => <BookingCard key={b.id} b={b} big />)}</View>
            )}
          </View>
        )}

        {tab === 'profile' && (
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={styles.pageTitle}>Yajmana Profile</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <Avatar testID="profile-avatar" photoUrl={user?.photo_url} role="devotee" title={user?.title} size={64} editable busy={photoBusy} onEdit={changePhoto} ringColor={colors.gray100} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName}>{user?.name}</Text>
                  <Text style={styles.profileRole}>VERIFIED YAJMANA (DEVOTEE)</Text>
                  <Pressable onPress={changePhoto} disabled={photoBusy}><Text style={styles.changePhotoText}>{photoBusy ? 'Updating…' : 'Change photo'}</Text></Pressable>
                </View>
              </View>
              <View style={styles.profileDivider} />
              <ProfileRow label="Email" value={user?.email} />
              <ProfileRow label="Mobile" value={user?.mobile} />
            </View>
            <Pressable testID="btn-logout" onPress={doLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={colors.red600} />
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      )}

      <View style={styles.tabBar}>
        {[
          { key: 'home', label: 'Home', icon: 'home' as const },
          { key: 'bookings', label: 'Bookings', icon: 'clipboard' as const },
          { key: 'panchangam', label: 'Panchangam', icon: 'moon' as const },
          { key: 'profile', label: 'Profile', icon: 'person' as const },
        ].map(t => (
          <Pressable key={t.key} testID={`tab-${t.key}`} onPress={() => setTab(t.key as any)} style={styles.tabBtn}>
            <Ionicons name={t.icon} size={22} color={tab === t.key ? colors.orange : colors.gray400} />
            <Text style={[styles.tabLabel, tab === t.key && { color: colors.orange }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function BookingCard({ b, big }: { b: Booking; big?: boolean }) {
  const sc = STATUS_COLORS[b.status] || { bg: colors.gray100, fg: colors.gray700 };
  return (
    <View style={[styles.bookingCard, big && { padding: 16 }]} testID={`booking-item-${b.id}`}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.bookingPooja}>{b.pooja_name}</Text>
        <View style={styles.bookingRow}>
          <Ionicons name="calendar" size={12} color={colors.gray500} />
          <Text style={styles.bookingMeta}>{b.booking_date}</Text>
          <Ionicons name="time" size={12} color={colors.gray500} style={{ marginLeft: 8 }} />
          <Text style={styles.bookingMeta}>{b.booking_time}</Text>
        </View>
        {b.priest_name && (
          <View style={styles.priestBox} testID={`booking-priest-${b.id}`}>
            <Ionicons name="person-circle" size={14} color={colors.emerald800} />
            <Text style={styles.priestName}>{b.priest_name}</Text>
            <Text style={styles.priestMobile}>📞 {b.priest_mobile}</Text>
          </View>
        )}
      </View>
      <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
        <Text style={[styles.statusPillText, { color: sc.fg }]}>{b.status === 'Pending Priest Assignment' ? 'Pending' : b.status === 'Priest Assigned' ? 'Assigned' : b.status}</Text>
      </View>
    </View>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.profileItem}>
      <Text style={styles.profileKey}>{label}</Text>
      <Text style={styles.profileVal}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  panchangamWrap: { flex: 1, marginBottom: 80 },
  orangeHeader: { paddingHorizontal: 20, paddingBottom: 28, flexDirection: 'row', alignItems: 'center' },
  namaste: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  userName: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  roleBadgeText: { color: '#FEF3C7', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  section: { marginTop: 16, marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.navy },
  seeAll: { color: colors.orange, fontSize: 12, fontWeight: '700' },
  poojaCard: { backgroundColor: '#FFF', borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray100 },
  poojaSanskritOnImg: { fontSize: 10, color: colors.goldLight, fontWeight: '700' },
  poojaNameOnImg: { fontSize: 15, fontWeight: '800', color: '#FFF', marginTop: 2 },
  poojaCardBody: { padding: 12 },
  poojaSanskrit: { fontSize: 11, color: colors.amber600, fontWeight: '700' },
  poojaName: { fontSize: 14, fontWeight: '800', color: colors.gray800, marginTop: 2 },
  poojaDesc: { fontSize: 11, color: colors.gray500, lineHeight: 15 },
  poojaCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  poojaMeta: { fontSize: 12, fontWeight: '700', color: colors.darkRed },
  bookNowBtn: { backgroundColor: colors.orange, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md },
  bookNowText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  bookingCard: { backgroundColor: '#FFF', borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.gray100 },
  bookingPooja: { fontSize: 14, fontWeight: '800', color: colors.gray800 },
  bookingMeta: { fontSize: 11, color: colors.gray500 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priestBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', padding: 8, borderRadius: 8, marginTop: 4 },
  priestName: { fontSize: 12, fontWeight: '700', color: colors.emerald800 },
  priestMobile: { fontSize: 11, color: colors.emerald800, marginLeft: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  emptyBox: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 32, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray100 },
  emptyText: { fontSize: 13, color: colors.gray500, textAlign: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.navy, marginBottom: 16 },
  profileCard: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.gray100 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileName: { fontSize: 19, fontWeight: '800', color: colors.gray800 },
  profileRole: { fontSize: 10, color: colors.amber700, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  changePhotoText: { fontSize: 12, color: colors.orange, fontWeight: '700', marginTop: 6 },
  profileDivider: { height: 1, backgroundColor: colors.gray100, marginVertical: 14 },
  profileItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  profileKey: { fontSize: 13, color: colors.gray500 },
  profileVal: { fontSize: 13, fontWeight: '700', color: colors.gray800 },
  logoutBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red100, borderRadius: radius.md, paddingVertical: 14 },
  logoutText: { color: colors.red600, fontSize: 14, fontWeight: '700' },
  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: colors.gray100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 16 },
  tabBtn: { alignItems: 'center', gap: 4, paddingVertical: 8, minWidth: 64 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: colors.gray400, letterSpacing: 0.5 },
});

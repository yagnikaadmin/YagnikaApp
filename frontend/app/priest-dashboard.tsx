import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import LanguagePicker from '@/src/components/LanguagePicker';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';
import { poojaImageFor } from '@/src/utils/poojaImages';
import PanchangamScreen from '@/src/components/panchangam/PanchangamScreen';
import PriestAvailability from './priest-availability';
import DeityHero from '@/src/components/DeityHero';
import ZoomView from '@/src/components/ZoomView';
import PagerView from 'react-native-pager-view';

const PRIEST_TABS = ['home', 'bookings', 'availability', 'panchangam', 'profile'] as const;
const GAYATRI_HERO = require('../src/assets/panchangam/hero-gayatri.png');
const LAKSHMI_HERO = require('../src/assets/panchangam/hero-lalitha.png');
const GOVINDA_HERO = require('../src/assets/panchangam/hero-govinda.png');

interface Booking {
  id: string; pooja_id: string; pooja_name: string;
  user_name: string; user_mobile?: string;
  booking_date: string; booking_time: string;
  sankalp_name: string; gothram: string; place: string; notes: string;
  status: string;
}

const SECTIONS = [
  { key: 'Pending', tkey: 'dashboard.pending', endpoint: '/bookings/priest/inbox', icon: 'time' as const },
  { key: 'Accepted', tkey: 'dashboard.accepted', endpoint: '/bookings/priest/accepted', icon: 'checkmark-done' as const },
  { key: 'Completed', tkey: 'dashboard.completed', endpoint: '/bookings/priest/completed', icon: 'trophy' as const },
];
type Filter = 'Pending' | 'Accepted' | 'Completed';
type Tab = 'home' | 'bookings' | 'availability' | 'panchangam' | 'profile';

export default function PriestDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, token, logout, updateProfile } = useAuth();
  // Room for Android's navigation buttons (the app runs edge-to-edge).
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  const pagerRef = React.useRef<PagerView>(null);
  const [zoomed, setZoomed] = useState(false);
  React.useEffect(() => {
    const i = PRIEST_TABS.indexOf(tab as any);
    if (i >= 0) pagerRef.current?.setPage(i);
  }, [tab]);
  const [filter, setFilter] = useState<Filter>('Pending');
  const [data, setData] = useState<Record<string, Booking[]>>({ Pending: [], Accepted: [], Completed: [] });
  const [busyId, setBusyId] = useState('');
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

  const doLogout = async () => { await logout(); router.replace('/login?role=priest'); };

  const load = useCallback(async () => {
    if (!token) return;
    const results = await Promise.all(SECTIONS.map(s => apiFetch(s.endpoint, {}, token).then(r => r.ok ? r.json() : []).catch(() => [])));
    setData({ Pending: results[0], Accepted: results[1], Completed: results[2] });
  }, [token]);

  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]));

  const act = async (id: string, action: 'accept' | 'reject' | 'complete') => {
    setBusyId(id);
    try {
      await apiFetch(`/bookings/${id}/${action}`, { method: 'POST' }, token);
      await load();
    } finally { setBusyId(''); }
  };

  const goFilter = (f: Filter) => { setFilter(f); setTab('bookings'); };
  const current = data[filter] || [];

  return (
    <View style={styles.root} testID="priest-dashboard">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.deepRed }}>
        <View style={styles.header}>
          <Pressable testID="btn-priest-avatar" onPress={() => setTab('profile')}>
            <Avatar photoUrl={user?.photo_url} role="priest" size={48} ringColor="rgba(255,255,255,0.4)" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerLabel}>{t('dashboard.namaste')}</Text>
            <Text style={styles.headerName} numberOfLines={1}>{user?.name}</Text>
            <View style={styles.badge}><Text style={styles.badgeText} numberOfLines={1}>✦ {t("dashboard.verifiedPriest")} ✦</Text></View>
          </View>
          <LanguagePicker tint="#FFF" compact />
          {tab === 'panchangam' && (
            <View style={styles.headerTabTag}><Text style={styles.headerTabTagText}>{t('panchangam.title')}</Text></View>
          )}
        </View>
      </SafeAreaView>

      <ZoomView onZoomChange={setZoomed} style={{ flex: 1 }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={PRIEST_TABS.indexOf(tab as any)}
        scrollEnabled={!zoomed}
        offscreenPageLimit={1}
        onPageSelected={e => setTab(PRIEST_TABS[e.nativeEvent.position] as Tab)}
      >
        <View key="home" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
            <DeityHero image={GAYATRI_HERO} shloka={t('dashboard.slokaHome')} aspectRatio={4 / 5} />
            <View style={{ padding: 20, gap: 14 }}>
              <Text style={styles.h1}>{t('priest.overview')}</Text>
              <View style={styles.statRow}>
                {SECTIONS.map(s => (
                  <Pressable key={s.key} onPress={() => goFilter(s.key as Filter)} style={styles.statCard}>
                    <Ionicons name={s.icon} size={18} color={colors.deepRed} />
                    <Text style={styles.statNum}>{data[s.key]?.length ?? 0}</Text>
                    <Text style={styles.statLabel} numberOfLines={1}>{t(s.tkey)}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={() => setTab('availability')} style={styles.navCard}>
                <View style={[styles.navIcon, { backgroundColor: '#FCEEEE' }]}><Ionicons name="calendar" size={20} color={colors.darkRed} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.navTitle}>{t('priest.manageOnline')}</Text>
                  <Text style={styles.navSub}>{t('priest.manageOnlineSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
              </Pressable>

              <Pressable onPress={() => router.push('/priest-profile-edit')} style={styles.navCard}>
                <View style={[styles.navIcon, { backgroundColor: '#E7F0FF' }]}><Ionicons name="create" size={20} color="#2563EB" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.navTitle}>{t('priest.editProfileCard')}</Text>
                  <Text style={styles.navSub}>{t('priest.editProfileSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
              </Pressable>
            </View>
        </ScrollView>
        </View>

        <View key="bookings" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
            <DeityHero image={GOVINDA_HERO} shloka={t('dashboard.slokaBookings')} aspectRatio={4 / 5} />
            <View style={{ padding: 20, gap: 12 }}>
              <View style={styles.segment}>
                {SECTIONS.map(s => (
                  <Pressable key={s.key} onPress={() => setFilter(s.key as Filter)}
                    style={[styles.segBtn, filter === s.key && styles.segBtnOn]}>
                    <Text style={[styles.segText, filter === s.key && styles.segTextOn]}>
                      {t(s.tkey)} ({data[s.key]?.length || 0})
                    </Text>
                  </Pressable>
                ))}
              </View>

              {current.length === 0 && (
                <View style={styles.empty}>
                  <Text style={{ fontSize: 40 }}>📜</Text>
                  <Text style={styles.emptyText}>{t('dashboard.noBookings', { tab: t(`dashboard.${filter.toLowerCase()}`).toLowerCase() })}</Text>
                </View>
              )}

              {current.map(b => {
                const showMobile = filter !== 'Pending';
                return (
                  <View key={b.id} style={styles.card} testID={`priest-booking-${b.id}`}>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Image source={{ uri: poojaImageFor(b.pooja_id, b.pooja_name) }} style={styles.poojaThumb} contentFit="cover" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pooja}>{b.pooja_name}</Text>
                        <Text style={styles.devotee}>{t('dashboard.devotee')}: <Text style={{ fontWeight: '800' }}>{b.user_name}</Text></Text>
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

                    {filter === 'Pending' && (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <Pressable disabled={busyId === b.id} testID={`btn-accept-${b.id}`} onPress={() => act(b.id, 'accept')} style={[styles.actionBtn, { backgroundColor: '#10B981' }]}>
                          <Ionicons name="checkmark" size={16} color="#FFF" />
                          <Text style={styles.actionText}>{t('dashboard.accept')}</Text>
                        </Pressable>
                        <Pressable disabled={busyId === b.id} testID={`btn-reject-${b.id}`} onPress={() => act(b.id, 'reject')} style={[styles.actionBtn, { backgroundColor: colors.red500 }]}>
                          <Ionicons name="close" size={16} color="#FFF" />
                          <Text style={styles.actionText}>{t('dashboard.reject')}</Text>
                        </Pressable>
                      </View>
                    )}
                    {filter === 'Accepted' && (
                      <Pressable disabled={busyId === b.id} testID={`btn-complete-${b.id}`} onPress={() => act(b.id, 'complete')} style={[styles.actionBtn, { backgroundColor: colors.orange, marginTop: 4 }]}>
                        <Ionicons name="checkmark-done" size={16} color="#FFF" />
                        <Text style={styles.actionText}>{t('dashboard.markCompleted')}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
        </ScrollView>
        </View>

        <View key="availability" style={styles.panchangamWrap} testID="priest-availability-wrap">
          <PriestAvailability embedded />
        </View>

        <View key="panchangam" style={styles.panchangamWrap} testID="priest-panchangam-wrap">
          <PanchangamScreen />
        </View>

        <View key="profile" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
            <DeityHero image={LAKSHMI_HERO} shloka={t('dashboard.slokaProfile')} aspectRatio={4 / 5} />
            <View style={{ padding: 20, gap: 16 }}>
              <Text style={styles.h1}>{t('dashboard.myProfile')}</Text>
              <View style={styles.profileCard}>
                <View style={styles.profileRow}>
                  <Avatar testID="priest-profile-avatar" photoUrl={user?.photo_url} role="priest" size={64} editable busy={photoBusy} onEdit={changePhoto} ringColor={colors.gray100} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{user?.name}</Text>
                    <Text style={styles.profileRole}>✦ {t('dashboard.verifiedPriest')}</Text>
                    <Pressable onPress={changePhoto} disabled={photoBusy}><Text style={styles.changePhotoText}>{photoBusy ? t('common.loading') : t('dashboard.changePhoto')}</Text></Pressable>
                  </View>
                </View>
                <View style={styles.divider} />
                <Row label={t('customer.email')} value={user?.email} />
                <Row label={t('customer.mobile')} value={user?.mobile} />
              </View>

              <Pressable testID="btn-edit-profile" onPress={() => router.push('/priest-profile-edit')} style={[styles.wideBtn, styles.wideBtnPrimary]}>
                <Ionicons name="create-outline" size={18} color="#FFF" />
                <Text style={styles.wideBtnPrimaryText}>{t('dashboard.editProfile')}</Text>
              </Pressable>
              <Pressable testID="btn-priest-logout" onPress={doLogout} style={[styles.wideBtn, styles.wideBtnLogout]}>
                <Ionicons name="log-out-outline" size={18} color={colors.red600} />
                <Text style={styles.wideBtnLogoutText}>{t('dashboard.logout')}</Text>
              </Pressable>
            </View>
        </ScrollView>
        </View>
      </PagerView>
      </ZoomView>

      <View style={[styles.tabBar, { height: 78 + insets.bottom, paddingBottom: 14 + insets.bottom }]}>
        {([
          { key: 'home', label: t('customer.tabHome'), icon: 'home' as const },
          { key: 'bookings', label: t('customer.tabBookings'), icon: 'clipboard' as const },
          { key: 'availability', label: t('priest.tabAvailability'), icon: 'calendar' as const },
          { key: 'panchangam', label: t('customer.tabPanchangam'), icon: 'moon' as const },
          { key: 'profile', label: t('customer.tabProfile'), icon: 'person' as const },
        ]).map(it => {
          const active = tab === it.key;
          return (
            <Pressable key={it.key} testID={`tab-${it.key}`}
              onPress={() => setTab(it.key as Tab)}
              style={styles.tabBtn}>
              <Ionicons name={it.icon} size={21} color={active ? colors.deepRed : colors.gray400} />
              <Text style={[styles.tabLabel, active && { color: colors.deepRed }]} numberOfLines={1}>{it.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.rowItem}>
      <Text style={styles.rowKey}>{label}</Text>
      <Text style={styles.rowVal}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  panchangamWrap: { flex: 1, marginBottom: 78 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 86 },
  headerTabTag: { position: 'absolute', right: 20, bottom: 8 },
  headerTabTagText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  headerLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  headerName: { color: '#FFF', fontSize: 21, fontWeight: '800', marginTop: 2 },
  badge: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: colors.goldLight, fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  h1: { fontSize: 20, fontWeight: '800', color: colors.navy },

  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, paddingVertical: 14, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.deepRed },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: colors.gray500 },

  navCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, padding: 14 },
  navIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 14, fontWeight: '800', color: colors.gray800 },
  navSub: { fontSize: 11.5, color: colors.gray500, marginTop: 2 },

  segment: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.deepRed },
  segText: { fontSize: 11.5, fontWeight: '800', color: colors.gray500 },
  segTextOn: { color: '#FFF' },

  empty: { padding: 40, alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100 },
  emptyText: { fontSize: 13, color: colors.gray500, textAlign: 'center' },
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

  profileCard: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.gray100 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileName: { fontSize: 19, fontWeight: '800', color: colors.gray800 },
  profileRole: { fontSize: 10, color: colors.amber700, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  changePhotoText: { fontSize: 12, color: colors.orange, fontWeight: '700', marginTop: 6 },
  divider: { height: 1, backgroundColor: colors.gray100, marginVertical: 14 },
  rowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  rowKey: { fontSize: 13, color: colors.gray500 },
  rowVal: { fontSize: 13, fontWeight: '700', color: colors.gray800 },
  wideBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: radius.md },
  wideBtnPrimary: { backgroundColor: colors.darkRed },
  wideBtnPrimaryText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  wideBtnLogout: { backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red100 },
  wideBtnLogoutText: { color: colors.red600, fontSize: 14, fontWeight: '800' },

  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: colors.gray100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 14 },
  tabBtn: { alignItems: 'center', gap: 3, paddingVertical: 8, minWidth: 58, flex: 1 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: colors.gray400, letterSpacing: 0.3 },
});

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { useAuth, apiFetch } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import LanguagePicker from '@/src/components/LanguagePicker';
import { poojaImageFor } from '@/src/utils/poojaImages';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';
import { CATEGORY_ORDER, catMeta, catShort as catShortI18n, subName, svcName } from '@/src/i18n/catalog';
import PanchangamScreen from '@/src/components/panchangam/PanchangamScreen';
import DeityHero from '@/src/components/DeityHero';
import ZoomView from '@/src/components/ZoomView';
import PagerView from 'react-native-pager-view';

const DEVOTEE_TABS = ['home', 'categories', 'bookings', 'panchangam', 'profile'] as const;
const GAYATRI_HERO = require('../../src/assets/panchangam/hero-gayatri.png');
const LAKSHMI_HERO = require('../../src/assets/panchangam/hero-lalitha.png');
const GOVINDA_HERO = require('../../src/assets/panchangam/hero-govinda.png');

interface Pooja {
  id: string; name: string; sanskrit_name: string; description: string;
  duration: string; price: number; category?: string | null; subcategory?: string | null;
}
interface Booking { id: string; pooja_name: string; booking_date: string; booking_time: string; status: string; priest_name?: string | null; priest_mobile?: string | null; place: string; }

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  'Pending Priest Assignment': { bg: '#FEF3C7', fg: '#92400E' },
  'Priest Assigned': { bg: '#D1FAE5', fg: '#065F46' },
  'Completed': { bg: '#DBEAFE', fg: '#1E40AF' },
  'Cancelled': { bg: '#FEE2E2', fg: '#DC2626' },
};

export default function DevoteeDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, token, logout, updateProfile } = useAuth();
  // Room for Android's navigation buttons (the app runs edge-to-edge).
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'home' | 'categories' | 'bookings' | 'panchangam' | 'profile'>('home');
  const [poojas, setPoojas] = useState<Pooja[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const panchangamPinged = useRef(false);
  const pagerRef = useRef<PagerView>(null);
  const [zoomed, setZoomed] = useState(false);

  // Keep the pager in sync when the tab is changed from code (buttons, links).
  React.useEffect(() => {
    const i = DEVOTEE_TABS.indexOf(tab);
    if (i >= 0) pagerRef.current?.setPage(i);
  }, [tab]);

  const catLabel = useCallback((c?: string | null) => (c ? catShortI18n(t, c) : ''), [t]);

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

  const openPanchangam = () => {
    setTab('panchangam');
    if (!panchangamPinged.current) {
      panchangamPinged.current = true;
      apiFetch('/metrics/panchangam-view', { method: 'POST', body: JSON.stringify({ source: 'customer-app' }) }).catch(() => {});
    }
  };

  const doLogout = async () => { await logout(); router.replace('/login?role=devotee'); };
  const goBook = (id: string) => router.push(`/(devotee)/book/${id}`);
  const goBookingDetails = (id: string) => router.push({ pathname: '/(devotee)/booking-details/[id]', params: { id } });

  const featured = useMemo(() => poojas.filter(p => !p.category), [poojas]);
  const catalog = useMemo(() => poojas.filter(p => p.category), [poojas]);

  const byCategory = useMemo(() => {
    const m = new Map<string, Pooja[]>();
    for (const p of catalog) {
      const c = p.category as string;
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(p);
    }
    return CATEGORY_ORDER.filter(c => m.has(c)).map(c => [c, m.get(c)!] as const);
  }, [catalog]);

  const searchResults = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return [];
    return poojas
      .filter(p => p.name.toLowerCase().includes(s)
        || svcName(t, p.name).toLowerCase().includes(s)
        || (p.subcategory || '').toLowerCase().includes(s)
        || subName(t, p.subcategory || '').toLowerCase().includes(s)
        || (p.category || '').toLowerCase().includes(s)
        || catLabel(p.category).toLowerCase().includes(s))
      .slice(0, 60);
  }, [query, poojas, t, catLabel]);

  return (
    <View style={styles.root} testID="devotee-dashboard">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.orange }}>
        <View style={styles.orangeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.namaste}>{t('dashboard.namaste')}</Text>
            <Text style={styles.userName}>{user?.name || t('dashboard.devotee')}</Text>
            <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{t('customer.roleBadge')}</Text></View>
          </View>
          <LanguagePicker tint="#FFF" compact />
          <Pressable onPress={() => setTab('profile')} style={{ marginLeft: 12 }}>
            <Avatar photoUrl={user?.photo_url} role="devotee" title={user?.title} size={48} ringColor="rgba(255,255,255,0.5)" />
          </Pressable>
          {tab === 'panchangam' && (
            <View style={styles.headerTabTag}><Text style={styles.headerTabTagText}>{t('panchangam.title')}</Text></View>
          )}
        </View>
      </SafeAreaView>

      <ZoomView onZoomChange={setZoomed} style={{ flex: 1 }}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={DEVOTEE_TABS.indexOf(tab)}
        scrollEnabled={!zoomed}
        offscreenPageLimit={1}
        onPageSelected={e => {
          const k = DEVOTEE_TABS[e.nativeEvent.position];
          if (k === 'panchangam') openPanchangam(); else setTab(k);
        }}
      >
        <View key="home" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <View>
            <DeityHero image={GAYATRI_HERO} shloka={t('dashboard.slokaHome')} aspectRatio={4 / 5} />

            <Pressable style={styles.searchPill} onPress={() => setTab('categories')}>
              <Ionicons name="search" size={16} color={colors.gray400} />
              <Text style={styles.searchPillText}>{t('catalog.ui.searchAll')}</Text>
            </Pressable>

            <SectionHeader icon="flame" title={t('catalog.ui.popularPoojas')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {featured.map(p => (
                <SquareTile key={p.id} id={p.id} name={svcName(t, p.name)} note={`₹${p.price}`} onPress={() => goBook(p.id)} />
              ))}
              {featured.length === 0 && <Text style={styles.railEmpty}>{t('common.loading')}</Text>}
            </ScrollView>

            <SectionHeader icon="grid" title={t('catalog.ui.browseByCategory')} onSeeAll={() => setTab('categories')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {CATEGORY_ORDER.map(c => {
                const meta = catMeta(c);
                return (
                  <Pressable key={c} style={styles.catTile} onPress={() => { setOpenCat(c); setTab('categories'); }}>
                    <View style={[styles.catGlyphWrap, { backgroundColor: meta.color + '22' }]}>
                      <Text style={[styles.catGlyph, { color: meta.color }]}>{meta.glyph}</Text>
                    </View>
                    <Text style={styles.catTileText} numberOfLines={2}>{catLabel(c)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <SectionHeader icon="clipboard" title={t('catalog.ui.recentBookings')} onSeeAll={bookings.length > 3 ? () => setTab('bookings') : undefined} />
            <View style={{ paddingHorizontal: 20, gap: 10 }}>
              {bookings.slice(0, 3).map(b => <BookingCard key={b.id} b={b} onPress={() => goBookingDetails(b.id)} />)}
              {bookings.length === 0 && (
                <View style={styles.emptyBox}>
                  <Text style={{ fontSize: 30 }}>🙏</Text>
                  <Text style={styles.emptyText}>{t('customer.noBookingsHint')}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
        </View>

        <View key="categories" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingTop: 12 }}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.gray400} />
              <TextInput
                testID="input-service-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t('catalog.ui.searchAll')}
                placeholderTextColor={colors.gray400}
                style={styles.searchInput}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.gray400} /></Pressable>
              ) : null}
            </View>

            {query ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                <Text style={styles.resultCount}>{t('catalog.ui.results', { count: searchResults.length })}</Text>
                <View style={styles.wrapGrid}>
                  {searchResults.map(p => (
                    <SquareTile key={p.id} id={p.id} name={svcName(t, p.name)}
                      note={p.category ? catLabel(p.category) : `₹${p.price}`}
                      sub={p.subcategory ? subName(t, p.subcategory) : undefined}
                      imgKey={p.category || undefined}
                      onPress={() => goBook(p.id)} grid />
                  ))}
                </View>
                {searchResults.length === 0 && <Text style={styles.railEmpty}>{t('catalog.ui.noMatch', { query })}</Text>}
              </View>
            ) : (
              byCategory.map(([cat, items]) => {
                const meta = catMeta(cat);
                const collapsed = openCat != null && openCat !== cat;
                return (
                  <View key={cat} style={{ marginTop: 16 }}>
                    <Pressable style={styles.catRowHeader} onPress={() => setOpenCat(openCat === cat ? null : cat)}>
                      <View style={[styles.catGlyphSm, { backgroundColor: meta.color + '22' }]}>
                        <Text style={[styles.catGlyphSmText, { color: meta.color }]}>{meta.glyph}</Text>
                      </View>
                      <Text style={styles.catRowTitle}>{catLabel(cat)}</Text>
                      <Text style={styles.catRowCount}>{items.length}</Text>
                      <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={colors.gray400} />
                    </Pressable>
                    {!collapsed && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
                        {items.map(p => (
                          <SquareTile key={p.id} id={p.id} name={svcName(t, p.name)}
                            sub={p.subcategory ? subName(t, p.subcategory) : undefined}
                            imgKey={cat} onPress={() => goBook(p.id)} />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })
            )}
            {byCategory.length === 0 && !query && <Text style={styles.railEmpty}>{t('catalog.ui.loadingCatalog')}</Text>}
          </View>
        </ScrollView>
        </View>

        <View key="bookings" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <DeityHero image={GOVINDA_HERO} shloka={t('dashboard.slokaBookings')} aspectRatio={4 / 5} />
          <View style={{ padding: 20 }}>
            <Text style={styles.pageTitle}>{t('customer.myBookings')}</Text>
            {bookings.length === 0 ? (
              <View style={[styles.emptyBox, { minHeight: 240 }]}>
                <Text style={{ fontSize: 40 }}>📖</Text>
                <Text style={styles.emptyText}>{t('customer.noBookingsYet')}</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>{bookings.map(b => <BookingCard key={b.id} b={b} big onPress={() => goBookingDetails(b.id)} />)}</View>
            )}
          </View>
        </ScrollView>
        </View>

        <View key="panchangam" style={styles.panchangamWrap} testID="panchangam-native-wrap">
          <PanchangamScreen />
        </View>

        <View key="profile" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }} showsVerticalScrollIndicator={false}>
          <DeityHero image={LAKSHMI_HERO} shloka={t('dashboard.slokaProfile')} aspectRatio={4 / 5} />
          <View style={{ padding: 20, gap: 16 }}>
            <Text style={styles.pageTitle}>{t('customer.yajmanaProfile')}</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <Avatar testID="profile-avatar" photoUrl={user?.photo_url} role="devotee" title={user?.title} size={64} editable busy={photoBusy} onEdit={changePhoto} ringColor={colors.gray100} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileName}>{user?.name}</Text>
                  <Text style={styles.profileRole}>{t('customer.verifiedYajmana')}</Text>
                  <Pressable onPress={changePhoto} disabled={photoBusy}><Text style={styles.changePhotoText}>{photoBusy ? t('customer.updating') : t('customer.changePhoto')}</Text></Pressable>
                </View>
              </View>
              <View style={styles.profileDivider} />
              <ProfileRow label={t('customer.email')} value={user?.email} />
              <ProfileRow label={t('customer.mobile')} value={user?.mobile} />
              <ProfileRow label={t('book.gothram')} value={user?.gothram || undefined} />
              <ProfileRow label={t('register.address')} value={user?.address || undefined} />
            </View>
            <Pressable testID="btn-edit-profile" onPress={() => router.push('/(devotee)/profile-edit')} style={styles.editProfileBtn}>
              <Ionicons name="create-outline" size={18} color="#FFF" />
              <Text style={styles.editProfileText}>{t('profile.title')}</Text>
            </Pressable>
            <Pressable testID="btn-logout" onPress={doLogout} style={styles.logoutBtn}>
              <Ionicons name="log-out-outline" size={18} color={colors.red600} />
              <Text style={styles.logoutText}>{t('customer.logOut')}</Text>
            </Pressable>
          </View>
        </ScrollView>
        </View>
      </PagerView>
      </ZoomView>

      <View style={[styles.tabBar, { height: 78 + insets.bottom, paddingBottom: 14 + insets.bottom }]}>
        {[
          { key: 'home', label: t('customer.tabHome'), icon: 'home' as const },
          { key: 'categories', label: t('customer.tabCategories'), icon: 'grid' as const },
          { key: 'bookings', label: t('customer.tabBookings'), icon: 'clipboard' as const },
          { key: 'panchangam', label: t('customer.tabPanchangam'), icon: 'moon' as const },
          { key: 'profile', label: t('customer.tabProfile'), icon: 'person' as const },
        ].map(tb => (
          <Pressable key={tb.key} testID={`tab-${tb.key}`} onPress={() => (tb.key === 'panchangam' ? openPanchangam() : setTab(tb.key as any))} style={styles.tabBtn}>
            <Ionicons name={tb.icon} size={21} color={tab === tb.key ? colors.orange : colors.gray400} />
            <Text style={[styles.tabLabel, tab === tb.key && { color: colors.orange }]} numberOfLines={1}>{tb.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SectionHeader({ icon, title, onSeeAll }: { icon: keyof typeof Ionicons.glyphMap; title: string; onSeeAll?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color={colors.amber700} />
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll && <Pressable onPress={onSeeAll}><Text style={styles.seeAll}>{t('catalog.ui.seeAll')}</Text></Pressable>}
    </View>
  );
}

// Zepto / Blinkit-style square image tile that scrolls horizontally.
// `imgKey` (English category) only feeds the deity-image keyword match.
function SquareTile({ id, name, note, sub, imgKey, onPress, grid }: {
  id: string; name: string; note?: string; sub?: string; imgKey?: string; onPress: () => void; grid?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tile, grid && styles.tileGrid]}>
      <View style={styles.tileImgWrap}>
        <Image source={{ uri: poojaImageFor(id, name, imgKey) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      </View>
      <Text style={styles.tileName} numberOfLines={2}>{name}</Text>
      {note ? <Text style={styles.tileNote} numberOfLines={1}>{note}</Text>
        : sub ? <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

function BookingCard({ b, big, onPress }: { b: Booking; big?: boolean; onPress?: () => void }) {
  const sc = STATUS_COLORS[b.status] || { bg: colors.gray100, fg: colors.gray700 };
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.bookingCard, big && { padding: 16 }, pressed && onPress ? { opacity: 0.85 } : null]}
      testID={`booking-item-${b.id}`}
    >
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
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 2 }} />}
    </Pressable>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.profileItem}>
      <Text style={styles.profileKey}>{label}</Text>
      <Text style={styles.profileVal} numberOfLines={2}>{value || '-'}</Text>
    </View>
  );
}

const TILE_W = 118;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  panchangamWrap: { flex: 1, marginBottom: 80 },
  orangeHeader: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', height: 86 },
  headerTabTag: { position: 'absolute', right: 20, bottom: 8 },
  headerTabTagText: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  namaste: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  userName: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  roleBadgeText: { color: '#FEF3C7', fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  searchPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', marginHorizontal: 20, marginTop: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100 },
  searchPillText: { color: colors.gray400, fontSize: 13, fontWeight: '600' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray200 },
  searchInput: { flex: 1, fontSize: 14, color: colors.gray800, paddingVertical: 2 },
  resultCount: { fontSize: 12, color: colors.gray500, fontWeight: '700', marginBottom: 8 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.navy },
  seeAll: { color: colors.orange, fontSize: 12, fontWeight: '700' },

  rail: { paddingHorizontal: 16, gap: 12, paddingVertical: 2 },
  railEmpty: { color: colors.gray500, paddingHorizontal: 20, paddingVertical: 12, fontSize: 13 },

  tile: { width: TILE_W },
  tileGrid: { marginBottom: 14 },
  tileImgWrap: { width: TILE_W, height: TILE_W, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.gray100 },
  tileName: { fontSize: 12, fontWeight: '700', color: colors.gray800, marginTop: 6, lineHeight: 15 },
  tileNote: { fontSize: 12, fontWeight: '800', color: colors.darkRed, marginTop: 1 },
  tileSub: { fontSize: 10, color: colors.gray500, marginTop: 1 },

  wrapGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  catTile: { width: 92, alignItems: 'center' },
  catGlyphWrap: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catGlyph: { fontSize: 24, fontWeight: '800' },
  catTileText: { fontSize: 11, fontWeight: '700', color: colors.gray700, textAlign: 'center', marginTop: 6, lineHeight: 14 },

  catRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  catGlyphSm: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  catGlyphSmText: { fontSize: 13, fontWeight: '800' },
  catRowTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.navy },
  catRowCount: { fontSize: 12, fontWeight: '800', color: colors.gray400 },

  emptyBox: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 32, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray100 },
  emptyText: { fontSize: 13, color: colors.gray500, textAlign: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.navy, marginBottom: 16 },

  bookingCard: { backgroundColor: '#FFF', borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.gray100 },
  bookingPooja: { fontSize: 14, fontWeight: '800', color: colors.gray800 },
  bookingMeta: { fontSize: 11, color: colors.gray500 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priestBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', padding: 8, borderRadius: 8, marginTop: 4 },
  priestName: { fontSize: 12, fontWeight: '700', color: colors.emerald800 },
  priestMobile: { fontSize: 11, color: colors.emerald800, marginLeft: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  profileCard: { backgroundColor: '#FFF', borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: colors.gray100 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileName: { fontSize: 19, fontWeight: '800', color: colors.gray800 },
  profileRole: { fontSize: 10, color: colors.amber700, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  changePhotoText: { fontSize: 12, color: colors.orange, fontWeight: '700', marginTop: 6 },
  profileDivider: { height: 1, backgroundColor: colors.gray100, marginVertical: 14 },
  profileItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, gap: 16 },
  profileKey: { fontSize: 13, color: colors.gray500 },
  profileVal: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.gray800, textAlign: 'right' },
  editProfileBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 14 },
  editProfileText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  logoutBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red50, borderWidth: 1, borderColor: colors.red100, borderRadius: radius.md, paddingVertical: 14 },
  logoutText: { color: colors.red600, fontSize: 14, fontWeight: '700' },

  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 78, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: colors.gray100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 14 },
  tabBtn: { alignItems: 'center', gap: 3, paddingVertical: 8, minWidth: 58, flex: 1 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: colors.gray400, letterSpacing: 0.3 },
});

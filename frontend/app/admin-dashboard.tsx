import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import PoojaImage from '@/src/components/PoojaImage';

type Tab = 'overview' | 'poojas' | 'bookings' | 'priests' | 'devotees';

interface Pooja { id: string; name: string; sanskrit_name: string; description: string; duration: string; price: number; is_active: boolean; }
interface UserItem { id: string; name: string; email: string; mobile: string; role: string; is_active: boolean; services?: string[]; address?: string; title?: string | null; photo_url?: string | null; }
interface Booking { id: string; pooja_name: string; user_name: string; user_mobile: string; booking_date: string; booking_time: string; status: string; priest_name?: string | null; priest_mobile?: string | null; place: string; }
interface Stats { priests: number; priests_active: number; devotees: number; devotees_active: number; poojas: number; poojas_active: number; bookings_total: number; bookings_pending: number; bookings_assigned: number; bookings_completed: number; }

const STATUS_FILTERS = ['All', 'Pending Priest Assignment', 'Priest Assigned', 'Completed', 'Cancelled'];

export default function AdminDashboard() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');

  const doLogout = async () => { await logout(); router.replace('/home'); };

  return (
    <View style={styles.root} testID="admin-dashboard">
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.navy }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>Yagnika Admin</Text>
            <Text style={styles.headerName}>{user?.name || 'Admin'}</Text>
          </View>
          <Pressable testID="btn-admin-logout" onPress={doLogout} style={styles.logoutIcon}>
            <Ionicons name="log-out-outline" size={22} color="#FFF" />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([
            { key: 'overview', label: 'Overview', icon: 'stats-chart' as const },
            { key: 'poojas', label: 'Poojas', icon: 'flame' as const },
            { key: 'bookings', label: 'Bookings', icon: 'clipboard' as const },
            { key: 'priests', label: 'Priests', icon: 'business' as const },
            { key: 'devotees', label: 'Devotees', icon: 'people' as const },
          ]).map(t => (
            <Pressable key={t.key} testID={`admin-tab-${t.key}`} onPress={() => setTab(t.key as Tab)} style={[styles.chip, tab === t.key && styles.chipActive]}>
              <Ionicons name={t.icon} size={12} color={tab === t.key ? colors.navy : 'rgba(255,255,255,0.85)'} />
              <Text style={[styles.chipText, tab === t.key && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      {tab === 'overview' && <OverviewSection token={token!} />}
      {tab === 'poojas' && <PoojaSection token={token!} />}
      {tab === 'bookings' && <BookingSection token={token!} />}
      {tab === 'priests' && <UsersSection token={token!} role="priest" />}
      {tab === 'devotees' && <UsersSection token={token!} role="devotee" />}
    </View>
  );
}

function OverviewSection({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const load = useCallback(() => {
    apiFetch('/admin/stats', {}, token).then(r => r.json()).then(setStats).catch(() => {});
  }, [token]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]));

  const cards = [
    { label: 'Priests (active)', v: `${stats?.priests_active ?? 0}/${stats?.priests ?? 0}`, color: colors.deepRed, icon: 'business' as const },
    { label: 'Devotees (active)', v: `${stats?.devotees_active ?? 0}/${stats?.devotees ?? 0}`, color: colors.orange, icon: 'people' as const },
    { label: 'Poojas (active)', v: `${stats?.poojas_active ?? 0}/${stats?.poojas ?? 0}`, color: colors.gold, icon: 'flame' as const },
    { label: 'Bookings pending', v: `${stats?.bookings_pending ?? 0}`, color: '#F59E0B', icon: 'time' as const },
    { label: 'Bookings assigned', v: `${stats?.bookings_assigned ?? 0}`, color: '#10B981', icon: 'checkmark' as const },
    { label: 'Bookings completed', v: `${stats?.bookings_completed ?? 0}`, color: '#3B82F6', icon: 'trophy' as const },
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {cards.map(c => (
          <View key={c.label} style={[styles.statCard, { borderLeftColor: c.color }]}>
            <Ionicons name={c.icon} size={20} color={c.color} />
            <Text style={styles.statValue}>{c.v}</Text>
            <Text style={styles.statLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function PoojaSection({ token }: { token: string }) {
  const [poojas, setPoojas] = useState<Pooja[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Pooja | null>(null);

  const load = useCallback(() => {
    apiFetch('/poojas?include_inactive=true', {}, token).then(r => r.json()).then(setPoojas).catch(() => {});
  }, [token]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleActive = async (p: Pooja) => {
    await apiFetch(`/admin/poojas/${p.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !p.is_active }) }, token);
    load();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.actionBar}>
        <Text style={styles.sectionCount}>{poojas.length} pooja{poojas.length !== 1 ? 's' : ''}</Text>
        <Pressable testID="btn-add-pooja" onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>Add Pooja</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {poojas.map(p => (
          <View key={p.id} style={[styles.rowCard, { alignItems: 'center' }]} testID={`admin-pooja-${p.id}`}>
            <PoojaImage id={p.id} name={p.name} height={48} radius={10} style={{ width: 48 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{p.name}</Text>
              <Text style={styles.rowSub}>{p.sanskrit_name}</Text>
              <Text style={styles.rowMeta}>{p.duration} • ₹{p.price}</Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <View style={[styles.statusDot, { backgroundColor: p.is_active ? '#10B981' : colors.gray400 }]}>
                <Text style={styles.statusDotText}>{p.is_active ? 'Active' : 'Disabled'}</Text>
              </View>
              <Pressable testID={`btn-edit-pooja-${p.id}`} onPress={() => setEditing(p)} style={styles.smallBtn}><Ionicons name="pencil" size={14} color={colors.orange} /></Pressable>
              <Pressable testID={`btn-toggle-pooja-${p.id}`} onPress={() => toggleActive(p)} style={styles.smallBtn}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: p.is_active ? colors.red600 : '#10B981' }}>{p.is_active ? 'Disable' : 'Enable'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <PoojaEditModal
        visible={showAdd || !!editing}
        pooja={editing}
        onClose={() => { setShowAdd(false); setEditing(null); }}
        onSave={async (payload: any) => {
          if (editing) await apiFetch(`/admin/poojas/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
          else await apiFetch('/admin/poojas', { method: 'POST', body: JSON.stringify(payload) }, token);
          setShowAdd(false); setEditing(null); load();
        }}
      />
    </View>
  );
}

function PoojaEditModal({ visible, pooja, onClose, onSave }: any) {
  const [name, setName] = useState('');
  const [sanskrit, setSanskrit] = useState('');
  const [desc, setDesc] = useState('');
  const [duration, setDuration] = useState('1 hour');
  const [price, setPrice] = useState('');
  React.useEffect(() => {
    if (visible) {
      setName(pooja?.name || ''); setSanskrit(pooja?.sanskrit_name || '');
      setDesc(pooja?.description || ''); setDuration(pooja?.duration || '1 hour');
      setPrice(pooja?.price ? String(pooja.price) : '');
    }
  }, [visible, pooja]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: colors.navy }}>{pooja ? 'Edit Pooja' : 'Add Pooja'}</Text>
              <Pressable onPress={onClose}><Ionicons name="close" size={20} color={colors.gray500} /></Pressable>
            </View>
            <TextInput testID="input-pooja-name" placeholder="Name" value={name} onChangeText={setName} style={styles.mInput} placeholderTextColor={colors.gray400} />
            <TextInput testID="input-pooja-sanskrit" placeholder="Sanskrit name (e.g. ॥ ... ॥)" value={sanskrit} onChangeText={setSanskrit} style={styles.mInput} placeholderTextColor={colors.gray400} />
            <TextInput testID="input-pooja-desc" placeholder="Description" value={desc} onChangeText={setDesc} multiline style={[styles.mInput, { minHeight: 60, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} />
            <TextInput testID="input-pooja-duration" placeholder="Duration (e.g. 2 hours)" value={duration} onChangeText={setDuration} style={styles.mInput} placeholderTextColor={colors.gray400} />
            <TextInput testID="input-pooja-price" placeholder="Price (₹)" value={price} onChangeText={setPrice} keyboardType="numeric" style={styles.mInput} placeholderTextColor={colors.gray400} />
            <Pressable testID="btn-save-pooja" onPress={() => onSave({ name, sanskrit_name: sanskrit, description: desc, duration, price: parseInt(price, 10) || 0 })} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>{pooja ? 'Save Changes' : 'Add Pooja'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function BookingSection({ token }: { token: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState('All');
  const [dateFilter, setDateFilter] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== 'All') params.append('status', status);
    if (dateFilter) params.append('date', dateFilter);
    apiFetch(`/admin/bookings?${params.toString()}`, {}, token).then(r => r.json()).then(setBookings).catch(() => {});
  }, [token, status, dateFilter]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, gap: 8, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: colors.gray100 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {STATUS_FILTERS.map(s => (
            <Pressable key={s} testID={`admin-status-${s}`} onPress={() => setStatus(s)} style={[styles.filterChip, status === s && styles.filterChipOn]}>
              <Text style={[styles.filterChipText, status === s && styles.filterChipTextOn]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput testID="admin-date-filter" placeholder="Filter by date (YYYY-MM-DD)" value={dateFilter} onChangeText={setDateFilter} style={styles.mInput} placeholderTextColor={colors.gray400} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {bookings.length === 0 && <Text style={styles.emptyText}>No bookings found.</Text>}
        {bookings.map(b => (
          <View key={b.id} style={styles.rowCard} testID={`admin-booking-${b.id}`}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.rowTitle}>{b.pooja_name}</Text>
              <Text style={styles.rowSub}>👤 {b.user_name} • 📱 {b.user_mobile}</Text>
              <Text style={styles.rowMeta}>{b.booking_date} • {b.booking_time}</Text>
              {b.priest_name ? <Text style={styles.rowMeta}>✅ Priest: {b.priest_name} ({b.priest_mobile})</Text> : null}
              <Text style={styles.rowMeta} numberOfLines={2}>📍 {b.place}</Text>
              <View style={styles.statusDot}><Text style={styles.statusDotText}>{b.status}</Text></View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function UsersSection({ token, role }: { token: string; role: 'priest' | 'devotee' }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    apiFetch(`/admin/${role === 'priest' ? 'priests' : 'devotees'}${q}`, {}, token).then(r => r.json()).then(setUsers).catch(() => {});
  }, [token, role, search]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]));

  const toggle = async (u: UserItem) => {
    await apiFetch(`/admin/users/${u.id}/active`, { method: 'PATCH', body: JSON.stringify({ is_active: !u.is_active }) }, token);
    load();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.actionBar}>
        <TextInput testID={`admin-${role}-search`} placeholder={`Search ${role}s...`} value={search} onChangeText={setSearch} style={[styles.mInput, { flex: 1, marginBottom: 0 }]} placeholderTextColor={colors.gray400} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {users.length === 0 && <Text style={styles.emptyText}>No {role}s found.</Text>}
        {users.map(u => (
          <View key={u.id} style={[styles.rowCard, { alignItems: 'center' }]} testID={`admin-${role}-${u.id}`}>
            <Avatar photoUrl={u.photo_url} role={role} title={u.title} size={44} ringColor={colors.gray100} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{u.name}</Text>
              <Text style={styles.rowSub}>📧 {u.email}</Text>
              <Text style={styles.rowMeta}>📱 {u.mobile}</Text>
              {u.address ? <Text style={styles.rowMeta} numberOfLines={1}>📍 {u.address}</Text> : null}
              {u.services && u.services.length > 0 && <Text style={styles.rowMeta}>🛕 {u.services.length} pooja(s)</Text>}
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <View style={[styles.statusDot, { backgroundColor: u.is_active ? '#10B981' : colors.gray400 }]}>
                <Text style={styles.statusDotText}>{u.is_active ? 'Active' : 'Deactivated'}</Text>
              </View>
              <Pressable testID={`btn-toggle-${role}-${u.id}`} onPress={() => toggle(u)} style={styles.smallBtn}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: u.is_active ? colors.red600 : '#10B981' }}>{u.is_active ? 'Deactivate' : 'Activate'}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerName: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 2 },
  logoutIcon: { padding: 8 },
  chipRow: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  chip: { flexShrink: 0, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', gap: 6 },
  chipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.navy },
  actionBar: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: colors.gray100 },
  sectionCount: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.gray600 },
  addBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: colors.orange, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  addBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  statCard: { width: '47%', backgroundColor: '#FFF', padding: 14, borderRadius: radius.md, borderLeftWidth: 4, borderWidth: 1, borderColor: colors.gray100, gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.navy },
  statLabel: { fontSize: 11, color: colors.gray500, fontWeight: '600' },
  rowCard: { backgroundColor: '#FFF', borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.gray100, flexDirection: 'row', gap: 10 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.navy },
  rowSub: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  rowMeta: { fontSize: 11, color: colors.gray500, marginTop: 3 },
  statusDot: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: '#10B981' },
  statusDotText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  smallBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F9FAFB' },
  filterChip: { flexShrink: 0, paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  filterChipOn: { backgroundColor: colors.orange },
  filterChipText: { fontSize: 11, fontWeight: '700', color: colors.gray700 },
  filterChipTextOn: { color: '#FFF' },
  emptyText: { textAlign: 'center', color: colors.gray500, padding: 40 },
  mInput: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FBFBFB', fontSize: 13, color: colors.gray800, marginBottom: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  saveBtn: { backgroundColor: colors.darkRed, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import TitlePicker from '@/src/components/TitlePicker';
import ServiceCategoryPicker from '@/src/components/ServiceCategoryPicker';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';
import { CATEGORY_ORDER } from '@/src/i18n/catalog';

// Priest "Profile Update" screen — everything the priest is allowed to
// change after registration (photo, contact, address, temple details,
// service categories, experience, availability, languages, certifications,
// working status, temple assignment). Lineage / Vedic details and Aadhaar
// / DOB are fixed at registration and not editable here.

interface Svc { id: string; name: string; category?: string | null; subcategory?: string | null; }

const LANGUAGES = ['Sanskrit', 'Telugu', 'Tamil', 'Kannada', 'Hindi', 'English', 'Others'];
const DESIGNATION = ['Chief Priest', 'Archaka', 'Assistant Archaka', 'Paricharaka', 'Veda Pandit'];
const AVAILABILITY = ['Daily', 'Weekly', 'Festival Only'];
const WORKING_STATUS: { key: string; label: string }[] = [
  { key: 'available', label: 'Available' },
  { key: 'on_leave', label: 'On Leave' },
  { key: 'not_available', label: 'Not Available' },
];

const yn = (b: any): '' | 'yes' | 'no' => (b === true ? 'yes' : b === false ? 'no' : '');
const ynBack = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);

export default function PriestProfileEdit() {
  const router = useRouter();
  const { t } = useTranslation();
  const { token, updateProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string>('personal');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);

  const [catalog, setCatalog] = useState<Svc[]>([]);
  const [services, setServices] = useState<Set<string>>(new Set());

  const [name, setName] = useState('');
  const [title, setTitle] = useState<'mr' | 'mrs' | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [mobile, setMobile] = useState('');
  const [altMobile, setAltMobile] = useState('');
  const [altEmail, setAltEmail] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [priestType, setPriestType] = useState<'independent' | 'temple' | ''>('');
  const [templeName, setTempleName] = useState('');
  const [templeAddress, setTempleAddress] = useState('');
  const [templeDeity, setTempleDeity] = useState('');
  const [templeDesignation, setTempleDesignation] = useState('');
  const [experience, setExperience] = useState('');
  const [templeService, setTempleService] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  const [availability, setAvailability] = useState('');
  const [travel, setTravel] = useState<'' | 'yes' | 'no'>('');
  const [online, setOnline] = useState<'' | 'yes' | 'no'>('');
  const [workingStatus, setWorkingStatus] = useState('available');
  const [certifications, setCertifications] = useState('');
  const [agamaCert, setAgamaCert] = useState('');
  const [vedaPatashala, setVedaPatashala] = useState('');
  const [guru, setGuru] = useState('');
  const [awards, setAwards] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          apiFetch('/auth/me/full', {}, token),
          apiFetch('/poojas'),
        ]);
        const p = await pRes.json();
        const cat: Svc[] = (await cRes.json()).filter((s: Svc) => s.category);
        setCatalog(cat);
        setName(p.name || '');
        setTitle(p.title || undefined);
        setPhotoUrl(p.photo_url || null);
        setMobile(p.mobile || '');
        setAltMobile(p.alt_mobile || '');
        setAltEmail(p.optional_email || '');
        setAddress(p.address || '');
        setLat(p.latitude ?? null);
        setLng(p.longitude ?? null);
        setPriestType(p.priest_type || '');
        setTempleName(p.temple_name || '');
        setTempleAddress(p.temple_address || '');
        setTempleDeity(p.temple_deity || '');
        setTempleDesignation(p.temple_designation || '');
        setExperience(p.years_of_experience != null ? String(p.years_of_experience) : '');
        setTempleService(p.years_temple_service != null ? String(p.years_temple_service) : '');
        setLanguages(Array.isArray(p.languages) ? p.languages : []);
        setAvailability(p.availability || '');
        setTravel(yn(p.travel_availability));
        setOnline(yn(p.online_consultation));
        setWorkingStatus(p.working_status || 'available');
        setCertifications(p.certifications || '');
        setAgamaCert(p.agama_certification || '');
        setVedaPatashala(p.veda_patashala || '');
        setGuru(p.guru_name || '');
        setAwards(p.awards || '');
        setServices(new Set(Array.isArray(p.services) ? p.services : []));
      } catch {
        setError('Could not load your profile. Pull back and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // at least one main category covered by the current selection
  const categoriesSelected = useMemo(() => {
    const byId = new Map(catalog.map(s => [s.id, s.category]));
    return new Set(Array.from(services).map(id => byId.get(id)).filter(Boolean)).size;
  }, [catalog, services]);

  const toggleLang = (l: string) => setLanguages(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]);

  const changePhoto = async () => {
    setPhotoBusy(true);
    try { const uri = await pickProfilePhoto(); if (uri) setPhotoUrl(uri); }
    catch (e: any) { Alert.alert('Could not add photo', e.message || 'Something went wrong'); }
    finally { setPhotoBusy(false); }
  };

  const useLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Location permission denied'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setLat(pos.coords.latitude); setLng(pos.coords.longitude);
      const rev = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      if (rev?.[0]) {
        const r = rev[0];
        setAddress([r.name, r.street, r.city, r.region, r.postalCode].filter(Boolean).join(', '));
      }
    } catch { Alert.alert('Could not fetch location'); }
    finally { setLocBusy(false); }
  };

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); setOpen('personal'); return; }
    if (categoriesSelected === 0) { setError('Select at least one main service category'); setOpen('services'); return; }
    setError(''); setSaving(true);
    try {
      await updateProfile({
        name: name.trim(), title,
        photo_url: photoUrl,
        mobile: mobile.trim(), alt_mobile: altMobile.trim(), optional_email: altEmail.trim(),
        address: address.trim(), latitude: lat, longitude: lng,
        priest_type: priestType || 'independent',
        temple_name: templeName.trim(), temple_address: templeAddress.trim(),
        temple_deity: templeDeity.trim(), temple_designation: templeDesignation,
        services: Array.from(services),
        years_of_experience: experience.trim() === '' ? 0 : Number(experience),
        years_temple_service: templeService.trim() === '' ? null : Number(templeService),
        languages,
        availability, travel_availability: ynBack(travel), online_consultation: ynBack(online),
        working_status: workingStatus,
        certifications: certifications.trim(), agama_certification: agamaCert.trim(),
        veda_patashala: vedaPatashala.trim(), guru_name: guru.trim(), awards: awards.trim(),
      });
      router.back();
    } catch (e: any) {
      setError(e.message || 'Could not save profile');
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.darkRed} /></Pressable>
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.darkRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="priest-profile-edit">
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.darkRed} /></Pressable>
        <Text style={styles.headerTitle}>{t('profile.title')}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Section id="personal" title={t('profile.personal')} open={open} onToggle={setOpen}>
            <View style={styles.photoRow}>
              <Avatar photoUrl={photoUrl} role="priest" size={64} editable busy={photoBusy} onEdit={changePhoto} ringColor={colors.gray100} />
              <Pressable onPress={changePhoto} disabled={photoBusy} style={styles.inlineBtn}>
                <Ionicons name="camera" size={14} color={colors.orange} />
                <Text style={styles.inlineBtnText}>{photoBusy ? t('customer.updating') : t('dashboard.changePhoto')}</Text>
              </Pressable>
            </View>
            <Input label={t('register.fullName') + ' *'} value={name} onChange={setName} placeholder={t('register.fullName')} />
            <View style={styles.field}>
              <Text style={styles.label}>{t('devoteeReg.titleLabel')}</Text>
              <TitlePicker value={title} onChange={setTitle} testIDPrefix="edit-title" />
            </View>
          </Section>

          <Section id="contact" title={t('profile.contactInfo')} open={open} onToggle={setOpen}>
            <Input label={t('register.primaryMobile')} value={mobile} onChange={setMobile} placeholder="+91 …" keyboardType="phone-pad" />
            <Input label={t('register.altMobile')} value={altMobile} onChange={setAltMobile} placeholder="+91 …" keyboardType="phone-pad" />
            <Input label={t('register.altEmail')} value={altEmail} onChange={setAltEmail} placeholder="alt@example.com" keyboardType="email-address" />
          </Section>

          <Section id="address" title={t('profile.address')} open={open} onToggle={setOpen}>
            <View style={styles.field}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>{t('register.address')}</Text>
                <Pressable onPress={useLocation} disabled={locBusy} style={styles.inlineBtn}>
                  {locBusy ? <ActivityIndicator size="small" color={colors.orange} /> : <Ionicons name="location" size={13} color={colors.orange} />}
                  <Text style={styles.inlineBtnText}>{locBusy ? t('common.loading') : t('register.useLocation')}</Text>
                </Pressable>
              </View>
              <TextInput value={address} onChangeText={setAddress} placeholder={t('register.address')} multiline
                style={[styles.input, { minHeight: 58, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} />
              {lat != null && lng != null && <Text style={styles.coord}>📍 {lat.toFixed(4)}, {lng.toFixed(4)}</Text>}
            </View>
          </Section>

          <Section id="temple" title={t('profile.templeDetails')} open={open} onToggle={setOpen}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('register.priestType')}</Text>
              <View style={styles.chipWrap}>
                {[['independent', t('register.independentPriest')], ['temple', t('register.templePriest')]].map(([k, lbl]) => (
                  <Pressable key={k} onPress={() => setPriestType(k as any)} style={[styles.chip, priestType === k && styles.chipOn]}>
                    <Text style={[styles.chipText, priestType === k && styles.chipTextOn]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {priestType === 'temple' && (
              <View style={styles.templeBox}>
                <Input label={t('register.templeName')} value={templeName} onChange={setTempleName} placeholder={t('register.templeNamePlaceholder')} />
                <Input label={t('register.templeAddress')} value={templeAddress} onChange={setTempleAddress} placeholder={t('register.templeAddress')} />
                <Input label={t('register.templeDeity')} value={templeDeity} onChange={setTempleDeity} placeholder={t('register.templeDeity')} />
                <ChipField label={t('register.designation')} options={DESIGNATION} value={templeDesignation} onChange={setTempleDesignation}
                  labels={(o) => t('options.designation.' + o, { defaultValue: o })} />
              </View>
            )}
          </Section>

          <Section id="services" title={`${t('profile.serviceCategories')}  (${services.size})`} open={open} onToggle={setOpen}>
            {catalog.length === 0
              ? <Text style={styles.dim}>{t('catalog.ui.loadingCatalog')}</Text>
              : <ServiceCategoryPicker catalog={catalog} selected={services} onChange={setServices} order={CATEGORY_ORDER} />}
          </Section>

          <Section id="experience" title={t('profile.experience')} open={open} onToggle={setOpen}>
            <Input label={t('register.yearsExperience')} value={experience} onChange={setExperience} placeholder="e.g. 12" keyboardType="number-pad" maxLength={2} />
            <Input label={t('register.yearsTempleService')} value={templeService} onChange={setTempleService} placeholder="e.g. 8" keyboardType="number-pad" maxLength={2} />
          </Section>

          <Section id="languages" title={t('profile.languages')} open={open} onToggle={setOpen}>
            <View style={styles.chipWrap}>
              {LANGUAGES.map(l => (
                <Pressable key={l} onPress={() => toggleLang(l)} style={[styles.chip, languages.includes(l) && styles.chipOn]}>
                  <Text style={[styles.chipText, languages.includes(l) && styles.chipTextOn]}>{t('options.plang.' + l, { defaultValue: l })}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section id="availability" title={t('profile.availability')} open={open} onToggle={setOpen}>
            <ChipField label={t('profile.availability')} options={AVAILABILITY} value={availability} onChange={setAvailability}
              labels={(o) => t('options.availability.' + o, { defaultValue: o })} />
            <YesNo label={t('register.travelAvailability', { defaultValue: 'Travel availability' })} value={travel} onChange={setTravel} yesLabel={t('options.yes')} noLabel={t('options.no')} />
            <YesNo label={t('register.onlineConsult', { defaultValue: 'Online consultation availability' })} value={online} onChange={setOnline} yesLabel={t('options.yes')} noLabel={t('options.no')} />
          </Section>

          <Section id="status" title={t('profile.workingStatus')} open={open} onToggle={setOpen}>
            <View style={styles.chipWrap}>
              {WORKING_STATUS.map(w => (
                <Pressable key={w.key} onPress={() => setWorkingStatus(w.key)} style={[styles.chip, workingStatus === w.key && styles.chipOn]}>
                  <Text style={[styles.chipText, workingStatus === w.key && styles.chipTextOn]}>{t('options.workingStatus.' + w.key, { defaultValue: w.label })}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section id="certs" title={t('profile.certifications')} open={open} onToggle={setOpen}>
            <Input label={t('register.certifications')} value={certifications} onChange={setCertifications} placeholder={t('register.enterHere')} />
            <Input label={t('register.agamaCert')} value={agamaCert} onChange={setAgamaCert} placeholder={t('register.enterHere')} />
            <Input label={t('register.vedaPatashala')} value={vedaPatashala} onChange={setVedaPatashala} placeholder={t('register.enterHere')} />
            <Input label={t('register.guruName')} value={guru} onChange={setGuru} placeholder={t('register.enterHere')} />
            <Input label={t('register.awards')} value={awards} onChange={setAwards} placeholder={t('register.enterHere')} />
          </Section>

          <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.cta, (pressed || saving) && { opacity: 0.85 }]} testID="btn-save-full-profile">
            <Text style={styles.ctaText}>{saving ? t('profile.saving') : t('profile.saveChanges')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ id, title, open, onToggle, children }: { id: string; title: string; open: string; onToggle: (v: string) => void; children: React.ReactNode; }) {
  const isOpen = open === id;
  return (
    <View style={styles.section}>
      <Pressable onPress={() => onToggle(isOpen ? '' : id)} style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.navy} />
      </Pressable>
      {isOpen && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function Input({ label, value, onChange, placeholder, keyboardType, maxLength }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.gray400}
        keyboardType={keyboardType} maxLength={maxLength}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={styles.input}
      />
    </View>
  );
}

function ChipField({ label, options, value, onChange, labels }: { label: string; options: string[]; value: string; onChange: (v: string) => void; labels?: (o: string) => string; }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map(o => (
          <Pressable key={o} onPress={() => onChange(value === o ? '' : o)} style={[styles.chip, value === o && styles.chipOn]}>
            <Text style={[styles.chipText, value === o && styles.chipTextOn]}>{labels ? labels(o) : o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function YesNo({ label, value, onChange, yesLabel, noLabel }: { label: string; value: string; onChange: (v: 'yes' | 'no') => void; yesLabel: string; noLabel: string; }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {(['yes', 'no'] as const).map(o => (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, value === o && styles.chipOn]}>
            <Text style={[styles.chipText, value === o && styles.chipTextOn]}>{o === 'yes' ? yesLabel : noLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: colors.gray100 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  content: { padding: 16, paddingBottom: 48 },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, marginBottom: 12, fontSize: 13, borderWidth: 1, borderColor: colors.red100 },
  section: { backgroundColor: '#FFF', borderRadius: radius.md, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray200 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#FFF8E7' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.navy, flex: 1 },
  sectionBody: { padding: 14, paddingTop: 4 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, color: colors.gray600, marginBottom: 6, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FBFBFB', fontSize: 14, color: colors.gray800 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coord: { fontSize: 11, color: colors.gray500, marginTop: 4 },
  dim: { fontSize: 12, color: colors.gray500 },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  inlineBtnText: { fontSize: 11, color: colors.orange, fontWeight: '700' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.gray300, backgroundColor: '#FBFBFB' },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.gray600 },
  chipTextOn: { color: '#FFF' },
  templeBox: { backgroundColor: '#FFF8E7', borderRadius: radius.sm, padding: 12, marginTop: 4 },
  catBox: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, marginBottom: 8, overflow: 'hidden' },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#FBFBFB' },
  catTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.darkRed },
  catCount: { backgroundColor: colors.amber100, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  catCountText: { fontSize: 11, fontWeight: '800', color: colors.amber800 },
  catBody: { padding: 10, paddingTop: 4 },
  selectAll: { fontSize: 11, fontWeight: '800', color: colors.orange },
  subLabel: { fontSize: 11, fontWeight: '800', color: colors.gray500, marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  svcRowOn: { backgroundColor: '#FFF7ED' },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  svcName: { flex: 1, fontSize: 13, color: colors.gray800 },
  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});

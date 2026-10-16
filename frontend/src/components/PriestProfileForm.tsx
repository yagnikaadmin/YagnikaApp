import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';
import { pickAadhaarProof, pickProofDocument } from '@/src/utils/pickAadhaarProof';
import { isValidEmail, isValidMobile } from '@/src/utils/validation';
import ServiceCategoryPicker from '@/src/components/ServiceCategoryPicker';
import LanguagePicker from '@/src/components/LanguagePicker';
import { CATEGORY_ORDER, DANA_CATEGORY } from '@/src/i18n/catalog';

// ---------------------------------------------------------------------------
// Yagnika (Priest) profile form — used by BOTH Priest Registration
// (app/priest-register.tsx, mode="register") and the priest's Edit Profile
// (app/priest-profile-edit.tsx, mode="edit"), so the two always offer exactly
// the same fields, sections, validation and green ticks.
//
// register: POST /api/auth/register-priest (users + priest_registration),
//           then the pending-approval screen.
// edit:     pre-filled from GET /api/auth/me/full, saved with PATCH /api/auth/me
//           (kept in sync with priest_registration). The password is optional
//           (blank keeps the current one) and the Aadhaar proof / Agama
//           certificate are only re-sent when replaced.
// ---------------------------------------------------------------------------

interface Svc { id: string; name: string; category?: string | null; subcategory?: string | null; }

const SAMPRADAYA = ['Smarta', 'Vaishnava', 'Shaiva', 'Shakta', 'Madhwa', 'Other'];
const AGAMA = ['Vaikhanasa', 'Pancharatra', 'Shaiva Agama', 'Shakta Agama', 'Other'];
const LANGUAGES = ['Sanskrit', 'Telugu', 'Tamil', 'Kannada', 'Hindi', 'English', 'Others'];
const DESIGNATION = ['Chief Priest', 'Archaka', 'Assistant Archaka', 'Paricharaka', 'Veda Pandit'];

type FormState = {
  // account
  email: string; password: string;
  // A. personal
  name: string; photo_url: string | null; aadhaar_number: string; mobile: string;
  aadhaar_proof: string | null; aadhaar_proof_name: string;
  address: string; date_of_birth: string; latitude: number | null; longitude: number | null;
  // B. religious lineage
  sampradaya: string; sampradaya_other: string;
  agama: string; agama_other: string;
  // C. professional
  years_of_experience: string; languages: string[];
  priest_type: 'independent' | 'temple' | '';
  temple_name: string; temple_address: string; temple_deity: string; temple_designation: string;
  // optional
  alt_mobile: string; optional_email: string;
  agama_certification: string; agama_certificate: string | null; agama_certificate_name: string;
  veda_patashala: string; guru_name: string; years_temple_service: string;
  travel_availability: '' | 'yes' | 'no'; online_consultation: '' | 'yes' | 'no';
};

const EMPTY: FormState = {
  email: '', password: '',
  name: '', photo_url: null, aadhaar_number: '', mobile: '',
  aadhaar_proof: null, aadhaar_proof_name: '',
  address: '', date_of_birth: '',
  latitude: null, longitude: null,
  sampradaya: '', sampradaya_other: '', agama: '', agama_other: '',
  years_of_experience: '', languages: [], priest_type: '',
  temple_name: '', temple_address: '', temple_deity: '', temple_designation: '',
  alt_mobile: '', optional_email: '',
  agama_certification: '', agama_certificate: null, agama_certificate_name: '',
  veda_patashala: '', guru_name: '', years_temple_service: '',
  travel_availability: '', online_consultation: '',
};

export default function PriestProfileForm({ mode }: { mode: 'register' | 'edit' }) {
  const isEdit = mode === 'edit';
  const router = useRouter();
  const { t } = useTranslation();
  const { registerPriest, updateProfile, token } = useAuth();
  const [f, setF] = useState<FormState>(EMPTY);
  // Edit mode: the stored profile is loaded first; files kept as loaded are
  // not re-uploaded on save.
  const [loadingProfile, setLoadingProfile] = useState(isEdit);
  const [loaded, setLoaded] = useState<{ aadhaar_proof: string | null; agama_certificate: string | null }>({ aadhaar_proof: null, agama_certificate: null });
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF(p => ({ ...p, [k]: v }));

  const [catalog, setCatalog] = useState<Svc[]>([]);
  // Today's local date (YYYY-MM-DD), captured once — a date of birth must be before it.
  const [todayIso] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [services, setServices] = useState<Set<string>>(new Set());
  const [openSection, setOpenSection] = useState<string>('A');
  const [locBusy, setLocBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/poojas').then(r => r.json()).then((rows: Svc[]) => setCatalog(rows.filter(r => r.category))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    apiFetch('/auth/me/full', {}, token)
      .then(r => r.json())
      .then((p: any) => {
        if (!alive) return;
        const known = (opts: string[], v: string) => (!v ? ['', ''] : opts.includes(v) ? [v, ''] : ['Other', v]);
        const [samp, sampOther] = known(SAMPRADAYA, p.sampradaya || '');
        const [agam, agamOther] = known(AGAMA, p.agama || '');
        const yn = (b: any): '' | 'yes' | 'no' => (b === true ? 'yes' : b === false ? 'no' : '');
        const num = (v: any) => (v === null || v === undefined ? '' : String(v));
        setF({
          email: p.email || '', password: '',
          name: p.name || '', photo_url: p.photo_url || null, aadhaar_number: p.aadhaar_number || '', mobile: p.mobile || '',
          aadhaar_proof: p.aadhaar_proof || null, aadhaar_proof_name: p.aadhaar_proof_name || '',
          address: p.address || '', date_of_birth: p.date_of_birth || '',
          latitude: p.latitude ?? null, longitude: p.longitude ?? null,
          sampradaya: samp, sampradaya_other: sampOther, agama: agam, agama_other: agamOther,
          years_of_experience: num(p.years_of_experience), languages: Array.isArray(p.languages) ? p.languages : [],
          priest_type: p.priest_type || '',
          temple_name: p.temple_name || '', temple_address: p.temple_address || '',
          temple_deity: p.temple_deity || '', temple_designation: p.temple_designation || '',
          alt_mobile: p.alt_mobile || '', optional_email: p.optional_email || '',
          agama_certification: p.agama_certification || '',
          agama_certificate: p.agama_certificate || null, agama_certificate_name: p.agama_certificate_name || '',
          veda_patashala: p.veda_patashala || '', guru_name: p.guru_name || '', years_temple_service: num(p.years_temple_service),
          travel_availability: yn(p.travel_availability), online_consultation: yn(p.online_consultation),
        });
        setServices(new Set(Array.isArray(p.services) ? p.services : []));
        setLoaded({ aadhaar_proof: p.aadhaar_proof || null, agama_certificate: p.agama_certificate || null });
      })
      .catch(() => { if (alive) setError('Could not load your profile. Go back and try again.'); })
      .finally(() => { if (alive) setLoadingProfile(false); });
    return () => { alive = false; };
  }, [isEdit, token]);

  const sampradaya = f.sampradaya === 'Other' ? f.sampradaya_other.trim() : f.sampradaya;
  const agama = f.agama === 'Other' ? f.agama_other.trim() : f.agama;

  // Mandatory fields still missing, per section. Drives both the green
  // "section complete" tick and the submit-time check, so they never disagree.
  const missingBySection = useMemo(() => {
    const byId = new Map(catalog.map(s => [s.id, s.category]));
    const cats = Array.from(services).map(id => byId.get(id)).filter(Boolean);
    const pick = (req: [string, any][]) => req.filter(([, ok]) => !ok).map(([label]) => label);
    // YYYY-MM-DD, a real calendar date, and in the past (the backend rejects anything else).
    const dob = f.date_of_birth.trim();
    const dobDate = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(dob + 'T00:00:00Z') : null;
    const dobOk = !!dobDate && !isNaN(dobDate.getTime())
      && dobDate.toISOString().slice(0, 10) === dob && dob < todayIso;
    return {
      A: pick([
        [t('register.fullName'), f.name.trim()],
        [`${t('register.aadhaarNumber')} (${t('register.digits12')})`, f.aadhaar_number.replace(/\D/g, '').length === 12],
        [`${t('register.aadhaarProof')} (JPEG/PNG/PDF)`, !!f.aadhaar_proof],
        [t('register.primaryMobile'), isValidMobile(f.mobile)],
        [`${t('register.dob')} (YYYY-MM-DD, ${t('register.dobPast')})`, dobOk],
        [t('register.address'), f.address.trim()],
        [t('register.email'), isValidEmail(f.email)],
        // Edit mode: blank keeps the current password.
        [`${t('register.password')} (${t('register.min6')})`, f.password.length >= 6 || (isEdit && f.password === '')],
      ]),
      B: pick([
        [t('register.sampradaya'), sampradaya], [t('register.agama'), agama],
      ]),
      C: pick([
        [t('register.yearsExperience'), f.years_of_experience.trim() !== '' && Number(f.years_of_experience) >= 0],
        [t('register.languagesKnown'), f.languages.length > 0],
        [t('register.priestType'), f.priest_type],
        [t('register.templeName'), f.priest_type !== 'temple' || f.temple_name.trim()],
      ]),
      // Danas alone don't count — at least one service from another category is required.
      D: pick([[t('register.needNonDanaService'), cats.some(c => c !== DANA_CATEGORY)]]),
    };
  }, [f, sampradaya, agama, catalog, services, t, todayIso, isEdit]);

  const toggleLang = (l: string) => set('languages')(
    f.languages.includes(l) ? f.languages.filter(x => x !== l) : [...f.languages, l],
  );

  const fetchLocation = async () => {
    setLocBusy(true); setError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('Location permission denied. Enter address manually.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setF(p => ({ ...p, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
      try {
        const rev = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        if (rev?.[0]) {
          const r = rev[0];
          const parts = [r.name, r.street, r.city, r.region, r.postalCode].filter(Boolean);
          setF(p => ({ ...p, address: parts.join(', ') }));
        }
      } catch {}
    } catch {
      setError('Could not fetch location. Enter address manually.');
    } finally { setLocBusy(false); }
  };

  const addPhoto = async () => {
    setPhotoBusy(true); setError('');
    try {
      const uri = await pickProfilePhoto();
      if (uri) set('photo_url')(uri);
    } catch (e: any) {
      setError(e.message || 'Could not add photo');
    } finally { setPhotoBusy(false); }
  };

  const addAadhaarProof = async () => {
    setProofBusy(true); setError('');
    try {
      const proof = await pickAadhaarProof();
      if (proof) {
        setF(p => ({ ...p, aadhaar_proof: proof.dataUri, aadhaar_proof_name: `${proof.name} (${proof.sizeKB} KB)` }));
      }
    } catch (e: any) {
      setError(e.message || 'Could not attach Aadhaar proof');
    } finally { setProofBusy(false); }
  };

  const addAgamaCertificate = async () => {
    setCertBusy(true); setError('');
    try {
      const doc = await pickProofDocument('agama-certificate');
      if (doc) {
        setF(p => ({ ...p, agama_certificate: doc.dataUri, agama_certificate_name: `${doc.name} (${doc.sizeKB} KB)` }));
      }
    } catch (e: any) {
      setError(e.message || 'Could not attach Agama certificate');
    } finally { setCertBusy(false); }
  };

  const requiredSectionsDone = Object.values(missingBySection).every(m => m.length === 0);

  // A filled-in field with a malformed value shows its error under the field;
  // empty optional fields are fine.
  const fieldError = (value: string, valid: (v: string) => boolean, msgKey: string) =>
    value.trim() && !valid(value) ? t(msgKey) : undefined;
  const mobileError = fieldError(f.mobile, isValidMobile, 'register.invalidMobile');
  const emailError = fieldError(f.email, isValidEmail, 'register.invalidEmail');
  const altMobileError = fieldError(f.alt_mobile, isValidMobile, 'register.invalidMobile');
  const altEmailError = fieldError(f.optional_email, isValidEmail, 'register.invalidEmail');

  const submit = async () => {
    const missing = Object.values(missingBySection).flat();
    // The optional contact fields only block submit when filled in incorrectly.
    if (altMobileError) missing.push(t('register.altMobile'));
    if (altEmailError) missing.push(t('register.altEmail'));
    if (missing.length) { setError(`${t('register.stillRequired')} ${missing.join(', ')}`); return; }

    const yn = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);
    const payload = {
      email: f.email.trim().toLowerCase(), password: f.password,
      name: f.name.trim(), photo_url: f.photo_url,
      aadhaar_number: f.aadhaar_number.replace(/\D/g, ''),
      aadhaar_proof: f.aadhaar_proof, aadhaar_proof_name: f.aadhaar_proof_name,
      mobile: f.mobile.trim(), address: f.address.trim(), date_of_birth: f.date_of_birth.trim(),
      latitude: f.latitude, longitude: f.longitude,
      sampradaya, agama,
      years_of_experience: Number(f.years_of_experience),
      languages: f.languages, priest_type: f.priest_type,
      temple_name: f.temple_name.trim(), temple_address: f.temple_address.trim(),
      temple_deity: f.temple_deity.trim(), temple_designation: f.temple_designation,
      services: Array.from(services),
      alt_mobile: f.alt_mobile.trim(), optional_email: f.optional_email.trim(),
      agama_certification: f.agama_certification.trim(),
      agama_certificate: f.agama_certificate, agama_certificate_name: f.agama_certificate_name,
      veda_patashala: f.veda_patashala.trim(), guru_name: f.guru_name.trim(),
      years_temple_service: f.years_temple_service.trim() === '' ? null : Number(f.years_temple_service),
      travel_availability: yn(f.travel_availability), online_consultation: yn(f.online_consultation),
    };

    setError(''); setBusy(true);
    try {
      if (isEdit) {
        // Same fields as registration. Blank password = keep the current one;
        // files are only sent when replaced ("" removes the Agama certificate).
        const changes: Record<string, any> = { ...payload };
        if (!f.password) delete changes.password;
        if (f.aadhaar_proof === loaded.aadhaar_proof) { delete changes.aadhaar_proof; delete changes.aadhaar_proof_name; }
        if (f.agama_certificate === loaded.agama_certificate) { delete changes.agama_certificate; delete changes.agama_certificate_name; }
        else if (!f.agama_certificate) changes.agama_certificate = '';
        await updateProfile(changes);
        router.back();
      } else {
        // Creates the priest account + priest_registration record. The account
        // is inactive until an admin approves it, so go to the pending screen.
        await registerPriest(payload);
        router.replace('/priest-pending');
      }
    } catch (e: any) {
      setError(e.message || (isEdit ? 'Could not save profile' : 'Registration failed'));
    } finally { setBusy(false); }
  };

  if (loadingProfile) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color="#FFF" /></Pressable>
          <Text style={[styles.headerTitle, { flex: 1 }]}>{t('profile.title')}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.darkRed} />
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID={isEdit ? 'priest-profile-edit' : 'priest-register-screen'}>
      <View style={styles.headerBar}>
        {isEdit
          ? <Pressable onPress={() => router.back()} style={styles.backBtn} testID="btn-profile-back"><Ionicons name="arrow-back" size={20} color="#FFF" /></Pressable>
          : <View style={styles.logoBadge}><Text style={styles.logoY}>Y</Text></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isEdit ? t('profile.title') : t('register.title')}</Text>
          {isEdit ? null : <Text style={styles.headerSub}>{t('register.subtitle')}</Text>}
        </View>
        <LanguagePicker tint="#FFF" compact />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error} testID="priest-register-error">{error}</Text> : null}

          {/* ---------- A. Personal Information ---------- */}
          <Section id="A" missing={missingBySection.A} title={t('register.sectionA')} open={openSection} onToggle={setOpenSection}>
            <View style={styles.photoRow}>
              {f.photo_url
                ? <Image source={{ uri: f.photo_url }} style={styles.photo} contentFit="cover" />
                : <View style={[styles.photo, styles.photoEmpty]}><Ionicons name="person" size={28} color={colors.gray400} /></View>}
              <Pressable onPress={addPhoto} disabled={photoBusy} style={styles.photoBtn}>
                {photoBusy ? <ActivityIndicator size="small" color={colors.orange} />
                  : <Ionicons name="camera" size={15} color={colors.orange} />}
                <Text style={styles.photoBtnText}>{f.photo_url ? t('dashboard.changePhoto') : t('register.addPhoto', { defaultValue: 'Add profile photo' })}</Text>
              </Pressable>
            </View>

            <Input label={t('register.fullName') + ' *'} value={f.name} onChange={set('name')} placeholder={t('register.fullName')} />
            <Input label={t('register.aadhaarNumber') + ' *'} value={f.aadhaar_number} onChange={set('aadhaar_number')} placeholder={t('register.aadhaarNumber')} keyboardType="number-pad" maxLength={14} />

            <View style={styles.field}>
              <Text style={styles.label}>{t('register.aadhaarProof')} * · {t('register.aadhaarProofHint')}</Text>
              <Pressable onPress={addAadhaarProof} disabled={proofBusy} style={styles.uploadBtn}>
                {proofBusy
                  ? <ActivityIndicator size="small" color={colors.orange} />
                  : <Ionicons name={f.aadhaar_proof ? 'document-attach' : 'cloud-upload-outline'} size={16} color={colors.orange} />}
                <Text style={styles.uploadBtnText} numberOfLines={1}>
                  {f.aadhaar_proof ? (f.aadhaar_proof_name || t('register.fileAttached', { defaultValue: 'File attached' })) : t('register.uploadProof')}
                </Text>
              </Pressable>
              {f.aadhaar_proof ? (
                <Pressable onPress={() => setF(p => ({ ...p, aadhaar_proof: null, aadhaar_proof_name: '' }))}>
                  <Text style={styles.removeText}>{t('common.remove')}</Text>
                </Pressable>
              ) : null}
            </View>

            <Input label={t('register.primaryMobile') + ' *'} value={f.mobile} onChange={set('mobile')} placeholder="+91 98765 43210" keyboardType="phone-pad" maxLength={16} error={mobileError} />
            <Input label={t('register.dob') + ' *'} value={f.date_of_birth} onChange={(v: string) => set('date_of_birth')(formatDob(v))} placeholder="YYYY-MM-DD" keyboardType="number-pad" maxLength={10} />

            <View style={styles.field}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>{t('register.address')} *</Text>
                <Pressable onPress={fetchLocation} disabled={locBusy} style={styles.inlineBtn}>
                  {locBusy ? <ActivityIndicator size="small" color={colors.orange} /> : <Ionicons name="location" size={13} color={colors.orange} />}
                  <Text style={styles.inlineBtnText}>{locBusy ? t('common.loading') : t('register.useLocation')}</Text>
                </Pressable>
              </View>
              <TextInput value={f.address} onChangeText={set('address')} placeholder={t('register.address')}
                style={[styles.input, styles.inputMulti]} placeholderTextColor={colors.gray400} multiline />
              {f.latitude != null && f.longitude != null &&
                <Text style={styles.coord}>📍 {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}</Text>}
            </View>

            <View style={styles.divider} />
            <Text style={styles.subhead}>{t('register.accountForLogin')}</Text>
            <Input label={t('register.email', { defaultValue: 'Email' }) + ' *'} value={f.email} onChange={set('email')} placeholder="you@example.com" keyboardType="email-address" error={emailError} />
            {isEdit
              ? <Input label={t('register.newPassword')} value={f.password} onChange={set('password')} placeholder={t('register.newPasswordHint')} secure />
              : <Input label={t('register.password', { defaultValue: 'Password' }) + ' *'} value={f.password} onChange={set('password')} placeholder={t('devoteeReg.passwordPlaceholder')} secure />}
          </Section>

          {/* ---------- B. Religious Lineage & Vedic Details ---------- */}
          <Section id="B" missing={missingBySection.B} title={t('register.sectionB')} open={openSection} onToggle={setOpenSection}>
            <ChipField label={t('register.sampradaya') + ' *'} options={SAMPRADAYA} value={f.sampradaya} onChange={set('sampradaya')}
              labels={(o) => t('options.sampradaya.' + o, { defaultValue: o })} />
            {f.sampradaya === 'Other' &&
              <Input label={t('register.sampradaya') + ' *'} value={f.sampradaya_other} onChange={set('sampradaya_other')} placeholder={t('register.enterHere')} />}
            <ChipField label={t('register.agama') + ' *'} options={AGAMA} value={f.agama} onChange={set('agama')}
              labels={(o) => t('options.agama.' + o, { defaultValue: o })} />
            {f.agama === 'Other' &&
              <Input label={t('register.agama') + ' *'} value={f.agama_other} onChange={set('agama_other')} placeholder={t('register.enterHere')} />}

          </Section>

          {/* ---------- C. Professional Details ---------- */}
          <Section id="C" missing={missingBySection.C} title={t('register.sectionC')} open={openSection} onToggle={setOpenSection}>
            <Input label={t('register.yearsExperience') + ' *'} value={f.years_of_experience} onChange={set('years_of_experience')} placeholder="e.g. 12" keyboardType="number-pad" maxLength={2} />

            <View style={styles.field}>
              <Text style={styles.label}>{t('register.languagesKnown')} *</Text>
              <View style={styles.chipWrap}>
                {LANGUAGES.map(l => (
                  <Pressable key={l} onPress={() => toggleLang(l)} style={[styles.chip, f.languages.includes(l) && styles.chipOn]}>
                    <Text style={[styles.chipText, f.languages.includes(l) && styles.chipTextOn]}>{t('options.plang.' + l, { defaultValue: l })}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('register.priestType')} *</Text>
              <View style={styles.chipWrap}>
                {[['independent', t('register.independentPriest')], ['temple', t('register.templePriest')]].map(([k, lbl]) => (
                  <Pressable key={k} onPress={() => set('priest_type')(k as any)} style={[styles.chip, f.priest_type === k && styles.chipOn]}>
                    <Text style={[styles.chipText, f.priest_type === k && styles.chipTextOn]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {f.priest_type === 'temple' && (
              <View style={styles.templeBox}>
                <Input label={t('register.templeName') + ' *'} value={f.temple_name} onChange={set('temple_name')} placeholder={t('register.templeNamePlaceholder')} />
                <Input label={t('register.templeAddress')} value={f.temple_address} onChange={set('temple_address')} placeholder={t('register.templeAddress')} />
                <Input label={t('register.templeDeity')} value={f.temple_deity} onChange={set('temple_deity')} placeholder={t('register.templeDeity')} />
                <ChipField label={t('register.designation')} options={DESIGNATION} value={f.temple_designation} onChange={set('temple_designation')}
                  labels={(o) => t('options.designation.' + o, { defaultValue: o })} />
              </View>
            )}
          </Section>

          {/* ---------- D. Service Categories ---------- */}
          <Section id="D" missing={missingBySection.D} title={`${t('register.sectionD')}  (${services.size})`} open={openSection} onToggle={setOpenSection}>
            <Text style={styles.hint}>{t('register.servicesHint')}</Text>
            {catalog.length === 0
              ? <Text style={styles.loading}>{t('catalog.ui.loadingCatalog')}</Text>
              : <ServiceCategoryPicker catalog={catalog} selected={services} onChange={setServices} order={CATEGORY_ORDER} />}
          </Section>

          {/* ---------- Optional Information ---------- */}
          <Section id="E" title={t('register.sectionE')} open={openSection} onToggle={setOpenSection}>
            <Input label={t('register.altMobile')} value={f.alt_mobile} onChange={set('alt_mobile')} placeholder="+91 …" keyboardType="phone-pad" maxLength={16} error={altMobileError} />
            <Input label={t('register.altEmail')} value={f.optional_email} onChange={set('optional_email')} placeholder="alt@example.com" keyboardType="email-address" error={altEmailError} />
            <Input label={t('register.agamaCert')} value={f.agama_certification} onChange={set('agama_certification')} placeholder={t('register.enterHere')} />
            <View style={styles.field}>
              <Text style={styles.label}>{t('register.agamaCert')} · {t('register.aadhaarProofHint')}</Text>
              <Pressable onPress={addAgamaCertificate} disabled={certBusy} style={styles.uploadBtn} testID="btn-upload-agama-cert">
                {certBusy
                  ? <ActivityIndicator size="small" color={colors.orange} />
                  : <Ionicons name={f.agama_certificate ? 'document-attach' : 'cloud-upload-outline'} size={16} color={colors.orange} />}
                <Text style={styles.uploadBtnText} numberOfLines={1}>
                  {f.agama_certificate ? (f.agama_certificate_name || t('register.fileAttached', { defaultValue: 'File attached' })) : t('register.uploadAgamaCert')}
                </Text>
              </Pressable>
              {f.agama_certificate ? (
                <Pressable onPress={() => setF(p => ({ ...p, agama_certificate: null, agama_certificate_name: '' }))}>
                  <Text style={styles.removeText}>{t('common.remove')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Input label={t('register.vedaPatashala')} value={f.veda_patashala} onChange={set('veda_patashala')} placeholder={t('register.enterHere')} />
            <Input label={t('register.guruName')} value={f.guru_name} onChange={set('guru_name')} placeholder={t('register.enterHere')} />
            <Input label={t('register.yearsTempleService')} value={f.years_temple_service} onChange={set('years_temple_service')} placeholder="e.g. 8" keyboardType="number-pad" maxLength={2} />
            <YesNo label={t('register.travelAvailability', { defaultValue: 'Travel availability' })} value={f.travel_availability} onChange={set('travel_availability')} yesLabel={t('options.yes')} noLabel={t('options.no')} />
            <YesNo label={t('register.onlineConsult', { defaultValue: 'Online consultation availability' })} value={f.online_consultation} onChange={set('online_consultation')} yesLabel={t('options.yes')} noLabel={t('options.no')} />
          </Section>

          {/* Enabled only once sections A–D all show their green tick; Optional Information doesn't gate it. */}
          {!requiredSectionsDone && <Text style={styles.submitLockedHint} testID="priest-submit-locked">{t(isEdit ? 'register.saveLocked' : 'register.submitLocked')}</Text>}
          <Pressable onPress={submit} disabled={busy || !requiredSectionsDone} accessibilityState={{ disabled: busy || !requiredSectionsDone }}
            style={({ pressed }) => [styles.cta, !requiredSectionsDone && styles.ctaDisabled, (pressed || busy) && { opacity: 0.85 }]} testID="btn-priest-submit">
            <Text style={[styles.ctaText, !requiredSectionsDone && styles.ctaTextDisabled]}>
              {isEdit ? (busy ? t('profile.saving') : t('profile.saveChanges')) : (busy ? t('register.registering') : t('register.submit'))}
            </Text>
          </Pressable>
          <Text style={styles.footNote}>{t('register.mandatoryNote')}</Text>

          {isEdit ? null : (
            <Pressable onPress={() => router.push('/login?role=priest')} style={styles.loginLink} testID="btn-priest-login-link">
              <Text style={styles.loginLinkText}>{t('register.alreadyRegistered')}  <Text style={styles.loginLinkStrong}>{t('register.priestLogin')} →</Text></Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ----------------------------- sub-components ----------------------------- */

// Date of birth is typed as digits only; the dashes are inserted automatically
// (19850423 -> 1985-04-23). Deleting works naturally since only digits are kept.
function formatDob(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

// `missing` lists the section's mandatory fields that aren't filled yet: empty
// shows a green tick; otherwise the open section lists what is still required.
// Sections without mandatory fields omit it.
function Section({ id, title, open, onToggle, missing, children }: {
  id: string; title: string; open: string; onToggle: (v: string) => void; missing?: string[]; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const isOpen = open === id;
  const complete = !!missing && missing.length === 0;
  return (
    <View style={[styles.section, complete && styles.sectionComplete]}>
      <Pressable onPress={() => onToggle(isOpen ? '' : id)} style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {complete && <Ionicons name="checkmark-circle" size={22} color={SECTION_DONE_GREEN} style={styles.sectionTick} testID={`section-${id}-complete`} />}
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.navy} />
      </Pressable>
      {isOpen && (
        <View style={styles.sectionBody}>
          {children}
          {missing && missing.length > 0 && (
            <View style={styles.stillRequired} testID={`section-${id}-missing`}>
              <Text style={styles.stillRequiredTitle}>{t('register.stillRequired')}</Text>
              {missing.map(m => <Text key={m} style={styles.stillRequiredItem}>• {m}</Text>)}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// `error` (optional) is shown in red under the field, with a red border.
function Input({ label, value, onChange, placeholder, secure, keyboardType, maxLength, error }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.gray400}
        secureTextEntry={secure} keyboardType={keyboardType} maxLength={maxLength}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={keyboardType === 'email-address' ? false : undefined}
        style={[styles.input, error && styles.inputError]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// `labels` maps a canonical option value -> its display label (translated).
// The stored value is always the canonical English string.
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

/* -------------------------------- styles -------------------------------- */

const SECTION_DONE_GREEN = '#16A34A';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: colors.primaryRed,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  logoY: { color: colors.darkRed, fontSize: 20, fontWeight: '800' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  content: { padding: 16, paddingBottom: 48 },

  error: {
    backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md,
    marginBottom: 12, fontSize: 13, borderWidth: 1, borderColor: colors.red100,
  },

  section: { backgroundColor: '#FFF', borderRadius: radius.md, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray200 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#FFF8E7' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.navy, flex: 1 },
  sectionComplete: { borderColor: SECTION_DONE_GREEN },
  sectionTick: { marginRight: 8 },
  stillRequired: { marginTop: 4, padding: 10, borderRadius: radius.sm, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: colors.amber100 },
  stillRequiredTitle: { fontSize: 12, fontWeight: '800', color: colors.amber800, marginBottom: 4 },
  stillRequiredItem: { fontSize: 12, color: colors.amber700, lineHeight: 18 },
  sectionBody: { padding: 14, paddingTop: 4 },

  field: { marginBottom: 12 },
  label: { fontSize: 12, color: colors.gray600, marginBottom: 6, fontWeight: '700' },
  subhead: { fontSize: 12, fontWeight: '800', color: colors.darkRed, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#FBFBFB', fontSize: 14, color: colors.gray800,
  },
  inputMulti: { minHeight: 58, textAlignVertical: 'top' },
  inputError: { borderColor: colors.red500 },
  fieldError: { fontSize: 11.5, color: colors.red600, fontWeight: '600', marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.gray200, marginVertical: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coord: { fontSize: 11, color: colors.gray500, marginTop: 4 },
  hint: { fontSize: 12, color: colors.gray500, marginBottom: 10 },
  loading: { fontSize: 12, color: colors.gray500 },
  footNote: { fontSize: 11, color: colors.gray500, textAlign: 'center', marginTop: 10 },
  loginLink: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  loginLinkText: { fontSize: 13, color: colors.gray600 },
  loginLinkStrong: { color: colors.darkRed, fontWeight: '800' },

  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  inlineBtnText: { fontSize: 11, color: colors.orange, fontWeight: '700' },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  photo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gray100 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray200 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.orange, backgroundColor: '#FFF7ED' },
  photoBtnText: { fontSize: 12, color: colors.orangeDark, fontWeight: '700' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.orange, backgroundColor: '#FFF7ED' },
  uploadBtnText: { flex: 1, fontSize: 12, color: colors.orangeDark, fontWeight: '700' },
  removeText: { fontSize: 11, color: colors.red600, fontWeight: '700', marginTop: 6 },

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
  selectAllRow: { alignSelf: 'flex-start', paddingVertical: 6 },
  selectAllText: { fontSize: 11, fontWeight: '800', color: colors.orange },
  subLabel: { fontSize: 11, fontWeight: '800', color: colors.gray500, marginTop: 8, marginBottom: 4, textTransform: 'uppercase' },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  svcRowOn: { backgroundColor: '#FFF7ED' },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  svcName: { flex: 1, fontSize: 13, color: colors.gray800 },

  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  ctaDisabled: { backgroundColor: colors.gray300 },
  ctaTextDisabled: { color: colors.gray500 },
  submitLockedHint: { fontSize: 12, fontWeight: '700', color: colors.amber700, textAlign: 'center', marginBottom: 8 },
});

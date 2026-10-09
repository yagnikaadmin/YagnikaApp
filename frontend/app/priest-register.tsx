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
import { pickAadhaarProof } from '@/src/utils/pickAadhaarProof';
import ServiceCategoryPicker from '@/src/components/ServiceCategoryPicker';
import LanguagePicker from '@/src/components/LanguagePicker';
import { CATEGORY_ORDER } from '@/src/i18n/catalog';

// ---------------------------------------------------------------------------
// Yagnika (Priest) Registration — the only active flow in this build.
// Devotee / Admin screens remain in the codebase but are not routed to.
// On submit the record is written to the `priest_registration` collection
// (and `users`) by POST /api/auth/register-priest.
// ---------------------------------------------------------------------------

interface Svc { id: string; name: string; category?: string | null; subcategory?: string | null; }

const SAMPRADAYA = ['Smarta', 'Vaishnava', 'Shaiva', 'Shakta', 'Madhwa', 'Other'];
const AGAMA = ['Vaikhanasa', 'Pancharatra', 'Shaiva Agama', 'Shakta Agama', 'Other'];
const VEDA = ['Rig Veda', 'Yajur Veda', 'Sama Veda', 'Atharva Veda'];
const LANGUAGES = ['Sanskrit', 'Telugu', 'Tamil', 'Kannada', 'Hindi', 'English', 'Others'];
const DESIGNATION = ['Chief Priest', 'Archaka', 'Assistant Archaka', 'Paricharaka', 'Veda Pandit'];
const AVAILABILITY = ['Daily', 'Weekly', 'Festival Only'];

type FormState = {
  // account
  email: string; password: string;
  // A. personal
  name: string; photo_url: string | null; aadhaar_number: string; mobile: string;
  aadhaar_proof: string | null; aadhaar_proof_name: string;
  address: string; date_of_birth: string; latitude: number | null; longitude: number | null;
  // B. lineage & vedic
  sampradaya: string; sampradaya_other: string;
  agama: string; agama_other: string;
  veda: string; sutra: string; gotra: string; pravara: string; abhivadanam: string;
  // C. professional
  years_of_experience: string; languages: string[];
  priest_type: 'independent' | 'temple' | '';
  temple_name: string; temple_address: string; temple_deity: string; temple_designation: string;
  // optional
  alt_mobile: string; optional_email: string; certifications: string; agama_certification: string;
  veda_patashala: string; guru_name: string; awards: string; years_temple_service: string;
  availability: string; travel_availability: '' | 'yes' | 'no'; online_consultation: '' | 'yes' | 'no';
};

const EMPTY: FormState = {
  email: '', password: '',
  name: '', photo_url: null, aadhaar_number: '', mobile: '',
  aadhaar_proof: null, aadhaar_proof_name: '',
  address: '', date_of_birth: '',
  latitude: null, longitude: null,
  sampradaya: '', sampradaya_other: '', agama: '', agama_other: '',
  veda: '', sutra: '', gotra: '', pravara: '', abhivadanam: '',
  years_of_experience: '', languages: [], priest_type: '',
  temple_name: '', temple_address: '', temple_deity: '', temple_designation: '',
  alt_mobile: '', optional_email: '', certifications: '', agama_certification: '',
  veda_patashala: '', guru_name: '', awards: '', years_temple_service: '',
  availability: '', travel_availability: '', online_consultation: '',
};

export default function PriestRegister() {
  const router = useRouter();
  const { t } = useTranslation();
  const { registerPriest } = useAuth();
  const [f, setF] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF(p => ({ ...p, [k]: v }));

  const [catalog, setCatalog] = useState<Svc[]>([]);
  const [services, setServices] = useState<Set<string>>(new Set());
  const [openSection, setOpenSection] = useState<string>('A');
  const [locBusy, setLocBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/poojas').then(r => r.json()).then((rows: Svc[]) => setCatalog(rows.filter(r => r.category))).catch(() => {});
  }, []);

  // at least one main category is covered by the selection
  const categoriesSelected = useMemo(() => {
    const byId = new Map(catalog.map(s => [s.id, s.category]));
    return new Set(Array.from(services).map(id => byId.get(id)).filter(Boolean)).size;
  }, [catalog, services]);

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

  const submit = async () => {
    const sampradaya = f.sampradaya === 'Other' ? f.sampradaya_other.trim() : f.sampradaya;
    const agama = f.agama === 'Other' ? f.agama_other.trim() : f.agama;
    const req: [string, any][] = [
      ['Full Name', f.name.trim()], ['Email', f.email.trim()], ['Password (min 6)', f.password.length >= 6],
      ['Aadhaar Number (12 digits)', f.aadhaar_number.replace(/\D/g, '').length === 12],
      ['Aadhaar ID Proof (JPEG/PNG/PDF)', !!f.aadhaar_proof],
      ['Primary Mobile', f.mobile.trim()], ['Residential Address', f.address.trim()],
      ['Date of Birth (YYYY-MM-DD)', /^\d{4}-\d{2}-\d{2}$/.test(f.date_of_birth.trim())],
      ['Sampradaya', sampradaya], ['Agama', agama], ['Veda', f.veda],
      ['Sutra', f.sutra.trim()], ['Gotra', f.gotra.trim()], ['Pravara', f.pravara.trim()],
      ['Years of Experience', f.years_of_experience.trim() !== '' && Number(f.years_of_experience) >= 0],
      ['At least one Language', f.languages.length > 0],
      ['Type of Priest', f.priest_type],
    ];
    const missing = req.filter(([, v]) => !v).map(([k]) => k);
    if (f.priest_type === 'temple' && !f.temple_name.trim()) missing.push('Temple Name');
    if (categoriesSelected === 0) missing.push('At least one main service category');
    if (missing.length) { setError('Please complete: ' + missing.join(', ')); return; }

    const yn = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);
    const payload = {
      email: f.email.trim().toLowerCase(), password: f.password,
      name: f.name.trim(), photo_url: f.photo_url,
      aadhaar_number: f.aadhaar_number.replace(/\D/g, ''),
      aadhaar_proof: f.aadhaar_proof, aadhaar_proof_name: f.aadhaar_proof_name,
      mobile: f.mobile.trim(), address: f.address.trim(), date_of_birth: f.date_of_birth.trim(),
      latitude: f.latitude, longitude: f.longitude,
      sampradaya, agama, veda: f.veda, sutra: f.sutra.trim(),
      gotra: f.gotra.trim(), pravara: f.pravara.trim(), abhivadanam: f.abhivadanam.trim(),
      years_of_experience: Number(f.years_of_experience),
      languages: f.languages, priest_type: f.priest_type,
      temple_name: f.temple_name.trim(), temple_address: f.temple_address.trim(),
      temple_deity: f.temple_deity.trim(), temple_designation: f.temple_designation,
      services: Array.from(services),
      alt_mobile: f.alt_mobile.trim(), optional_email: f.optional_email.trim(),
      certifications: f.certifications.trim(), agama_certification: f.agama_certification.trim(),
      veda_patashala: f.veda_patashala.trim(), guru_name: f.guru_name.trim(), awards: f.awards.trim(),
      years_temple_service: f.years_temple_service.trim() === '' ? null : Number(f.years_temple_service),
      availability: f.availability,
      travel_availability: yn(f.travel_availability), online_consultation: yn(f.online_consultation),
    };

    setError(''); setBusy(true);
    try {
      // Creates the priest account + priest_registration record. The account
      // is inactive until an admin approves it, so go to the pending screen.
      await registerPriest(payload);
      router.replace('/priest-pending');
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally { setBusy(false); }
  };


  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="priest-register-screen">
      <View style={styles.headerBar}>
        <View style={styles.logoBadge}><Text style={styles.logoY}>Y</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('register.title')}</Text>
          <Text style={styles.headerSub}>{t('register.subtitle')}</Text>
        </View>
        <LanguagePicker tint="#FFF" compact />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error} testID="priest-register-error">{error}</Text> : null}

          {/* ---------- A. Personal Information ---------- */}
          <Section id="A" title={t('register.sectionA')} open={openSection} onToggle={setOpenSection}>
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

            <Input label={t('register.primaryMobile') + ' *'} value={f.mobile} onChange={set('mobile')} placeholder="+91 98765 43210" keyboardType="phone-pad" />
            <Input label={t('register.dob') + ' *'} value={f.date_of_birth} onChange={set('date_of_birth')} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />

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
            <Input label={t('register.email', { defaultValue: 'Email' }) + ' *'} value={f.email} onChange={set('email')} placeholder="you@example.com" keyboardType="email-address" />
            <Input label={t('register.password', { defaultValue: 'Password' }) + ' *'} value={f.password} onChange={set('password')} placeholder={t('devoteeReg.passwordPlaceholder')} secure />
          </Section>

          {/* ---------- B. Religious Lineage & Vedic Details ---------- */}
          <Section id="B" title={t('register.sectionB')} open={openSection} onToggle={setOpenSection}>
            <ChipField label={t('register.sampradaya') + ' *'} options={SAMPRADAYA} value={f.sampradaya} onChange={set('sampradaya')}
              labels={(o) => t('options.sampradaya.' + o, { defaultValue: o })} />
            {f.sampradaya === 'Other' &&
              <Input label={t('register.sampradaya') + ' *'} value={f.sampradaya_other} onChange={set('sampradaya_other')} placeholder={t('register.enterHere')} />}
            <ChipField label={t('register.agama') + ' *'} options={AGAMA} value={f.agama} onChange={set('agama')}
              labels={(o) => t('options.agama.' + o, { defaultValue: o })} />
            {f.agama === 'Other' &&
              <Input label={t('register.agama') + ' *'} value={f.agama_other} onChange={set('agama_other')} placeholder={t('register.enterHere')} />}

            <View style={styles.divider} />
            <Text style={styles.subhead}>{t('register.vedicDetails')}</Text>
            <ChipField label={t('register.veda') + ' *'} options={VEDA} value={f.veda} onChange={set('veda')}
              labels={(o) => t('options.veda.' + o, { defaultValue: o })} />
            <Input label={t('register.sutra') + ' *'} value={f.sutra} onChange={set('sutra')} placeholder="e.g. Apastamba / Bodhayana" />
            <Input label={t('register.gotra') + ' *'} value={f.gotra} onChange={set('gotra')} placeholder="e.g. Bharadwaja" />
            <Input label={t('register.pravara') + ' *'} value={f.pravara} onChange={set('pravara')} placeholder="e.g. Angirasa, Barhaspatya, Bharadwaja" />
            <Input label={t('register.abhivadanam')} value={f.abhivadanam} onChange={set('abhivadanam')} placeholder={t('register.abhivadanam')} />
          </Section>

          {/* ---------- C. Professional Details ---------- */}
          <Section id="C" title={t('register.sectionC')} open={openSection} onToggle={setOpenSection}>
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
          <Section id="D" title={`${t('register.sectionD')}  (${services.size})`} open={openSection} onToggle={setOpenSection}>
            <Text style={styles.hint}>{t('register.servicesHint')}</Text>
            {catalog.length === 0
              ? <Text style={styles.loading}>{t('catalog.ui.loadingCatalog')}</Text>
              : <ServiceCategoryPicker catalog={catalog} selected={services} onChange={setServices} order={CATEGORY_ORDER} />}
          </Section>

          {/* ---------- Optional Information ---------- */}
          <Section id="E" title={t('register.sectionE')} open={openSection} onToggle={setOpenSection}>
            <Input label={t('register.altMobile')} value={f.alt_mobile} onChange={set('alt_mobile')} placeholder="+91 …" keyboardType="phone-pad" />
            <Input label={t('register.altEmail')} value={f.optional_email} onChange={set('optional_email')} placeholder="alt@example.com" keyboardType="email-address" />
            <Input label={t('register.certifications')} value={f.certifications} onChange={set('certifications')} placeholder={t('register.enterHere')} />
            <Input label={t('register.agamaCert')} value={f.agama_certification} onChange={set('agama_certification')} placeholder={t('register.enterHere')} />
            <Input label={t('register.vedaPatashala')} value={f.veda_patashala} onChange={set('veda_patashala')} placeholder={t('register.enterHere')} />
            <Input label={t('register.guruName')} value={f.guru_name} onChange={set('guru_name')} placeholder={t('register.enterHere')} />
            <Input label={t('register.awards')} value={f.awards} onChange={set('awards')} placeholder={t('register.enterHere')} />
            <Input label={t('register.yearsTempleService')} value={f.years_temple_service} onChange={set('years_temple_service')} placeholder="e.g. 8" keyboardType="number-pad" maxLength={2} />
            <ChipField label={t('profile.availability')} options={AVAILABILITY} value={f.availability} onChange={set('availability')}
              labels={(o) => t('options.availability.' + o, { defaultValue: o })} />
            <YesNo label={t('register.travelAvailability', { defaultValue: 'Travel availability' })} value={f.travel_availability} onChange={set('travel_availability')} yesLabel={t('options.yes')} noLabel={t('options.no')} />
            <YesNo label={t('register.onlineConsult', { defaultValue: 'Online consultation availability' })} value={f.online_consultation} onChange={set('online_consultation')} yesLabel={t('options.yes')} noLabel={t('options.no')} />
          </Section>

          <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]} testID="btn-priest-submit">
            <Text style={styles.ctaText}>{busy ? t('register.registering') : t('register.submit')}</Text>
          </Pressable>
          <Text style={styles.footNote}>{t('register.mandatoryNote')}</Text>

          <Pressable onPress={() => router.push('/login?role=priest')} style={styles.loginLink} testID="btn-priest-login-link">
            <Text style={styles.loginLinkText}>{t('register.alreadyRegistered')}  <Text style={styles.loginLinkStrong}>{t('register.priestLogin')} →</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function Section({ id, title, open, onToggle, children }: {
  id: string; title: string; open: string; onToggle: (v: string) => void; children: React.ReactNode;
}) {
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

function Input({ label, value, onChange, placeholder, secure, keyboardType, maxLength }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.gray400}
        secureTextEntry={secure} keyboardType={keyboardType} maxLength={maxLength}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={styles.input}
      />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14,
    backgroundColor: colors.primaryRed,
  },
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
  sectionBody: { padding: 14, paddingTop: 4 },

  field: { marginBottom: 12 },
  label: { fontSize: 12, color: colors.gray600, marginBottom: 6, fontWeight: '700' },
  subhead: { fontSize: 12, fontWeight: '800', color: colors.darkRed, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#FBFBFB', fontSize: 14, color: colors.gray800,
  },
  inputMulti: { minHeight: 58, textAlignVertical: 'top' },
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
});

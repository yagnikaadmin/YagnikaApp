import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { colors, radius } from '@/src/theme';
import { apiFetch, useAuth } from '@/src/context/AuthContext';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';

// ---------------------------------------------------------------------------
// Yagnika (Priest) Registration — the only active flow in this build.
// Devotee / Admin screens remain in the codebase but are not routed to.
// On submit the record is written to the `priest_registration` collection
// (and `users`) by POST /api/auth/register-priest.
// ---------------------------------------------------------------------------

interface Svc { id: string; name: string; category?: string | null; subcategory?: string | null; }

const SAMPRADAYA = ['Smarta', 'Vaishnava', 'Shaiva', 'Shakta', 'Madhwa', 'Sri Vaishnava', 'Other'];
const AGAMA = ['Vaikhanasa', 'Pancharatra', 'Shaiva Agama', 'Shakta Agama', 'Other'];
const VEDA = ['Rig Veda', 'Yajur Veda', 'Sama Veda', 'Atharva Veda'];
const LANGUAGES = ['Sanskrit', 'Telugu', 'Tamil', 'Kannada', 'Hindi', 'English', 'Others'];
const DESIGNATION = ['Chief Priest', 'Archaka', 'Assistant Archaka', 'Paricharaka', 'Veda Pandit'];
const AVAILABILITY = ['Daily', 'Weekly', 'Festival Only'];

const CATEGORY_ORDER = [
  'Poojas', 'Abhishekams', 'Alankarams', 'Homams / Havanas', 'Vratams',
  'Samskaras (Life-Cycle Rituals)', 'Antyeshti & Pitru Karmas', 'Temple Sevas',
  'Vanta Brahmin (Religious Cooking Services)', 'Paricharaka (Temple Support Services)',
  'Parayanams',
];

type FormState = {
  // account
  email: string; password: string;
  // A. personal
  name: string; photo_url: string | null; aadhaar_number: string; mobile: string;
  address: string; date_of_birth: string; latitude: number | null; longitude: number | null;
  // B. lineage & vedic
  sampradaya: string; sampradaya_other: string;
  agama: string; agama_other: string;
  veda: string; shakha: string; sutra: string; gotra: string; pravara: string; abhivadanam: string;
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
  name: '', photo_url: null, aadhaar_number: '', mobile: '', address: '', date_of_birth: '',
  latitude: null, longitude: null,
  sampradaya: '', sampradaya_other: '', agama: '', agama_other: '',
  veda: '', shakha: '', sutra: '', gotra: '', pravara: '', abhivadanam: '',
  years_of_experience: '', languages: [], priest_type: '',
  temple_name: '', temple_address: '', temple_deity: '', temple_designation: '',
  alt_mobile: '', optional_email: '', certifications: '', agama_certification: '',
  veda_patashala: '', guru_name: '', awards: '', years_temple_service: '',
  availability: '', travel_availability: '', online_consultation: '',
};

export default function PriestRegister() {
  const router = useRouter();
  const { registerPriest } = useAuth();
  const [f, setF] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setF(p => ({ ...p, [k]: v }));

  const [catalog, setCatalog] = useState<Svc[]>([]);
  const [services, setServices] = useState<Set<string>>(new Set());
  const [openSection, setOpenSection] = useState<string>('A');
  const [openCat, setOpenCat] = useState<string>('');
  const [locBusy, setLocBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/poojas').then(r => r.json()).then((rows: Svc[]) => setCatalog(rows.filter(r => r.category))).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const m: Record<string, Record<string, Svc[]>> = {};
    for (const s of catalog) {
      const cat = s.category as string;
      const sub = s.subcategory || '';
      (m[cat] ||= {});
      (m[cat][sub] ||= []).push(s);
    }
    return m;
  }, [catalog]);

  const cats = useMemo(
    () => CATEGORY_ORDER.filter(c => grouped[c]).concat(Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))),
    [grouped],
  );

  const toggleSvc = (id: string) => setServices(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const catIds = (cat: string) => Object.values(grouped[cat] || {}).flat().map(s => s.id);
  const catSelectedCount = (cat: string) => catIds(cat).filter(id => services.has(id)).length;
  const toggleCatAll = (cat: string) => setServices(prev => {
    const ids = catIds(cat); const n = new Set(prev);
    const allOn = ids.every(id => n.has(id));
    ids.forEach(id => (allOn ? n.delete(id) : n.add(id)));
    return n;
  });

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

  const submit = async () => {
    const sampradaya = f.sampradaya === 'Other' ? f.sampradaya_other.trim() : f.sampradaya;
    const agama = f.agama === 'Other' ? f.agama_other.trim() : f.agama;
    const req: [string, any][] = [
      ['Full Name', f.name.trim()], ['Email', f.email.trim()], ['Password (min 6)', f.password.length >= 6],
      ['Aadhaar Number (12 digits)', f.aadhaar_number.replace(/\D/g, '').length === 12],
      ['Primary Mobile', f.mobile.trim()], ['Residential Address', f.address.trim()],
      ['Date of Birth (YYYY-MM-DD)', /^\d{4}-\d{2}-\d{2}$/.test(f.date_of_birth.trim())],
      ['Sampradaya', sampradaya], ['Agama', agama], ['Veda', f.veda], ['Shakha', f.shakha.trim()],
      ['Sutra', f.sutra.trim()], ['Gotra', f.gotra.trim()], ['Pravara', f.pravara.trim()],
      ['Years of Experience', f.years_of_experience.trim() !== '' && Number(f.years_of_experience) >= 0],
      ['At least one Language', f.languages.length > 0],
      ['Type of Priest', f.priest_type],
    ];
    const missing = req.filter(([, v]) => !v).map(([k]) => k);
    if (f.priest_type === 'temple' && !f.temple_name.trim()) missing.push('Temple Name');
    if (services.size === 0) missing.push('At least one Service Category');
    if (missing.length) { setError('Please complete: ' + missing.join(', ')); return; }

    const yn = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null);
    const payload = {
      email: f.email.trim().toLowerCase(), password: f.password,
      name: f.name.trim(), photo_url: f.photo_url,
      aadhaar_number: f.aadhaar_number.replace(/\D/g, ''),
      mobile: f.mobile.trim(), address: f.address.trim(), date_of_birth: f.date_of_birth.trim(),
      latitude: f.latitude, longitude: f.longitude,
      sampradaya, agama, veda: f.veda, shakha: f.shakha.trim(), sutra: f.sutra.trim(),
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
      // Creates the priest account, records into priest_registration, and
      // persists the session (token + user) so the dashboard/profile work.
      await registerPriest(payload);
      router.replace('/priest-dashboard');
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    } finally { setBusy(false); }
  };

  const totalSel = services.size;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="priest-register-screen">
      <View style={styles.headerBar}>
        <View style={styles.logoBadge}><Text style={styles.logoY}>Y</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Yagnika Registration</Text>
          <Text style={styles.headerSub}>Priest onboarding & service selection</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error} testID="priest-register-error">{error}</Text> : null}

          {/* ---------- A. Personal Information ---------- */}
          <Section id="A" title="A · Personal Information" open={openSection} onToggle={setOpenSection}>
            <View style={styles.photoRow}>
              {f.photo_url
                ? <Image source={{ uri: f.photo_url }} style={styles.photo} contentFit="cover" />
                : <View style={[styles.photo, styles.photoEmpty]}><Ionicons name="person" size={28} color={colors.gray400} /></View>}
              <Pressable onPress={addPhoto} disabled={photoBusy} style={styles.photoBtn}>
                {photoBusy ? <ActivityIndicator size="small" color={colors.orange} />
                  : <Ionicons name="camera" size={15} color={colors.orange} />}
                <Text style={styles.photoBtnText}>{f.photo_url ? 'Change photo' : 'Add profile photo'}</Text>
              </Pressable>
            </View>

            <Input label="Full Name (as per official records) *" value={f.name} onChange={set('name')} placeholder="Full name" />
            <Input label="Aadhaar Number *" value={f.aadhaar_number} onChange={set('aadhaar_number')} placeholder="12-digit number" keyboardType="number-pad" maxLength={14} />
            <Input label="Primary Mobile Number *" value={f.mobile} onChange={set('mobile')} placeholder="+91 98765 43210" keyboardType="phone-pad" />
            <Input label="Date of Birth *" value={f.date_of_birth} onChange={set('date_of_birth')} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />

            <View style={styles.field}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>Residential Address *</Text>
                <Pressable onPress={fetchLocation} disabled={locBusy} style={styles.inlineBtn}>
                  {locBusy ? <ActivityIndicator size="small" color={colors.orange} /> : <Ionicons name="location" size={13} color={colors.orange} />}
                  <Text style={styles.inlineBtnText}>{locBusy ? 'Fetching…' : 'Use current location'}</Text>
                </Pressable>
              </View>
              <TextInput value={f.address} onChangeText={set('address')} placeholder="Street, City, State, PIN"
                style={[styles.input, styles.inputMulti]} placeholderTextColor={colors.gray400} multiline />
              {f.latitude != null && f.longitude != null &&
                <Text style={styles.coord}>📍 {f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}</Text>}
            </View>

            <View style={styles.divider} />
            <Text style={styles.subhead}>Account (for login)</Text>
            <Input label="Email *" value={f.email} onChange={set('email')} placeholder="you@example.com" keyboardType="email-address" />
            <Input label="Password *" value={f.password} onChange={set('password')} placeholder="At least 6 characters" secure />
          </Section>

          {/* ---------- B. Religious Lineage & Vedic Details ---------- */}
          <Section id="B" title="B · Religious Lineage & Vedic Details" open={openSection} onToggle={setOpenSection}>
            <ChipField label="Sampradaya *" options={SAMPRADAYA} value={f.sampradaya} onChange={set('sampradaya')} />
            {f.sampradaya === 'Other' &&
              <Input label="Specify Sampradaya *" value={f.sampradaya_other} onChange={set('sampradaya_other')} placeholder="Your sampradaya" />}
            <ChipField label="Agama Followed *" options={AGAMA} value={f.agama} onChange={set('agama')} />
            {f.agama === 'Other' &&
              <Input label="Specify Agama *" value={f.agama_other} onChange={set('agama_other')} placeholder="Your agama" />}

            <View style={styles.divider} />
            <Text style={styles.subhead}>Vedic Details</Text>
            <ChipField label="Veda *" options={VEDA} value={f.veda} onChange={set('veda')} />
            <Input label="Shakha *" value={f.shakha} onChange={set('shakha')} placeholder="e.g. Shukla Yajur / Taittiriya" />
            <Input label="Sutra *" value={f.sutra} onChange={set('sutra')} placeholder="e.g. Apastamba / Bodhayana" />
            <Input label="Gotra *" value={f.gotra} onChange={set('gotra')} placeholder="e.g. Bharadwaja" />
            <Input label="Pravara (Rishi Names) *" value={f.pravara} onChange={set('pravara')} placeholder="e.g. Angirasa, Barhaspatya, Bharadwaja" />
            <Input label="Abhivadanam (optional)" value={f.abhivadanam} onChange={set('abhivadanam')} placeholder="Full abhivadanam" />
          </Section>

          {/* ---------- C. Professional Details ---------- */}
          <Section id="C" title="C · Professional Details" open={openSection} onToggle={setOpenSection}>
            <Input label="Years of Experience *" value={f.years_of_experience} onChange={set('years_of_experience')} placeholder="e.g. 12" keyboardType="number-pad" maxLength={2} />

            <View style={styles.field}>
              <Text style={styles.label}>Languages Known *</Text>
              <View style={styles.chipWrap}>
                {LANGUAGES.map(l => (
                  <Pressable key={l} onPress={() => toggleLang(l)} style={[styles.chip, f.languages.includes(l) && styles.chipOn]}>
                    <Text style={[styles.chipText, f.languages.includes(l) && styles.chipTextOn]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Type of Priest *</Text>
              <View style={styles.chipWrap}>
                {[['independent', 'Independent Priest'], ['temple', 'Temple Priest']].map(([k, lbl]) => (
                  <Pressable key={k} onPress={() => set('priest_type')(k as any)} style={[styles.chip, f.priest_type === k && styles.chipOn]}>
                    <Text style={[styles.chipText, f.priest_type === k && styles.chipTextOn]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {f.priest_type === 'temple' && (
              <View style={styles.templeBox}>
                <Input label="Temple Name *" value={f.temple_name} onChange={set('temple_name')} placeholder="Temple name" />
                <Input label="Temple Address" value={f.temple_address} onChange={set('temple_address')} placeholder="Temple address" />
                <Input label="Temple Deity" value={f.temple_deity} onChange={set('temple_deity')} placeholder="Presiding deity" />
                <ChipField label="Designation" options={DESIGNATION} value={f.temple_designation} onChange={set('temple_designation')} />
              </View>
            )}
          </Section>

          {/* ---------- D. Service Categories ---------- */}
          <Section id="D" title={`D · Service Categories  (${totalSel} selected)`} open={openSection} onToggle={setOpenSection}>
            <Text style={styles.hint}>Select one or more services you can perform. Tap a category to expand.</Text>
            {catalog.length === 0 && <Text style={styles.loading}>Loading service catalog…</Text>}
            {cats.map(cat => {
              const on = openCat === cat;
              const sel = catSelectedCount(cat);
              const total = catIds(cat).length;
              return (
                <View key={cat} style={styles.catBox}>
                  <Pressable onPress={() => setOpenCat(on ? '' : cat)} style={styles.catHead}>
                    <Ionicons name={on ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.darkRed} />
                    <Text style={styles.catTitle}>{cat}</Text>
                    <View style={styles.catCount}><Text style={styles.catCountText}>{sel}/{total}</Text></View>
                  </Pressable>
                  {on && (
                    <View style={styles.catBody}>
                      <Pressable onPress={() => toggleCatAll(cat)} style={styles.selectAllRow}>
                        <Text style={styles.selectAllText}>
                          {catIds(cat).every(id => services.has(id)) ? 'Clear all in category' : 'Select all in category'}
                        </Text>
                      </Pressable>
                      {Object.entries(grouped[cat] || {}).map(([sub, items]) => (
                        <View key={sub || 'default'}>
                          {sub ? <Text style={styles.subLabel}>{sub}</Text> : null}
                          {items.map(s => {
                            const checked = services.has(s.id);
                            return (
                              <Pressable key={s.id} onPress={() => toggleSvc(s.id)} style={[styles.svcRow, checked && styles.svcRowOn]}>
                                <View style={[styles.box, checked && styles.boxOn]}>
                                  {checked && <Ionicons name="checkmark" size={12} color="#FFF" />}
                                </View>
                                <Text style={styles.svcName}>{s.name}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Section>

          {/* ---------- Optional Information ---------- */}
          <Section id="E" title="Optional Information" open={openSection} onToggle={setOpenSection}>
            <Input label="Alternative Mobile Number" value={f.alt_mobile} onChange={set('alt_mobile')} placeholder="+91 …" keyboardType="phone-pad" />
            <Input label="Alternate Email Address" value={f.optional_email} onChange={set('optional_email')} placeholder="alt@example.com" keyboardType="email-address" />
            <Input label="Priest Certification(s)" value={f.certifications} onChange={set('certifications')} placeholder="Certificate names / issuing bodies" />
            <Input label="Agama Certification" value={f.agama_certification} onChange={set('agama_certification')} placeholder="Agama certification details" />
            <Input label="Veda Patashala Details" value={f.veda_patashala} onChange={set('veda_patashala')} placeholder="Patashala name, years" />
            <Input label="Guru / Acharya Name" value={f.guru_name} onChange={set('guru_name')} placeholder="Guru name" />
            <Input label="Awards / Recognitions" value={f.awards} onChange={set('awards')} placeholder="Awards" />
            <Input label="Years of Temple Service" value={f.years_temple_service} onChange={set('years_temple_service')} placeholder="e.g. 8" keyboardType="number-pad" maxLength={2} />
            <ChipField label="Availability" options={AVAILABILITY} value={f.availability} onChange={set('availability')} />
            <YesNo label="Travel Availability" value={f.travel_availability} onChange={set('travel_availability')} />
            <YesNo label="Online Consultation Availability" value={f.online_consultation} onChange={set('online_consultation')} />
          </Section>

          <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]} testID="btn-priest-submit">
            <Text style={styles.ctaText}>{busy ? 'Registering…' : 'Submit Registration'}</Text>
          </Pressable>
          <Text style={styles.footNote}>Fields marked * are mandatory.</Text>
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

function ChipField({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void; }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {options.map(o => (
          <Pressable key={o} onPress={() => onChange(value === o ? '' : o)} style={[styles.chip, value === o && styles.chipOn]}>
            <Text style={[styles.chipText, value === o && styles.chipTextOn]}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: string; onChange: (v: 'yes' | 'no') => void; }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipWrap}>
        {(['yes', 'no'] as const).map(o => (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, value === o && styles.chipOn]}>
            <Text style={[styles.chipText, value === o && styles.chipTextOn]}>{o === 'yes' ? 'Yes' : 'No'}</Text>
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

  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  inlineBtnText: { fontSize: 11, color: colors.orange, fontWeight: '700' },

  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  photo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.gray100 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray200 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.orange, backgroundColor: '#FFF7ED' },
  photoBtnText: { fontSize: 12, color: colors.orangeDark, fontWeight: '700' },

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

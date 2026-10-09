import React, { useState } from 'react';
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
import { useAuth } from '@/src/context/AuthContext';
import Avatar from '@/src/components/Avatar';
import { pickProfilePhoto } from '@/src/utils/pickProfilePhoto';

// Devotee "Edit Profile" screen — the fields a Yajmana is allowed to change
// after registration: name, address (with optional GPS auto-fill), gothram,
// phone number, profile photo and login email.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DevoteeProfileEdit() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [gothram, setGothram] = useState(user?.gothram || '');
  const [address, setAddress] = useState(user?.address || '');
  const [lat, setLat] = useState<number | null>(user?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(user?.longitude ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(user?.photo_url ?? null);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changePhoto = async () => {
    setPhotoBusy(true);
    try { const uri = await pickProfilePhoto(); if (uri) setPhotoUrl(uri); }
    catch (e: any) { Alert.alert(t('customer.changePhoto'), e.message || 'Something went wrong'); }
    finally { setPhotoBusy(false); }
  };

  const useLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('profileEdit.locationDenied')); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setLat(pos.coords.latitude); setLng(pos.coords.longitude);
      const rev = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      if (rev?.[0]) {
        const r = rev[0];
        setAddress([r.name, r.street, r.city, r.region, r.postalCode].filter(Boolean).join(', '));
      }
    } catch { Alert.alert(t('profileEdit.locationFailed')); }
    finally { setLocBusy(false); }
  };

  const save = async () => {
    if (!name.trim()) { setError(t('devoteeReg.errName')); return; }
    if (!EMAIL_RE.test(email.trim())) { setError(t('devoteeReg.errEmail')); return; }
    if (!mobile.trim()) { setError(t('devoteeReg.errMobile')); return; }
    setError(''); setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile.trim(),
        gothram: gothram.trim(),
        address: address.trim(),
        latitude: lat,
        longitude: lng,
        photo_url: photoUrl,
      });
      router.back();
    } catch (e: any) {
      setError(e.message || t('profile.saveChanges'));
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="devotee-profile-edit">
      <View style={styles.headerBar}>
        <Pressable testID="btn-profile-edit-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.darkRed} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('profile.title')}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error} testID="profile-edit-error">{error}</Text> : null}

          <View style={styles.photoRow}>
            <Avatar photoUrl={photoUrl} role="devotee" title={user?.title} size={64} editable busy={photoBusy} onEdit={changePhoto} ringColor={colors.gray100} />
            <Pressable onPress={changePhoto} disabled={photoBusy} style={styles.inlineBtn}>
              <Ionicons name="camera" size={14} color={colors.orange} />
              <Text style={styles.inlineBtnText}>{photoBusy ? t('customer.updating') : t('customer.changePhoto')}</Text>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('devoteeReg.fullName')}</Text>
            <TextInput testID="input-edit-name" value={name} onChangeText={setName} placeholder={t('devoteeReg.fullNamePlaceholder')}
              style={styles.input} placeholderTextColor={colors.gray400} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('customer.email')}</Text>
            <TextInput testID="input-edit-email" value={email} onChangeText={setEmail} placeholder="you@example.com"
              style={styles.input} placeholderTextColor={colors.gray400} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.hint}>{t('profileEdit.emailHint')}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('devoteeReg.mobile')}</Text>
            <TextInput testID="input-edit-mobile" value={mobile} onChangeText={setMobile} placeholder={t('devoteeReg.mobilePlaceholder')}
              style={styles.input} placeholderTextColor={colors.gray400} keyboardType="phone-pad" />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('book.gothram')}</Text>
            <TextInput testID="input-edit-gothram" value={gothram} onChangeText={setGothram} placeholder={t('book.gothramPlaceholder')}
              style={styles.input} placeholderTextColor={colors.gray400} />
          </View>

          <View style={styles.field}>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t('register.address')}</Text>
              <Pressable onPress={useLocation} disabled={locBusy} style={styles.inlineBtn}>
                {locBusy ? <ActivityIndicator size="small" color={colors.orange} /> : <Ionicons name="location" size={13} color={colors.orange} />}
                <Text style={styles.inlineBtnText}>{locBusy ? t('common.loading') : t('register.useLocation')}</Text>
              </Pressable>
            </View>
            <TextInput testID="input-edit-address" value={address} onChangeText={setAddress} placeholder={t('register.address')} multiline
              style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]} placeholderTextColor={colors.gray400} />
            {lat != null && lng != null && <Text style={styles.coord}>📍 {lat.toFixed(4)}, {lng.toFixed(4)}</Text>}
          </View>

          <Pressable onPress={save} disabled={saving} testID="btn-save-devotee-profile"
            style={({ pressed }) => [styles.cta, (pressed || saving) && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{saving ? t('profile.saving') : t('profile.saveChanges')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: colors.gray100 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  content: { padding: 20, paddingBottom: 48 },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, marginBottom: 14, fontSize: 13, borderWidth: 1, borderColor: colors.red100 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.gray600, marginBottom: 6, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FBFBFB', fontSize: 15, color: colors.gray800 },
  hint: { fontSize: 11, color: colors.gray400, marginTop: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coord: { fontSize: 11, color: colors.gray500, marginTop: 4 },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  inlineBtnText: { fontSize: 11, color: colors.orange, fontWeight: '700' },
  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});

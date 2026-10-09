import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';
import TitlePicker from '@/src/components/TitlePicker';

export default function Register() {
  const router = useRouter();
  const { t } = useTranslation();
  const { registerDevotee } = useAuth();
  const [title, setTitle] = useState<'mr' | 'mrs' | undefined>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title) return setError(t('devoteeReg.errTitle'));
    if (!name.trim()) return setError(t('devoteeReg.errName'));
    if (!email.trim()) return setError(t('devoteeReg.errEmail'));
    if (!mobile.trim()) return setError(t('devoteeReg.errMobile'));
    if (password.length < 6) return setError(t('devoteeReg.errPassword'));
    setError(''); setBusy(true);
    try {
      await registerDevotee({ name: name.trim(), email: email.trim().toLowerCase(), mobile: mobile.trim(), password, title });
      router.replace('/(devotee)/dashboard');
    } catch (e: any) { setError(e.message || t('devoteeReg.failed')); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="register-screen">
      <View style={styles.headerBar}>
        <Pressable testID="btn-register-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.darkRed} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('devoteeReg.header')}</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.iconBadge}><Ionicons name="hand-left" size={30} color={colors.deepRed} /></View>
          <Text style={styles.title}>{t('devoteeReg.title')}</Text>
          <Text style={styles.subtitle}>{t('devoteeReg.subtitle')}</Text>

          {error ? <Text style={styles.error} testID="register-error">{error}</Text> : null}

          <View style={styles.field}><Text style={styles.label}>{t('devoteeReg.titleLabel')}</Text>
            <TitlePicker value={title} onChange={setTitle} testIDPrefix="register-title" /></View>

          <View style={styles.field}><Text style={styles.label}>{t('devoteeReg.fullName')}</Text>
            <TextInput testID="input-name" value={name} onChangeText={setName} placeholder={t('devoteeReg.fullNamePlaceholder')} style={styles.input} placeholderTextColor={colors.gray400} /></View>

          <View style={styles.field}><Text style={styles.label}>{t('devoteeReg.email')}</Text>
            <TextInput testID="input-email" value={email} onChangeText={setEmail} placeholder="you@example.com" style={styles.input} placeholderTextColor={colors.gray400} keyboardType="email-address" autoCapitalize="none" /></View>

          <View style={styles.field}><Text style={styles.label}>{t('devoteeReg.mobile')}</Text>
            <TextInput testID="input-mobile" value={mobile} onChangeText={setMobile} placeholder={t('devoteeReg.mobilePlaceholder')} style={styles.input} placeholderTextColor={colors.gray400} keyboardType="phone-pad" /></View>

          <View style={styles.field}><Text style={styles.label}>{t('devoteeReg.password')}</Text>
            <TextInput testID="input-password" value={password} onChangeText={setPassword} placeholder={t('devoteeReg.passwordPlaceholder')} style={styles.input} placeholderTextColor={colors.gray400} secureTextEntry /></View>

          <Pressable testID="btn-register-continue" onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{busy ? t('devoteeReg.creating') : t('devoteeReg.submit')}</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/login?role=devotee')} style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Text style={styles.linkText}>{t('devoteeReg.alreadyRegistered')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.gray100 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  content: { padding: 24 },
  iconBadge: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: colors.navy, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.gray500, textAlign: 'center', marginBottom: 24 },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, marginBottom: 12, textAlign: 'center', fontSize: 13, borderWidth: 1, borderColor: colors.red100 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.gray500, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FBFBFB', color: colors.gray800, fontSize: 15 },
  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  linkText: { color: colors.gray600, fontSize: 13, fontWeight: '600' },
});

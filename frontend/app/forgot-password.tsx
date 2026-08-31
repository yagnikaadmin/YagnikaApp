import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { apiFetch } from '@/src/context/AuthContext';

export default function ForgotPassword() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [pw1, setPw1] = useState('');
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestToken = async () => {
    if (!email.trim()) return setError('Enter email');
    setError(''); setBusy(true);
    try {
      const res = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), role: role || 'devotee' }) });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      const data = await res.json();
      setToken(data.reset_token);
      setMsg('Reset token generated. In production this would be emailed. Continue below to set a new password.');
      setStep('reset');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const doReset = async () => {
    if (!token.trim()) return setError('Reset token required');
    if (pw1.length < 6) return setError('Password must be at least 6 chars');
    setError(''); setBusy(true);
    try {
      const res = await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ reset_token: token.trim(), new_password: pw1 }) });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      setStep('done');
      setMsg('Password updated. You can now log in with the new password.');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="forgot-password-screen">
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.darkRed} />
        </Pressable>
        <Text style={styles.headerTitle}>Reset Password</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Ionicons name="key" size={40} color={colors.orange} style={{ alignSelf: 'center', marginBottom: 12 }} />
          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.subtitle}>Enter your registered email to generate a reset token.</Text>

          {error ? <Text style={styles.error} testID="fp-error">{error}</Text> : null}
          {msg ? <Text style={styles.msg} testID="fp-message">{msg}</Text> : null}

          {step === 'request' && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput testID="input-fp-email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" style={styles.input} placeholderTextColor={colors.gray400} />
              </View>
              <Pressable testID="btn-fp-request" onPress={requestToken} disabled={busy} style={styles.cta}>
                <Text style={styles.ctaText}>{busy ? 'Requesting...' : 'Get Reset Token'}</Text>
              </Pressable>
            </>
          )}

          {step === 'reset' && (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Reset Token</Text>
                <TextInput testID="input-fp-token" value={token} onChangeText={setToken} placeholder="paste token" style={styles.input} placeholderTextColor={colors.gray400} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>New Password</Text>
                <TextInput testID="input-fp-new-pw" value={pw1} onChangeText={setPw1} secureTextEntry placeholder="At least 6 chars" style={styles.input} placeholderTextColor={colors.gray400} />
              </View>
              <Pressable testID="btn-fp-reset" onPress={doReset} disabled={busy} style={styles.cta}>
                <Text style={styles.ctaText}>{busy ? 'Resetting...' : 'Reset Password'}</Text>
              </Pressable>
            </>
          )}

          {step === 'done' && (
            <Pressable testID="btn-fp-back-login" onPress={() => router.replace(`/login?role=${role || 'devotee'}`)} style={styles.cta}>
              <Text style={styles.ctaText}>Back to Login</Text>
            </Pressable>
          )}
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
  title: { fontSize: 20, fontWeight: '800', color: colors.navy, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.gray500, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, marginBottom: 12, textAlign: 'center', fontSize: 13 },
  msg: { backgroundColor: '#ECFDF5', color: '#065F46', padding: 12, borderRadius: radius.md, marginBottom: 12, textAlign: 'center', fontSize: 12 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.gray500, marginBottom: 6, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FBFBFB', fontSize: 14, color: colors.gray800 },
  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});

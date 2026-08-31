import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { useAuth } from '@/src/context/AuthContext';
import { poojaImageFor } from '@/src/utils/poojaImages';

const BANNER_IMG: Record<string, string> = {
  priest: poojaImageFor('p3'),
  admin: poojaImageFor('p6'),
  devotee: poojaImageFor('p4'),
};

export default function Login() {
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role = roleParam === 'priest' ? 'priest' : roleParam === 'admin' ? 'admin' : 'devotee';
  const roleLabel = role === 'priest' ? 'Priest' : role === 'admin' ? 'Admin' : 'Devotee';
  const bannerUri = BANNER_IMG[role];
  const { login } = useAuth();
  const [email, setEmail] = useState(role === 'admin' ? 'admin@yagnika.com' : '');
  const [password, setPassword] = useState(role === 'admin' ? 'Admin@123' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Please enter email and password');
    setError(''); setBusy(true);
    try {
      const u = await login(email.trim().toLowerCase(), password, role);
      if (u.role === 'priest') router.replace('/priest-dashboard');
      else if (u.role === 'admin') router.replace('/admin-dashboard');
      else router.replace('/(devotee)/dashboard');
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="login-screen">
      <View style={styles.banner}>
        <Image source={{ uri: bannerUri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.97)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.headerBar}>
          <Pressable testID="btn-login-back" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.darkRed} />
          </Pressable>
          <Text style={styles.headerTitle}>{roleLabel} Login</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.iconBadge}>
            <Ionicons
              name={roleParam === 'priest' ? 'business' : roleParam === 'admin' ? 'shield-checkmark' : 'hand-left'}
              size={30}
              color={roleParam === 'admin' ? colors.navy : roleParam === 'priest' ? colors.gold : colors.deepRed}
            />
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue your sacred journey</Text>

          {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput testID="input-login-email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" style={styles.input} placeholderTextColor={colors.gray400} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput testID="input-login-password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Enter password" style={styles.input} placeholderTextColor={colors.gray400} />
          </View>

          <Pressable testID="btn-login-submit" onPress={submit} disabled={busy} style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.85 }]}>
            <Text style={styles.ctaText}>{busy ? 'Signing in...' : 'Sign In'}</Text>
          </Pressable>

          {roleParam !== 'admin' && (
            <>
              <Pressable testID="btn-forgot-password" onPress={() => router.push(`/forgot-password?role=${roleParam || 'devotee'}`)} style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
              <Pressable onPress={() => router.push(roleParam === 'priest' ? '/priest-register' : '/register')} style={{ alignItems: 'center', paddingVertical: 4 }}>
                <Text style={styles.linkText}>New here? Register</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' },
  banner: { height: 110, overflow: 'hidden', justifyContent: 'flex-start' },
  headerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  iconBadge: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF8E7', alignItems: 'center', justifyContent: 'center', marginBottom: 16, marginTop: -46, borderWidth: 4, borderColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  title: { fontSize: 24, fontWeight: '800', color: colors.navy, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.gray500, textAlign: 'center', marginBottom: 28 },
  error: { backgroundColor: colors.red50, color: colors.red600, padding: 12, borderRadius: radius.md, marginBottom: 12, textAlign: 'center', fontSize: 13, borderWidth: 1, borderColor: colors.red100 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: colors.gray500, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FBFBFB', fontSize: 15, color: colors.gray800 },
  cta: { backgroundColor: colors.darkRed, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  linkText: { color: colors.gray600, fontSize: 13, fontWeight: '600' },
});

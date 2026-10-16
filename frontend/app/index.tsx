import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/context/AuthContext';

// Opening / intro screen — shown every time the app is opened.
//
// One codebase, two apps. The "flavor" is resolved at RUNTIME (not baked in
// at build time) so the two Metro dev servers can share a transform cache
// without poisoning each other:
//   1. EXPO_PUBLIC_APP_FLAVOR env var, if explicitly "priest" / "customer"
//      (used by a real standalone build).
//   2. Otherwise, the Expo dev-server port: :8101 -> customer, else priest.
function resolveFlavor(): 'priest' | 'customer' {
  const env = (process.env.EXPO_PUBLIC_APP_FLAVOR || '').trim().toLowerCase();
  if (env === 'customer' || env === 'priest') return env;
  const host = String(
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest2?.launchAsset?.url ||
    '');
  if (/:8101(\D|$)/.test(host)) return 'customer';
  return 'priest';
}
const FLAVOR = resolveFlavor();
// This build serves exactly one role. Expo Go shares AsyncStorage between
// the two flavors on one phone, so a session from the *other* app must be
// ignored (and cleared) here, otherwise the customer QR would resume a
// priest session and vice-versa.
const EXPECTED_ROLE = FLAVOR === 'customer' ? 'devotee' : 'priest';

// Both builds open straight to their login screen (registration is one tap
// away). Admin has no screen in the app — it lives only on the Admin Web UI.
// How long the opening screen shows before moving on by itself.
const SPLASH_MS = 1500;

const LOGIN_DEST = FLAVOR === 'customer' ? '/login?role=devotee' : '/login?role=priest';

function destForUser(u: { role?: string; approval_status?: string | null } | null): string {
  if (!u || (u.role !== EXPECTED_ROLE)) return LOGIN_DEST;
  if (u.role === 'priest') {
    return u.approval_status && u.approval_status !== 'approved' ? '/priest-pending' : '/priest-dashboard';
  }
  return '/(devotee)/dashboard';
}

export default function Splash() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isLoading, logout } = useAuth();

  // Shown briefly, then moves on by itself: to the dashboard when a session of
  // this flavor's role exists, otherwise to login. A session belonging to the
  // other flavor's role is dropped first (this effect then re-runs with no user).
  useEffect(() => {
    if (isLoading) return;
    if (user && user.role !== EXPECTED_ROLE) {
      logout();
      return;
    }
    const timer = setTimeout(() => router.replace(destForUser(user) as any), SPLASH_MS);
    return () => clearTimeout(timer);
  }, [isLoading, user, logout, router]);

  return (
    <View style={styles.root} testID="splash-screen">
      <ImageBackground
        source={require('../assets/yagnika/splash-screen.png')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.95)']}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <View style={styles.centerBlock}>
        <View style={styles.logoCircle}>
          <Text style={styles.omGlyph}>ॐ</Text>
        </View>
        <Text style={styles.title}>{t('common.appName')}</Text>
        <Text style={styles.subtitle}>{t('splash.tagline')}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.mantraRow}>
          <Text style={styles.diamond}>♦</Text>
          <Text style={styles.mantra}>धर्मो रक्षति रक्षितः</Text>
          <Text style={styles.diamond}>♦</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 40 },
  topBar: { position: 'absolute', top: 0, right: 16, alignItems: 'flex-end' },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: '#F59E0B', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  omGlyph: { color: '#FFF', fontSize: 44, fontWeight: '800' },
  title: {
    fontSize: 52, fontWeight: '800', color: '#FDE68A', letterSpacing: 4,
    textShadowColor: 'rgba(255,204,0,0.6)', textShadowRadius: 20, marginBottom: 12,
  },
  subtitle: { color: '#FDE68A', fontSize: 16, letterSpacing: 1, fontWeight: '600' },
  footer: { alignItems: 'center', paddingBottom: 24 },
  mantraRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  diamond: { color: '#F59E0B', fontSize: 12 },
  mantra: { color: '#D1D5DB', fontSize: 14, fontWeight: '600' },
});

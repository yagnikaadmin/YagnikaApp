import React from 'react';
import { View, Text, StyleSheet, Pressable, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';

// Opening / intro screen. For this build the "enter" button goes straight
// to the Yagnika (priest) registration screen. The devotee & admin
// launcher (app/home.tsx) and their screens still exist in the codebase
// but are not routed to — change the onPress below back to '/home' to
// restore the full launcher.
export default function Splash() {
  const router = useRouter();

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
        <Text style={styles.title}>Yagnika</Text>
        <Text style={styles.subtitle}>॥ सेवा • संस्कार • समर्पण ॥</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.mantraRow}>
          <Text style={styles.diamond}>♦</Text>
          <Text style={styles.mantra}>धर्मो रक्षति रक्षितः</Text>
          <Text style={styles.diamond}>♦</Text>
        </View>

        <Pressable
          testID="splash-enter-btn"
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
          onPress={() => router.replace('/priest-register')}
        >
          <Text style={styles.ctaText}>॥ स्वागतम् ॥</Text>
        </Pressable>

        <Text style={styles.hint}>Tap to begin Yagnika registration</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 40 },
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
  cta: {
    width: '100%', paddingVertical: 18, borderRadius: radius.lg,
    backgroundColor: colors.darkRed, borderWidth: 2, borderColor: '#B8860B',
    alignItems: 'center',
    shadowColor: colors.darkRed, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaText: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  hint: { color: '#D1D5DB', fontSize: 12, marginTop: 16, letterSpacing: 1 },
});

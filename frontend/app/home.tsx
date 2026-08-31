import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius } from '@/src/theme';
import { poojaImageFor } from '@/src/utils/poojaImages';

const HERO_IMG = poojaImageFor('p1');
const PRIEST_IMG = poojaImageFor('p3');

export default function Home() {
  const router = useRouter();
  return (
    <View style={styles.root} testID="home-screen">
      <View style={styles.header}>
        <Image source={{ uri: HERO_IMG }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
        <LinearGradient colors={['rgba(94,0,0,0.55)', 'rgba(150,12,12,0.88)', colors.primaryRed]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView edges={['top']}>
          <View style={styles.headerInner}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoY}>Y</Text>
              <Text style={styles.logoRest}>agnika</Text>
              <View style={styles.sparkDot}><Ionicons name="sparkles" size={10} color={colors.darkRed} /></View>
            </View>
            <Text style={styles.welcome}>Welcome to Yagnika</Text>
            <Text style={styles.tagline}>Connecting Devotion with Tradition</Text>
            <View style={styles.starRow}>
              <View style={styles.starLine} />
              <Ionicons name="star" size={14} color={colors.gold} />
              <View style={styles.starLine} />
            </View>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={styles.main} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
        {/* Devotee */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Image source={{ uri: HERO_IMG }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient colors={['rgba(255,186,8,0.55)', 'rgba(244,140,6,0.9)']} style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardIconBadge}><Ionicons name="hand-left" size={24} color={colors.deepRed} /></View>
            <Text style={styles.cardTitleDark}>Yajmana (Devotee)</Text>
            <Text style={styles.cardSubDark}>Book sacred poojas and receive blessings from Yagnikas</Text>
          </View>
          {/* Devotee flow is inactive in this build (screens kept in codebase). */}
          <View style={styles.cardBottom}>
            <View style={[styles.primaryBtn, { backgroundColor: colors.gray200 }]}>
              <Text style={[styles.primaryBtnText, { color: colors.gray500 }]}>Currently Unavailable</Text>
            </View>
            <View style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: colors.gray400 }]}>Devotee access disabled</Text>
            </View>
          </View>
        </View>

        {/* Priest */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Image source={{ uri: PRIEST_IMG }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            <LinearGradient colors={['rgba(94,0,0,0.75)', 'rgba(94,0,0,0.92)']} style={StyleSheet.absoluteFillObject} />
            <View style={[styles.cardIconBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}><Ionicons name="business" size={24} color={colors.gold} /></View>
            <Text style={styles.cardTitleLight}>Yagnika (Priest)</Text>
            <Text style={styles.cardSubLight}>Register your services and receive booking requests</Text>
          </View>
          <View style={styles.cardBottom}>
            <Pressable testID="btn-register-priest" onPress={() => router.push('/priest-register')} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.darkRed }, pressed && { opacity: 0.9 }]}>
              <Text style={[styles.primaryBtnText, { color: '#FFF' }]}>Register as Priest</Text>
            </Pressable>
          </View>
        </View>

        {/* Admin login is inactive in this build (screen kept in codebase). */}
        <View style={[styles.adminRow, { opacity: 0.5 }]}>
          <View style={styles.adminIconBadge}><Ionicons name="shield-checkmark" size={18} color={colors.navy} /></View>
          <Text style={styles.adminText}>Admin Login (disabled)</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  header: { backgroundColor: colors.primaryRed, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, paddingBottom: 40, overflow: 'hidden' },
  headerInner: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 24 },
  logoBadge: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginBottom: 12 },
  logoY: { color: colors.darkRed, fontSize: 20, fontWeight: '800' },
  logoRest: { color: colors.darkRed, fontSize: 11, fontWeight: '700' },
  sparkDot: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.goldLight, padding: 3, borderRadius: 20 },
  welcome: { color: '#FFF', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  tagline: { color: 'rgba(255,255,255,0.95)', fontSize: 13, marginBottom: 14 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starLine: { height: 1, width: 24, backgroundColor: 'rgba(255,184,0,0.5)' },
  main: { flex: 1 },
  mainContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 16, marginTop: -20 },
  card: { backgroundColor: '#FFF', borderRadius: radius.xl, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  cardTop: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 22, gap: 6, overflow: 'hidden', minHeight: 130, justifyContent: 'center' },
  cardIconBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  adminIconBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  cardTitleLight: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 8 },
  cardSubLight: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 17 },
  cardTitleDark: { color: colors.deepRed, fontSize: 18, fontWeight: '800', marginTop: 8 },
  cardSubDark: { color: 'rgba(94,0,0,0.85)', fontSize: 12, fontWeight: '500', lineHeight: 17 },
  cardBottom: { padding: 14, gap: 4 },
  primaryBtn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: colors.gray600, fontSize: 13, fontWeight: '700' },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', paddingHorizontal: 18, paddingVertical: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100 },
  adminText: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.navy },
});

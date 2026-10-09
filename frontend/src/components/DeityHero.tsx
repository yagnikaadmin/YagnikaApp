import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

/* Full-width deity banner shown at the top of a tab. The tab itself is
   pinch-zoomable (ZoomView), so this stays a plain image. The shloka sits
   over the lower part of the image in bright gold, below the deity figure. */

export default function DeityHero({
  image,
  shloka,
  om = 'ॐ',
  aspectRatio = 4 / 5,   // width / height
  mirror = false,
}: {
  image: any;
  shloka?: string;
  om?: string;
  aspectRatio?: number;
  mirror?: boolean;
}) {
  const w = Dimensions.get('window').width;
  const h = w / aspectRatio;

  return (
    <View style={[styles.wrap, { width: w, height: h }]}>
      <Image
        source={image}
        style={[StyleSheet.absoluteFill, mirror ? { transform: [{ scaleX: -1 }] } : null]}
        contentFit="cover"
        contentPosition="top"
        transition={250}
      />
      <LinearGradient
        colors={['transparent', 'rgba(8,3,2,0.12)', 'rgba(8,3,2,0.82)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {shloka ? (
        <View style={styles.shlokaBox} pointerEvents="none">
          <Text style={styles.om}>{om}</Text>
          <Text style={styles.shloka}>{shloka}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#2A1A12', overflow: 'hidden' },
  shlokaBox: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, alignItems: 'center' },
  om: { color: '#FFE9A8', fontSize: 17, fontWeight: '700', marginBottom: 3, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 },
  shloka: {
    color: '#FFD24A',
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 21,
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 7,
  },
});

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { poojaImageFor } from '@/src/utils/poojaImages';

interface PoojaImageProps {
  id: string;
  name?: string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
  children?: React.ReactNode; // overlaid content (e.g. title), anchored bottom
}

export default function PoojaImage({ id, name, height = 120, radius = 16, style, children }: PoojaImageProps) {
  const uri = poojaImageFor(id, name);
  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={200} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFillObject} />
      {children ? <View style={styles.overlay}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 12 },
});

import React from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme';
import { defaultAvatarUrl } from '@/src/utils/avatar';

interface AvatarProps {
  photoUrl?: string | null;
  role?: 'devotee' | 'priest' | 'admin' | string;
  title?: string | null;
  size?: number;
  ringColor?: string;
  editable?: boolean;
  busy?: boolean;
  onEdit?: () => void;
  testID?: string;
}

export default function Avatar({ photoUrl, role = 'devotee', title, size = 56, ringColor = '#FFF', editable, busy, onEdit, testID }: AvatarProps) {
  const uri = photoUrl || defaultAvatarUrl(role, title);
  const content = (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: ringColor }]}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: size / 2 }} contentFit="cover" transition={150} />
      {busy && (
        <View style={[StyleSheet.absoluteFillObject, styles.busyOverlay, { borderRadius: size / 2 }]}>
          <ActivityIndicator color="#FFF" size="small" />
        </View>
      )}
      {editable && !busy && (
        <View style={[styles.editBadge, { right: -2, bottom: -2 }]}>
          <Ionicons name="camera" size={size < 60 ? 12 : 15} color="#FFF" />
        </View>
      )}
    </View>
  );
  if (editable) {
    return (
      <Pressable testID={testID} onPress={onEdit} disabled={busy}>
        {content}
      </Pressable>
    );
  }
  return <View testID={testID}>{content}</View>;
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, overflow: 'visible', backgroundColor: colors.gray100 },
  busyOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  editBadge: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
});

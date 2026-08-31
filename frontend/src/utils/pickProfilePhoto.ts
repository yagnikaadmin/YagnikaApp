import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Picks a photo from the gallery, downsizes/compresses it, and returns a
// small JPEG data URI ready to send straight to the backend and to render
// immediately (no upload step / no image hosting infra needed for this POC).
export async function pickProfilePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo library permission denied. Enable it in Settings to add a profile photo.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const manipulated = await manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 400, height: 400 } }],
    { compress: 0.6, format: SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) throw new Error('Could not process the selected photo.');
  return `data:image/jpeg;base64,${manipulated.base64}`;
}

// Default avatar photos for users who haven't uploaded a profile photo.
// Devotees get one of two fixed professional headshots based on their
// chosen title (Mr / Mrs). Priests all share a single fixed AI-generated
// illustration (no personal question asked at priest registration) —
// sourced from Wikimedia Commons' "AI-generated images of Hinduism"
// category (public-domain AI art, not a photo of a real person).
export const TITLE_AVATAR: Record<'mr' | 'mrs', string> = {
  mr: 'https://randomuser.me/api/portraits/men/46.jpg',
  mrs: 'https://randomuser.me/api/portraits/women/65.jpg',
};

export const PRIEST_DEFAULT_AVATAR =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Vedic_Priest.png/960px-Vedic_Priest.png';

export function defaultAvatarUrl(role: 'devotee' | 'priest' | 'admin' | string, title?: string | null): string {
  if (role === 'priest') return PRIEST_DEFAULT_AVATAR;
  return TITLE_AVATAR[title === 'mrs' ? 'mrs' : 'mr'];
}

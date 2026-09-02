const AVATAR_PRESETS = [
  { id: 'none', label: 'Sembolsüz', initialOnly: true, category: 'none' },
  { id: 'traveler', label: 'Gezgin', anim: 'bounce', category: 'travel' },
  { id: 'compass', label: 'Pusula', anim: 'spin', category: 'travel' },
  { id: 'plane', label: 'Uçak', anim: 'fly', category: 'travel' },
  { id: 'camera', label: 'Fotoğrafçı', anim: 'pulse', category: 'travel' },
  { id: 'mountain', label: 'Dağcı', anim: 'bounce', category: 'travel' },
  { id: 'wave', label: 'Deniz', anim: 'wave', category: 'travel' },
  { id: 'robot', label: 'Robot', anim: 'pulse', category: 'travel' },
  { id: 'sun', label: 'Güneş', anim: 'glow', category: 'travel' },
  { id: 'moon', label: 'Ay', anim: 'glow', category: 'travel' },
  { id: 'fox', label: 'Tilki', anim: 'wiggle', category: 'animal', defaultColor: '#FFEDD5' },
  { id: 'owl', label: 'Baykuş', anim: 'blink', category: 'animal', defaultColor: '#FEF3C7' },
  { id: 'penguin', label: 'Penguen', anim: 'waddle', category: 'animal', defaultColor: '#DBEAFE' },
  { id: 'cat', label: 'Kedi', anim: 'wiggle', category: 'animal', defaultColor: '#FFEDD5' },
  { id: 'dog', label: 'Köpek', anim: 'bounce', category: 'animal', defaultColor: '#FEF9C3' },
  { id: 'bear', label: 'Ayı', anim: 'pulse', category: 'animal', defaultColor: '#FDE68A' },
  { id: 'lion', label: 'Aslan', anim: 'bounce', category: 'animal', defaultColor: '#FEF3C7' },
  { id: 'rabbit', label: 'Tavşan', anim: 'bounce', category: 'animal', defaultColor: '#FFF1F2' },
  { id: 'panda', label: 'Panda', anim: 'pulse', category: 'animal', defaultColor: '#F3F4F6' },
  { id: 'butterfly', label: 'Kelebek', anim: 'fly', category: 'animal', defaultColor: '#FAE8FF' },
];

const AVATAR_COLORS = [
  '#0ea5e9', '#0d9488', '#b45309', '#e8642a', '#7c3aed',
  '#db2777', '#059669', '#dc2626', '#4f46e5', '#0891b2',
];

const { publicImageUrl } = require('./media-url');

function isValidPreset(id) {
  return typeof id === 'string' && PRESET_IDS.has(id);
}

function isValidColor(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
}

function mapAvatarFields(row) {
  if (!row) return { avatarUrl: null, avatarPreset: null, avatarColor: '#0ea5e9' };
  return {
    avatarUrl: publicImageUrl(row.avatar_url),
    avatarPreset: row.avatar_preset || null,
    avatarColor: row.avatar_color || '#0ea5e9',
  };
}

module.exports = {
  AVATAR_PRESETS,
  AVATAR_COLORS,
  isValidPreset,
  isValidColor,
  mapAvatarFields,
};

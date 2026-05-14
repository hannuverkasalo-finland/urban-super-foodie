export const colors = {
  bg: '#0B0B12',
  bgElevated: '#15151F',
  bgCard: '#1C1C28',
  bgChip: '#22222F',
  border: '#2A2A38',
  text: '#FFFFFF',
  textMuted: '#9A9AAB',
  textDim: '#6E6E80',
  accent: '#FF7A45',
  accentSoft: '#FFB088',
  eat: '#FF7A45',
  drink: '#7C5CFF',
  do: '#3FD1B9',
  craft: '#FFC857',
  info: '#5BA9FF',
  now: '#FF5DA8',
  menu: '#9FE870',
  success: '#3FD1B9',
  warning: '#FFC857',
  danger: '#FF5470',
  overlay: 'rgba(0,0,0,0.55)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  s: 12,
  m: 16,
  l: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radius = {
  s: 8,
  m: 12,
  l: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 36, fontWeight: '800' as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyBold: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;

export const mapNightStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d27' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9a9aab' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d27' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#2a2a38' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6e6e80' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1a2a22' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2a2a38' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9a9aab' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3a3a4a' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2a2a38' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1828' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5BA9FF' }],
  },
];

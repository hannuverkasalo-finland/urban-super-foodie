import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { WelcomeCardSpec } from '../types';
import { colors, radius, shadow, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - spacing.l * 2, 420);
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const PHOTO_SIZE = CARD_WIDTH * 0.4;

interface Props {
  spec: WelcomeCardSpec;
  photoUri: string | null;
  nickname: string;
  cityName: string;
}

// 6 fixed positions arranged around the card (relative offsets from center).
// Each tuple is { x, y } as fractions of CARD_WIDTH (-0.5 to 0.5).
const EMOJI_POSITIONS: { x: number; y: number; size: number }[] = [
  { x: -0.42, y: -0.32, size: 36 },
  { x: 0.4, y: -0.34, size: 34 },
  { x: -0.4, y: 0.05, size: 28 },
  { x: 0.42, y: 0.02, size: 30 },
  { x: -0.18, y: -0.42, size: 26 },
  { x: 0.2, y: -0.4, size: 28 },
];

/**
 * The "Welcome postcard" composite. Your photo is the central avatar,
 * a famous city landmark photo (when Google Places returned one) sits as
 * the backdrop, city-signature emojis float at fixed decorative positions
 * with a gentle bobbing animation, and Claude's headline + subhead are
 * overlaid at the bottom.
 */
export default function WelcomeCard({
  spec,
  photoUri,
  nickname,
  cityName,
}: Props) {
  // Bobbing animation for the emojis — vertical sine wave.
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const accent = spec.accentHex || colors.accent;

  return (
    <View style={[styles.card, { borderColor: accent + '88' }]}>
      {/* Landmark photo backdrop OR accent-color fallback */}
      {spec.landmarkPhotoUrl ? (
        <Image
          source={{ uri: spec.landmarkPhotoUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: accent + '40' },
          ]}
        />
      )}

      {/* Gradient overlay so captions read clearly */}
      <LinearGradient
        colors={[
          'rgba(11,11,18,0.20)',
          'rgba(11,11,18,0.55)',
          'rgba(11,11,18,0.95)',
        ]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating emojis at fixed decorative positions */}
      <View style={styles.emojiLayer} pointerEvents="none">
        {spec.cityEmojis.slice(0, 6).map((emoji, i) => {
          const pos = EMOJI_POSITIONS[i % EMOJI_POSITIONS.length];
          const bobOffset = bob.interpolate({
            inputRange: [0, 1],
            outputRange: [-4, 4],
          });
          return (
            <Animated.Text
              key={i + emoji}
              style={[
                styles.emoji,
                {
                  fontSize: pos.size,
                  transform: [
                    { translateX: pos.x * CARD_WIDTH },
                    { translateY: pos.y * CARD_WIDTH },
                    { translateY: bobOffset },
                  ],
                },
              ]}
            >
              {emoji}
            </Animated.Text>
          );
        })}
      </View>

      {/* User photo in framed circle */}
      <View
        style={[
          styles.photoFrame,
          { borderColor: accent, shadowColor: accent },
        ]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            onError={() => {}}
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={styles.photoEmoji}>👋</Text>
          </View>
        )}
      </View>

      {/* Captions */}
      <View style={styles.captionWrap}>
        <Text style={styles.cityChip}>{cityName.toUpperCase()}</Text>
        <Text style={styles.headline} numberOfLines={2}>
          {spec.headline ||
            `${nickname || 'Foodie'}, ${cityName} is yours.`}
        </Text>
        {spec.subhead ? (
          <Text style={[styles.subhead, { color: accent }]} numberOfLines={3}>
            {spec.subhead}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'flex-end',
    ...shadow.card,
  },
  emojiLayer: {
    position: 'absolute',
    top: CARD_HEIGHT * 0.42,
    left: CARD_WIDTH / 2,
    width: 1,
    height: 1,
  },
  emoji: {
    position: 'absolute',
  },
  photoFrame: {
    position: 'absolute',
    top: CARD_HEIGHT * 0.42 - PHOTO_SIZE / 2 - 4,
    width: PHOTO_SIZE + 8,
    height: PHOTO_SIZE + 8,
    borderRadius: (PHOTO_SIZE + 8) / 2,
    borderWidth: 3,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    overflow: 'hidden',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: '#1a1a1a',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: {
    fontSize: PHOTO_SIZE * 0.5,
  },
  captionWrap: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.l,
    paddingTop: spacing.s,
  },
  cityChip: {
    ...typography.micro,
    color: '#fff',
    letterSpacing: 4,
    fontWeight: '800',
    marginBottom: 8,
    opacity: 0.85,
  },
  headline: {
    ...typography.display,
    color: '#fff',
    fontSize: 26,
    lineHeight: 30,
    marginBottom: 6,
  },
  subhead: {
    ...typography.body,
    fontWeight: '600',
    lineHeight: 21,
  },
});

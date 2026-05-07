import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CuratedPlace } from '../types';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { formatDistance } from '../utils/distance';

interface Props {
  place: CuratedPlace;
  distanceKm?: number;
  onPress?: () => void;
}

const categoryAccent: Record<string, string> = {
  eat: colors.eat,
  drink: colors.drink,
  do: colors.do,
};

export default function PlaceCard({ place, distanceKm, onPress }: Props) {
  const accent = categoryAccent[place.category] ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {place.photoUrl ? (
        <Image source={{ uri: place.photoUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, { backgroundColor: accent + '33' }]} />
      )}
      <View style={styles.body}>
        <View style={styles.rankRow}>
          <View style={[styles.rankPill, { backgroundColor: accent }]}>
            <Text style={styles.rankText}>#{place.rank}</Text>
          </View>
          {typeof place.googleRating === 'number' && (
            <Text style={styles.rating}>
              ★ {place.googleRating.toFixed(1)}{' '}
              <Text style={styles.ratingDim}>
                ({place.reviewCount ?? 0})
              </Text>
            </Text>
          )}
          {distanceKm !== undefined && (
            <Text style={styles.distance}>{formatDistance(distanceKm)}</Text>
          )}
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {place.neighborhood && (
          <Text style={styles.neighborhood} numberOfLines={1}>
            {place.neighborhood}
          </Text>
        )}
        <Text style={styles.why} numberOfLines={3}>
          {place.whyRecommended}
        </Text>
        {place.sourceInspirations.length > 0 && (
          <Text style={styles.sources} numberOfLines={1}>
            via {place.sourceInspirations.slice(0, 3).join(' · ')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    overflow: 'hidden',
    ...shadow.card,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: colors.bgChip,
  },
  body: { padding: spacing.m },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rankPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  rankText: {
    ...typography.micro,
    color: '#0B0B12',
    fontWeight: '800',
  },
  rating: {
    ...typography.small,
    color: colors.text,
    fontWeight: '600',
  },
  ratingDim: { color: colors.textDim },
  distance: {
    ...typography.small,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  name: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 2,
  },
  neighborhood: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: 8,
  },
  why: {
    ...typography.small,
    color: colors.text,
    lineHeight: 19,
  },
  sources: {
    ...typography.micro,
    color: colors.textDim,
    marginTop: 8,
  },
});

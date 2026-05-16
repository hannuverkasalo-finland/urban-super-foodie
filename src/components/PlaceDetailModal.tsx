import { useEffect, useMemo } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ensurePlaceDetails } from '../services/placeDetailService';
import { useLocationStore } from '../store/locationStore';
import { usePlaceDetailStore } from '../store/placeDetailStore';
import { colors, radius, shadow, spacing, typography } from '../theme';
import type { CuratedPlace } from '../types';
import { formatDistance, haversineKm } from '../utils/distance';

const { width } = Dimensions.get('window');

const CATEGORY_ACCENT: Record<string, string> = {
  eat: colors.eat,
  drink: colors.drink,
  do: colors.do,
};

interface Props {
  place: CuratedPlace | null;
  onClose: () => void;
}

export default function PlaceDetailModal({ place, onClose }: Props) {
  const bundle = usePlaceDetailStore((s) =>
    place ? s.byPlaceId[place.id] : undefined
  );
  const coords = useLocationStore((s) => s.coords);

  // Kick off the details fetch when the modal opens. Re-run whenever the
  // place changes so we always have fresh content. The fetch service caches
  // for 12h so re-opens are instant.
  useEffect(() => {
    if (!place) return;
    void ensurePlaceDetails(place);
  }, [place]);

  const accent = place ? CATEGORY_ACCENT[place.category] ?? colors.accent : colors.accent;
  const distance =
    place && coords
      ? haversineKm(coords, { lat: place.lat, lng: place.lng })
      : null;

  const photos = useMemo(() => {
    const list: string[] = [];
    if (bundle?.details?.photos.length) list.push(...bundle.details.photos);
    if (place?.photoUrl) list.push(place.photoUrl);
    return [...new Set(list)];
  }, [bundle?.details, place?.photoUrl]);

  const detailsLoading =
    !bundle?.details && !bundle?.detailsError && !!place;
  const enrichmentLoading =
    !bundle?.enrichment && !bundle?.enrichmentError && !!place;

  function openLink(url?: string) {
    if (!url) return;
    void Linking.openURL(url).catch(() => null);
  }

  return (
    <Modal
      visible={!!place}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent={false}
    >
      {place && (
        <SafeAreaView style={styles.root} edges={['top']}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {/* HERO */}
            <View style={styles.heroWrap}>
              {photos.length > 0 ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                >
                  {photos.map((uri, i) => (
                    <Image
                      key={uri + i}
                      source={{ uri }}
                      style={[styles.heroPhoto, { width }]}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={[styles.heroPhoto, { width, backgroundColor: accent + '33' }]} />
              )}
              <LinearGradient
                colors={['rgba(11,11,18,0)', 'rgba(11,11,18,0.85)']}
                style={styles.heroGradient}
                pointerEvents="none"
              />
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
              <View style={styles.heroBottom}>
                <View style={[styles.rankPill, { backgroundColor: accent }]}>
                  <Text style={styles.rankText}>#{place.rank}</Text>
                </View>
                <Text style={styles.placeName} numberOfLines={2}>
                  {place.name}
                </Text>
                <View style={styles.heroMetaRow}>
                  {typeof place.googleRating === 'number' && (
                    <Text style={styles.metaPrimary}>
                      ★ {place.googleRating.toFixed(1)}
                      <Text style={styles.metaDim}>
                        {' '}
                        ({place.reviewCount ?? 0})
                      </Text>
                    </Text>
                  )}
                  {distance !== null && (
                    <Text style={styles.metaDim}>· {formatDistance(distance)} away</Text>
                  )}
                  {bundle?.details?.openingHours?.openNow !== undefined && (
                    <Text
                      style={[
                        styles.metaDim,
                        {
                          color: bundle.details.openingHours.openNow
                            ? colors.success
                            : colors.danger,
                        },
                      ]}
                    >
                      · {bundle.details.openingHours.openNow ? 'Open now' : 'Closed now'}
                    </Text>
                  )}
                </View>
                {place.neighborhood && (
                  <Text style={styles.neighborhood}>{place.neighborhood}</Text>
                )}
              </View>
            </View>

            {/* WHY TODAY */}
            <View style={styles.body}>
              {bundle?.enrichment?.whyToday ? (
                <View style={[styles.whyTodayCard, { borderColor: accent + 'AA' }]}>
                  <Text style={[styles.whyTodayLabel, { color: accent }]}>WHY TODAY</Text>
                  <Text style={styles.whyTodayText}>"{bundle.enrichment.whyToday}"</Text>
                  {bundle.enrichment.bestFitFor && (
                    <Text style={styles.bestFit}>
                      Best for: {bundle.enrichment.bestFitFor}
                    </Text>
                  )}
                </View>
              ) : enrichmentLoading ? (
                <View style={[styles.skel, { height: 110 }]} />
              ) : null}

              {/* SUMMARY */}
              {bundle?.enrichment?.summary ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>The story</Text>
                  <Text style={styles.body2}>{bundle.enrichment.summary}</Text>
                </View>
              ) : enrichmentLoading ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>The story</Text>
                  <View style={[styles.skel, { height: 80 }]} />
                </View>
              ) : null}

              {/* SIGNATURE ITEMS */}
              {bundle?.enrichment?.signatureItems &&
                bundle.enrichment.signatureItems.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Try this here</Text>
                    {bundle.enrichment.signatureItems.map((it, i) => (
                      <View key={i} style={styles.bullet}>
                        <Text style={[styles.bulletDot, { color: accent }]}>•</Text>
                        <Text style={styles.bulletText}>{it}</Text>
                      </View>
                    ))}
                  </View>
                )}

              {/* WHY RECOMMENDED (from CuratedPlace - always present) */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Why it's on this list</Text>
                <Text style={styles.body2}>{place.whyRecommended}</Text>
                {place.sourceInspirations.length > 0 && (
                  <View style={styles.sourceRow}>
                    {place.sourceInspirations.map((s) => (
                      <View key={s} style={[styles.sourceChip, { borderColor: accent + '88' }]}>
                        <Text style={[styles.sourceText, { color: accent }]}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* MATCH TAGS */}
              {bundle?.enrichment?.matchTags &&
                bundle.enrichment.matchTags.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Matches you on</Text>
                    <View style={styles.tagRow}>
                      {bundle.enrichment.matchTags.map((t) => (
                        <View key={t} style={[styles.tagChip, { backgroundColor: accent + '22' }]}>
                          <Text style={[styles.tagText, { color: accent }]}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

              {/* OPENING HOURS */}
              {bundle?.details?.openingHours?.weekdayText &&
                bundle.details.openingHours.weekdayText.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Opening hours</Text>
                    {bundle.details.openingHours.weekdayText.map((line, i) => {
                      const isToday = line === bundle.details!.openingHours!.todayLine;
                      return (
                        <Text
                          key={i}
                          style={[
                            styles.hourLine,
                            isToday && { color: accent, fontWeight: '700' },
                          ]}
                        >
                          {isToday ? '★ ' : '   '}
                          {line}
                        </Text>
                      );
                    })}
                  </View>
                )}

              {/* REVIEW HIGHLIGHTS */}
              {bundle?.enrichment?.reviewHighlights &&
                bundle.enrichment.reviewHighlights.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>From the experts</Text>
                    {bundle.enrichment.reviewHighlights.map((r, i) => (
                      <View key={i} style={styles.quote}>
                        <Text style={[styles.quoteSource, { color: accent }]}>
                          {r.source}
                        </Text>
                        <Text style={styles.quoteText}>"{r.quote}"</Text>
                      </View>
                    ))}
                  </View>
                )}

              {/* GOOGLE REVIEW EXCERPTS */}
              {bundle?.details?.reviews && bundle.details.reviews.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent visitor reviews</Text>
                  {bundle.details.reviews.slice(0, 3).map((r, i) => (
                    <View key={i} style={styles.review}>
                      <Text style={styles.reviewHeader}>
                        ★ {r.rating}{' '}
                        <Text style={styles.reviewMeta}>
                          {r.authorName} · {r.relativeTime}
                        </Text>
                      </Text>
                      <Text style={styles.reviewText} numberOfLines={6}>
                        {r.text}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* CONTACT / LINKS */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Visit / book / call</Text>
                <View style={styles.contactGrid}>
                  {bundle?.details?.website && (
                    <Pressable
                      style={[styles.contactBtn, { borderColor: accent }]}
                      onPress={() => openLink(bundle.details!.website)}
                    >
                      <Text style={[styles.contactBtnText, { color: accent }]}>
                        🌐 Website
                      </Text>
                    </Pressable>
                  )}
                  {bundle?.details?.url && (
                    <Pressable
                      style={[styles.contactBtn, { borderColor: accent }]}
                      onPress={() => openLink(bundle.details!.url)}
                    >
                      <Text style={[styles.contactBtnText, { color: accent }]}>
                        📍 Google Maps
                      </Text>
                    </Pressable>
                  )}
                  {bundle?.details?.formattedPhoneNumber && (
                    <Pressable
                      style={[styles.contactBtn, { borderColor: accent }]}
                      onPress={() => openLink(`tel:${bundle.details!.internationalPhoneNumber ?? bundle.details!.formattedPhoneNumber}`)}
                    >
                      <Text style={[styles.contactBtnText, { color: accent }]}>
                        ☎ {bundle.details.formattedPhoneNumber}
                      </Text>
                    </Pressable>
                  )}
                  {bundle?.enrichment?.instagramHandle && (
                    <Pressable
                      style={[styles.contactBtn, { borderColor: accent }]}
                      onPress={() =>
                        openLink(
                          `https://instagram.com/${bundle.enrichment!.instagramHandle!.replace(/^@/, '')}`
                        )
                      }
                    >
                      <Text style={[styles.contactBtnText, { color: accent }]}>
                        📷 {bundle.enrichment.instagramHandle}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {bundle?.details?.formattedAddress && (
                  <Text style={styles.address}>
                    {bundle.details.formattedAddress}
                  </Text>
                )}
              </View>

              {/* LOADING SIGNAL */}
              {(detailsLoading || enrichmentLoading) && (
                <View style={styles.loadingFooter}>
                  <Text style={styles.loadingText}>
                    {enrichmentLoading
                      ? 'Claude is enriching this venue with expert sources…'
                      : 'Fetching Google details…'}
                  </Text>
                </View>
              )}

              <View style={{ height: spacing.xxl }} />
            </View>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl },

  heroWrap: { position: 'relative' },
  heroPhoto: { height: 320, backgroundColor: colors.bgCard },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  closeButton: {
    position: 'absolute',
    top: spacing.s,
    right: spacing.l,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { color: colors.text, fontSize: 18, fontWeight: '700' },

  heroBottom: {
    position: 'absolute',
    left: spacing.l,
    right: spacing.l,
    bottom: spacing.l,
  },
  rankPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginBottom: spacing.s,
  },
  rankText: {
    ...typography.micro,
    color: '#0B0B12',
    fontWeight: '800',
  },
  placeName: {
    ...typography.display,
    color: colors.text,
    fontSize: 30,
    lineHeight: 34,
    marginBottom: 6,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  metaPrimary: { ...typography.bodyBold, color: colors.text },
  metaDim: { ...typography.small, color: colors.textMuted },
  neighborhood: { ...typography.small, color: colors.textMuted },

  body: {
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
  },

  whyTodayCard: {
    padding: spacing.m,
    borderRadius: radius.l,
    borderWidth: 1.5,
    backgroundColor: colors.bgCard,
    marginBottom: spacing.l,
    ...shadow.soft,
  },
  whyTodayLabel: {
    ...typography.micro,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  whyTodayText: {
    ...typography.h3,
    color: colors.text,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  bestFit: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 8,
  },

  section: { marginBottom: spacing.l },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.s,
    fontSize: 16,
  },
  body2: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },

  bullet: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  bulletDot: { fontSize: 18, marginRight: 8, fontWeight: '900' },
  bulletText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 22 },

  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.s,
  },
  sourceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  sourceText: { ...typography.micro, fontWeight: '700' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  tagText: { ...typography.small, fontWeight: '700' },

  hourLine: {
    ...typography.body,
    color: colors.text,
    paddingVertical: 3,
    fontFamily: 'monospace',
    fontSize: 13,
  },

  quote: {
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: 12,
    marginBottom: 10,
  },
  quoteSource: {
    ...typography.micro,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  quoteText: {
    ...typography.body,
    color: colors.text,
    fontStyle: 'italic',
    lineHeight: 22,
  },

  review: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewHeader: { ...typography.bodyBold, color: colors.text, marginBottom: 4 },
  reviewMeta: { ...typography.small, color: colors.textMuted, fontWeight: '400' },
  reviewText: { ...typography.body, color: colors.text, lineHeight: 21 },

  contactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.s,
  },
  contactBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: colors.bgCard,
  },
  contactBtnText: { ...typography.bodyBold, fontSize: 14 },
  address: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 4,
  },

  loadingFooter: {
    alignItems: 'center',
    paddingVertical: spacing.m,
  },
  loadingText: {
    ...typography.small,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  skel: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.m,
    marginVertical: 4,
  },
});

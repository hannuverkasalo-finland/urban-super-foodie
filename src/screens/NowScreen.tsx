import { useEffect } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import LoadingState from '../components/LoadingState';
import StatusBanner from '../components/StatusBanner';
import { describeWeather } from '../api/openMeteo';
import { cityKeyFor, prefetchNow } from '../services/prefetchService';
import { useContentStore } from '../store/contentStore';
import { useLocationStore } from '../store/locationStore';
import { progressKeyFor } from '../store/progressStore';
import { useUserStore } from '../store/userStore';
import { colors, radius, spacing, typography } from '../theme';

function imageUrlFor(query: string, w = 600, h = 400): string {
  const seed = encodeURIComponent(`now-${query}`);
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

export default function NowScreen() {
  const city = useLocationStore((s) => s.city);
  const cityCache = useContentStore((s) => s.cityCache);
  const profile = useUserStore((s) => s.profile);

  const cityKey = city ? cityKeyFor(city.name, city.country) : null;
  const content = cityKey ? cityCache[cityKey] : undefined;
  const now = content?.nowContent;

  useEffect(() => {
    if (!city) return;
    if (!now || Date.now() - now.generatedAt > 30 * 60 * 1000) {
      prefetchNow(city.name, city.country, { force: !now });
    }
  }, [city, now]);

  function refresh() {
    if (!city) return;
    prefetchNow(city.name, city.country, { force: true });
  }

  if (!city) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.title}>Now</Text>
          <Text style={styles.empty}>
            We need a city to read the room. Pick one in any other tab.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!now) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Now</Text>
            <Text style={styles.subtitle}>{city.name} · reading the room…</Text>
          </View>
        </View>
        {cityKey && (
          <StatusBanner
            scopeKey={progressKeyFor(cityKey, 'now')}
            accent={colors.now}
            fallback={`Tuning into ${city.name} — weather, news, your vibe…`}
          />
        )}
        <LoadingState message={`Tuning into ${city.name}…`} />
      </SafeAreaView>
    );
  }

  const heroImage = now.imageQueries[0]
    ? imageUrlFor(now.imageQueries[0], 1080, 720)
    : imageUrlFor(now.cityName, 1080, 720);
  const weather = now.weather;
  const weatherInfo = weather
    ? describeWeather(weather.weatherCode)
    : { emoji: '🌡', label: '—' };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: heroImage }} style={styles.hero} />
          <LinearGradient
            colors={['rgba(11,11,18,0.0)', 'rgba(11,11,18,0.95)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroLabel}>NOW IN</Text>
            <Text style={styles.heroCity}>{now.cityName.toUpperCase()}</Text>
            {weather && (
              <View style={styles.weatherChip}>
                <Text style={styles.weatherEmoji}>{weatherInfo.emoji}</Text>
                <Text style={styles.weatherText}>
                  {weather.tempC}°C · {weatherInfo.label}
                </Text>
              </View>
            )}
          </View>
        </View>

        {cityKey && (
          <StatusBanner
            scopeKey={progressKeyFor(cityKey, 'now')}
            accent={colors.now}
          />
        )}

        <View style={styles.body}>
          <Text style={styles.slogan}>"{now.slogan}"</Text>

          <View style={styles.refreshRow}>
            <Text style={styles.bigPicHeader}>The vibe right now</Text>
            <Pressable onPress={refresh} style={styles.refreshButton}>
              <Text style={styles.refreshText}>↻ Refresh</Text>
            </Pressable>
          </View>
          <Text style={styles.bigPicture}>{now.bigPicture}</Text>

          {now.hourly && now.hourly.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Next 48h, hour-by-hour</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hourlyRow}
              >
                {now.hourly.map((h, i) => {
                  const w = describeWeather(h.weatherCode);
                  // Show a day-divider label only when dayLabel changes
                  const prev = i > 0 ? now.hourly![i - 1] : null;
                  const showDayHeader =
                    !prev || prev.dayLabel !== h.dayLabel;
                  return (
                    <View key={i} style={styles.hourCard}>
                      <Text style={styles.hourDay}>
                        {showDayHeader ? h.dayLabel : ' '}
                      </Text>
                      <Text style={styles.hourLabel}>{h.hourLabel}</Text>
                      <Text style={styles.hourEmoji}>{w.emoji}</Text>
                      <Text style={styles.hourTemp}>{h.tempC}°</Text>
                      <Text style={styles.hourPrecip}>
                        {h.precipitationProbability > 0
                          ? `${h.precipitationProbability}%`
                          : '—'}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {now.forecast && now.forecast.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Next 7 days</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.forecastRow}
              >
                {now.forecast.map((d, i) => {
                  const w = describeWeather(d.weatherCode);
                  return (
                    <View key={i} style={styles.forecastCard}>
                      <Text style={styles.forecastDay}>{d.weekday}</Text>
                      <Text style={styles.forecastEmoji}>{w.emoji}</Text>
                      <Text style={styles.forecastTemp}>
                        {d.highC}°
                      </Text>
                      <Text style={styles.forecastLow}>
                        {d.lowC}°
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {now.newsThemes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Talk of the town</Text>
              {now.newsThemes.map((t, i) => (
                <View key={i} style={styles.themeCard}>
                  <Text style={styles.themeTitle}>{t.title}</Text>
                  <Text style={styles.themeSummary}>{t.summary}</Text>
                </View>
              ))}
            </View>
          )}

          {now.schedule.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Your next 24h, hand-rolled for {profile.nickname || 'you'}
              </Text>
              {now.schedule.map((s, i) => (
                <View key={i} style={styles.scheduleRow}>
                  <View style={styles.scheduleDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleWhen}>{s.when}</Text>
                    <Text style={styles.scheduleActivity}>{s.activity}</Text>
                    {s.place && (
                      <Text style={styles.schedulePlace}>📍 {s.place}</Text>
                    )}
                    <Text style={styles.scheduleWhy}>{s.why}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {now.imageQueries.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{now.cityName} mood board</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moodRow}
              >
                {now.imageQueries.map((q, i) => (
                  <View key={i} style={styles.moodCard}>
                    <Image
                      source={{ uri: imageUrlFor(q, 500, 350) }}
                      style={styles.moodImage}
                    />
                    <Text style={styles.moodCaption} numberOfLines={2}>
                      {q}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your soundtrack</Text>
            <Pressable
              style={styles.linkCard}
              onPress={() => Linking.openURL(now.song.spotifyUrl)}
            >
              <Text style={styles.linkEmoji}>🎵</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{now.song.title}</Text>
                <Text style={styles.linkSub}>
                  {now.song.artist} · open in Spotify
                </Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Watch this first</Text>
            <Pressable
              style={styles.linkCard}
              onPress={() => Linking.openURL(now.video.youtubeUrl)}
            >
              <Text style={styles.linkEmoji}>📺</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{now.video.title}</Text>
                <Text style={styles.linkSub}>YouTube · "{now.video.query}"</Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Pressable
              style={styles.linkCard}
              onPress={() => Linking.openURL(now.wikiUrl)}
            >
              <Text style={styles.linkEmoji}>📚</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{now.wikiTitle}</Text>
                <Text style={styles.linkSub}>Read on Wikipedia</Text>
              </View>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Generated {Math.round((Date.now() - now.generatedAt) / 60000)} min
            ago · refresh anytime
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.s,
  },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.s,
  },
  heroWrap: {
    width: '100%',
    height: 260,
    backgroundColor: colors.bgCard,
    overflow: 'hidden',
  },
  hero: { width: '100%', height: '100%' },
  heroOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
  },
  heroLabel: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 2,
  },
  heroCity: {
    ...typography.display,
    color: colors.text,
    fontSize: 38,
    letterSpacing: -0.8,
    marginTop: 2,
  },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    marginTop: 10,
  },
  weatherEmoji: { fontSize: 18, marginRight: 6 },
  weatherText: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  body: { padding: spacing.l, gap: spacing.l },
  slogan: {
    ...typography.h2,
    color: colors.accent,
    lineHeight: 30,
    fontStyle: 'italic',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bigPicHeader: { ...typography.h3, color: colors.text },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.bgChip,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshText: { ...typography.small, color: colors.text, fontWeight: '600' },
  bigPicture: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  section: { gap: spacing.s },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  forecastRow: { flexDirection: 'row', gap: 8, paddingRight: spacing.l },
  forecastCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 64,
    backgroundColor: colors.bgCard,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  forecastDay: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
  },
  forecastEmoji: { fontSize: 26, marginVertical: 4 },
  forecastTemp: { ...typography.bodyBold, color: colors.text },
  forecastLow: { ...typography.small, color: colors.textMuted },
  hourlyRow: { flexDirection: 'row', gap: 6, paddingRight: spacing.l },
  hourCard: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: 56,
    backgroundColor: colors.bgCard,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hourDay: {
    ...typography.micro,
    color: colors.now,
    fontWeight: '700',
    marginBottom: 2,
  },
  hourLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  hourEmoji: { fontSize: 18, marginVertical: 2 },
  hourTemp: { ...typography.bodyBold, color: colors.text },
  hourPrecip: {
    ...typography.micro,
    color: colors.info,
    marginTop: 2,
  },
  themeCard: {
    backgroundColor: colors.bgCard,
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  themeTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 4,
  },
  themeSummary: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 19,
  },
  scheduleRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scheduleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 8,
    marginRight: 12,
  },
  scheduleWhen: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scheduleActivity: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: 2,
  },
  schedulePlace: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  scheduleWhy: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 4,
  },
  moodRow: { gap: 10, paddingRight: spacing.l },
  moodCard: { width: 220 },
  moodImage: {
    width: 220,
    height: 140,
    borderRadius: radius.m,
    backgroundColor: colors.bgCard,
  },
  moodCaption: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 6,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  linkEmoji: { fontSize: 28 },
  linkTitle: { ...typography.bodyBold, color: colors.text },
  linkSub: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  footer: {
    ...typography.small,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.m,
  },
});

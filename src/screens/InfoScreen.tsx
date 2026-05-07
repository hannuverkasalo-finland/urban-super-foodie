import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ContentPager from '../components/ContentPager';
import LoadingState from '../components/LoadingState';
import { useContentStore } from '../store/contentStore';
import { useLocationStore } from '../store/locationStore';
import { useUserStore } from '../store/userStore';
import { cityKeyFor, prefetchCity } from '../services/prefetchService';
import { colors, spacing, typography } from '../theme';

export default function InfoScreen() {
  const city = useLocationStore((s) => s.city);
  const cityCache = useContentStore((s) => s.cityCache);
  const status = useContentStore((s) => s.status);
  const preferences = useUserStore((s) => s.preferences);

  const cityKey = city ? cityKeyFor(city.name, city.country) : null;
  const content = cityKey ? cityCache[cityKey] : undefined;
  const cityStatus = cityKey ? status[cityKey] ?? 'idle' : 'idle';

  useEffect(() => {
    if (!city) return;
    if (cityStatus === 'loading' || cityStatus === 'ready') return;
    prefetchCity(city.name, city.country, preferences);
  }, [city, cityStatus, preferences]);

  if (!city) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.title}>Info</Text>
          <Text style={styles.empty}>
            Pick a city to learn what makes it special.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!content || content.infoPages.length === 0) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Info</Text>
          <Text style={styles.subtitle}>{city.name}</Text>
        </View>
        <LoadingState message={`Reading up on ${city.name}…`} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Info</Text>
        <Text style={styles.subtitle}>{city.name} essentials</Text>
      </View>
      <ContentPager pages={content.infoPages} fallbackAccent={colors.info} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.l, paddingBottom: spacing.s },
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
});

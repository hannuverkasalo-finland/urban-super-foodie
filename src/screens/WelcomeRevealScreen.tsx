import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import WelcomeCard from '../components/WelcomeCard';
import { cityKeyFor } from '../services/prefetchService';
import { buildWelcomeForCurrentCity } from '../services/welcomeService';
import { useLocationStore } from '../store/locationStore';
import { computeUserVersion, useUserStore } from '../store/userStore';
import { useWelcomeStore } from '../store/welcomeStore';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  /** Called when the user taps "Activate App" on the last slide. */
  onDone: () => void;
}

type Slide = 0 | 1 | 2;

/**
 * Three-page welcome reveal shown:
 *  1. immediately after onboarding completes (Step 3 Submit), AND
 *  2. on every cold-start once the user is onboarded + city resolved.
 *
 * Slides:
 *   0 — the WelcomeCard (city-landmark photo + your face + city emojis + headline)
 *   1 — the AI joke
 *   2 — the AI paragraph + "Activate App" button
 *
 * Content comes from welcomeStore. If a piece isn't ready yet (the user
 * raced ahead of the background generation), we show a soft placeholder
 * and the screen auto-reconciles as the store updates.
 */
export default function WelcomeRevealScreen({ onDone }: Props) {
  const [slide, setSlide] = useState<Slide>(0);
  const city = useLocationStore((s) => s.city);
  const profile = useUserStore((s) => s.profile);
  const cityKey = city ? cityKeyFor(city.name, city.country) : null;
  const welcome = useWelcomeStore((s) =>
    cityKey ? s.byCityKey[cityKey] : null
  );

  // Kick off generation if not started yet (handles the cold-start path where
  // the splash didn't pre-warm because the city resolved later).
  useEffect(() => {
    if (!cityKey) return;
    const userVersion = computeUserVersion();
    const fresh = useWelcomeStore.getState().getFresh(cityKey, userVersion);
    if (!fresh) {
      void buildWelcomeForCurrentCity({ force: false });
    }
  }, [cityKey]);

  // Mark that the user has seen at least one full reveal — used by Me-tab
  // analytics / future "what's new" prompts.
  useEffect(() => {
    if (slide === 2) {
      useWelcomeStore.getState().setHasSeenReveal(true);
    }
  }, [slide]);

  if (!city || !cityKey) {
    // Defensive — AppNavigator should only mount this once city is resolved.
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skipRow}>
          <View />
          <Pressable onPress={onDone}>
            <Text style={styles.skipText}>Skip ›</Text>
          </Pressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.placeholder}>Locating you…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        <View style={styles.dotsRow}>
          <View style={[styles.dot, slide === 0 && styles.dotActive]} />
          <View style={[styles.dot, slide === 1 && styles.dotActive]} />
          <View style={[styles.dot, slide === 2 && styles.dotActive]} />
        </View>
        <Pressable onPress={onDone} hitSlop={16}>
          <Text style={styles.skipText}>Skip ›</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {slide === 0 && (
          <Slide0
            welcome={welcome}
            photoUri={profile.photoUri}
            nickname={profile.nickname}
            cityName={city.name}
          />
        )}
        {slide === 1 && (
          <Slide1 joke={welcome?.joke ?? ''} cityName={city.name} />
        )}
        {slide === 2 && (
          <Slide2
            paragraph={welcome?.paragraph ?? ''}
            cityName={city.name}
            nickname={profile.nickname}
          />
        )}
      </ScrollView>

      <View style={styles.cta}>
        {slide < 2 ? (
          <Button
            label="Next"
            onPress={() => setSlide(((slide + 1) as Slide))}
          />
        ) : (
          <Button label="Activate App" onPress={onDone} />
        )}
        {slide > 0 && (
          <Button
            label="Back"
            variant="ghost"
            onPress={() => setSlide(((slide - 1) as Slide))}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// ============================================================
// Slides
// ============================================================

function Slide0({
  welcome,
  photoUri,
  nickname,
  cityName,
}: {
  welcome: ReturnType<typeof useWelcomeStore.getState>['byCityKey'][string] | null;
  photoUri: string | null;
  nickname: string;
  cityName: string;
}) {
  if (!welcome?.cardSpec) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.placeholder}>
          Crafting your welcome card for {cityName}…
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.slideWrap}>
      <Text style={styles.slideHeader}>YOU JUST LANDED</Text>
      <WelcomeCard
        spec={welcome.cardSpec}
        photoUri={photoUri}
        nickname={nickname}
        cityName={cityName}
      />
      <Text style={styles.slideFootnote}>
        Tap Next to read the joke we wrote about you.
      </Text>
    </View>
  );
}

function Slide1({ joke, cityName }: { joke: string; cityName: string }) {
  return (
    <View style={styles.slideWrap}>
      <Text style={styles.slideHeader}>THE OPENING LINE</Text>
      <View style={styles.jokeCard}>
        <Text style={styles.jokeQuote}>"</Text>
        {joke ? (
          <Text style={styles.jokeText}>{joke}</Text>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.eat} />
            <Text style={styles.placeholder}>
              Claude's still rolling the joke for you in {cityName}…
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.slideFootnote}>
        Tap Next for your 24-hour plot in {cityName}.
      </Text>
    </View>
  );
}

function Slide2({
  paragraph,
  cityName,
  nickname,
}: {
  paragraph: string;
  cityName: string;
  nickname: string;
}) {
  return (
    <View style={styles.slideWrap}>
      <Text style={styles.slideHeader}>YOUR NEXT 24 HOURS</Text>
      <View style={styles.paragraphCard}>
        {paragraph ? (
          <Text style={styles.paragraphText}>{paragraph}</Text>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.drink} />
            <Text style={styles.placeholder}>
              Plotting your moves in {cityName}, {nickname || 'foodie'}…
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.slideFootnote}>
        Hit Activate App to drop into the map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.l,
    paddingTop: spacing.s,
    paddingBottom: spacing.s,
  },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.accent, width: 30 },
  skipText: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.l,
  },
  cta: {
    paddingHorizontal: spacing.l,
    paddingBottom: spacing.l,
    gap: spacing.s,
  },
  slideWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.l,
    gap: spacing.l,
  },
  slideHeader: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 4,
    fontWeight: '800',
  },
  slideFootnote: {
    ...typography.small,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.m,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
  placeholder: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
  jokeCard: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    minHeight: 200,
  },
  jokeQuote: {
    fontSize: 56,
    color: colors.accent,
    fontWeight: '900',
    lineHeight: 56,
    marginBottom: -10,
  },
  jokeText: {
    ...typography.h3,
    color: colors.text,
    lineHeight: 28,
    fontWeight: '500',
  },
  paragraphCard: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    minHeight: 280,
  },
  paragraphText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 26,
  },
});

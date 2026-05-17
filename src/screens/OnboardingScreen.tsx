import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Button from '../components/Button';
import MultiSelectChips from '../components/MultiSelectChips';
import PreferenceSlider from '../components/PreferenceSlider';
import { ACTIVITY_TYPES } from '../constants/activityTypes';
import { DRINK_STYLES } from '../constants/drinkStyles';
import { FOOD_STYLES } from '../constants/foodStyles';
import { LANGUAGES } from '../constants/languages';
import { useLocationStore } from '../store/locationStore';
import { useUserStore } from '../store/userStore';
import { prefetchCity } from '../services/prefetchService';
import {
  buildWelcomeForCurrentCity,
  buildWelcomeParagraphOnly,
} from '../services/welcomeService';
import { colors, radius, spacing, typography } from '../theme';
import type { Gender } from '../types';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

const currentYear = new Date().getFullYear();

type Step = 1 | 2 | 3;

interface Props {
  /** Called when all 3 steps complete and the user submits the sliders. */
  onDone: () => void;
}

/**
 * 3-step onboarding:
 *   Step 1 — photo + basic profile.   "Next" triggers welcome card + joke gen
 *                                     in the background.
 *   Step 2 — food/drink/activity prefs. "Submit" triggers full city prefetch
 *                                     and welcome paragraph gen in background.
 *   Step 3 — three vibe sliders.       "Submit" marks the user onboarded; the
 *                                     AppNavigator then shows WelcomeReveal.
 *
 * The earlier steps fire-and-forget AI work so by the time the user lands on
 * the reveal screen, most/all of the welcome content is already cached.
 */
export default function OnboardingScreen({ onDone }: Props) {
  const [step, setStep] = useState<Step>(1);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.stepBarWrap}>
        <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
        <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]} />
      </View>
      {step === 1 && (
        <Step1
          onNext={() => {
            // Fire-and-forget background generation. Step 1 has profile + city,
            // which is enough for the card spec and joke. Paragraph waits for prefs.
            void buildWelcomeForCurrentCity({ skipParagraph: true, force: true });
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <Step2
          onBack={() => setStep(1)}
          onNext={() => {
            // Kick off the heavy city research now that we have preferences.
            const city = useLocationStore.getState().city;
            const prefs = useUserStore.getState().preferences;
            if (city) {
              void prefetchCity(city.name, city.country, prefs);
            }
            // Generate the welcome paragraph now that we have prefs.
            void buildWelcomeParagraphOnly();
            setStep(3);
          }}
        />
      )}
      {step === 3 && (
        <Step3
          onBack={() => setStep(2)}
          onSubmit={() => {
            // User is officially onboarded. Re-trigger welcome with the full
            // userVersion (now including slider values) so the cached card+joke
            // get re-tagged but won't regenerate (cached match).
            void buildWelcomeForCurrentCity({ force: false });
            useUserStore.getState().setHasOnboarded(true);
            onDone();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ============================================================
// Step 1: photo + profile basics
// ============================================================

function Step1({ onNext }: { onNext: () => void }) {
  const profile = useUserStore((s) => s.profile);
  const updateProfile = useUserStore((s) => s.updateProfile);
  const [yearText, setYearText] = useState(
    profile.birthYear ? String(profile.birthYear) : ''
  );
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function pickPhoto() {
    setPhotoError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setPhotoError('Photo library permission denied');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        exif: false,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        setPhotoError('Picker returned no uri');
        return;
      }
      updateProfile({ photoUri: uri });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhotoError(msg);
    }
  }

  function commitYear() {
    const v = parseInt(yearText, 10);
    if (Number.isFinite(v) && v >= 1900 && v <= currentYear) {
      updateProfile({ birthYear: v });
    } else if (yearText.trim() === '') {
      updateProfile({ birthYear: null });
    }
  }

  const isValid =
    profile.nickname.trim().length >= 2 &&
    !!profile.language &&
    !!profile.gender &&
    profile.birthYear !== null;

  function next() {
    commitYear();
    onNext();
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
      <Text style={styles.title}>Welcome,{'\n'}foodie traveler.</Text>
      <Text style={styles.subtitle}>
        Tell us who you are. We'll start dreaming up your welcome the moment
        you tap Next.
      </Text>

      <View style={styles.photoBlock}>
        <Pressable
          onPress={pickPhoto}
          style={({ pressed }) => [
            styles.photoButton,
            pressed && { opacity: 0.85 },
          ]}
        >
          {profile.photoUri ? (
            <Image
              source={{ uri: profile.photoUri }}
              style={styles.photo}
              onError={() => {
                // Stale URI — drop it silently and let the user re-pick.
                updateProfile({ photoUri: null });
              }}
            />
          ) : (
            <Text style={styles.photoPlaceholder}>📷</Text>
          )}
        </Pressable>
        <Text style={styles.photoLabel}>
          {profile.photoUri ? 'Tap to change' : 'Add a photo'}
        </Text>
        {photoError && (
          <Text style={styles.photoErrorText} selectable>
            {photoError}
          </Text>
        )}
      </View>

      <Field label="Nickname">
        <TextInput
          style={styles.input}
          placeholder="What should we call you?"
          placeholderTextColor={colors.textDim}
          value={profile.nickname}
          onChangeText={(v) => updateProfile({ nickname: v })}
        />
      </Field>

      <Field label="Language">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {LANGUAGES.map((lang) => {
            const on = profile.language === lang;
            return (
              <Pressable
                key={lang}
                onPress={() => updateProfile({ language: lang })}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
                  {lang}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Field>

      <Field label="Year of birth">
        <TextInput
          style={styles.input}
          placeholder="e.g. 1992"
          placeholderTextColor={colors.textDim}
          value={yearText}
          onChangeText={setYearText}
          onBlur={commitYear}
          keyboardType="number-pad"
          maxLength={4}
        />
      </Field>

      <Field label="Gender">
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map((g) => {
            const on = profile.gender === g.value;
            return (
              <Pressable
                key={g.value}
                onPress={() => updateProfile({ gender: g.value })}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <View style={styles.cta}>
        <Button label="Next" onPress={next} disabled={!isValid} />
        <Text style={styles.note}>
          You can edit any of this later in the Me tab.
        </Text>
      </View>
    </ScrollView>
  );
}

// ============================================================
// Step 2: food / drink / activity preferences
// ============================================================

function Step2({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const preferences = useUserStore((s) => s.preferences);
  const updatePreferences = useUserStore((s) => s.updatePreferences);
  const toggleFoodStyle = useUserStore((s) => s.toggleFoodStyle);
  const toggleDrinkStyle = useUserStore((s) => s.toggleDrinkStyle);
  const toggleActivity = useUserStore((s) => s.toggleActivity);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
      <Text style={styles.title}>Your tastes.</Text>
      <Text style={styles.subtitle}>
        Pick as many as you like. We'll start the deep research the moment you
        tap Submit.
      </Text>

      <Section title="Food styles" accent={colors.eat}>
        <MultiSelectChips
          options={FOOD_STYLES}
          selected={preferences.foodStyles}
          onToggle={toggleFoodStyle}
          accent={colors.eat}
        />
        <TextInput
          style={[styles.input, styles.freeText]}
          placeholder="Anything else? Specific dishes, vibes, must-haves…"
          placeholderTextColor={colors.textDim}
          multiline
          value={preferences.foodFreeText}
          onChangeText={(v) => updatePreferences({ foodFreeText: v })}
        />
      </Section>

      <Section title="Drink styles" accent={colors.drink}>
        <MultiSelectChips
          options={DRINK_STYLES}
          selected={preferences.drinkStyles}
          onToggle={toggleDrinkStyle}
          accent={colors.drink}
        />
        <TextInput
          style={[styles.input, styles.freeText]}
          placeholder="Anything else? Producers, regions, styles…"
          placeholderTextColor={colors.textDim}
          multiline
          value={preferences.drinkFreeText}
          onChangeText={(v) => updatePreferences({ drinkFreeText: v })}
        />
      </Section>

      <Section title="Activity types" accent={colors.do}>
        <MultiSelectChips
          options={ACTIVITY_TYPES}
          selected={preferences.activityTypes}
          onToggle={toggleActivity}
          accent={colors.do}
        />
      </Section>

      <View style={styles.cta}>
        <Button label="Submit" onPress={onNext} />
        <Button label="Back" variant="ghost" onPress={onBack} />
      </View>
    </ScrollView>
  );
}

// ============================================================
// Step 3: vibe sliders
// ============================================================

function Step3({
  onBack,
  onSubmit,
}: {
  onBack: () => void;
  onSubmit: () => void;
}) {
  const ext = useUserStore((s) => s.extendedPreferences);
  const update = useUserStore((s) => s.updateExtendedPreferences);
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
      <Text style={styles.title}>Your vibe.</Text>
      <Text style={styles.subtitle}>
        Three quick sliders so we know which way to lean. Drag wherever feels
        right — there's no wrong answer.
      </Text>

      <View style={styles.slidersBlock}>
        <PreferenceSlider
          label="Style"
          leftLabel="Classic / Elegant"
          rightLabel="Hipster / Explorative"
          value={ext.classicHipster}
          onChange={(v) => update({ classicHipster: v })}
          accent={colors.accent}
        />
        <PreferenceSlider
          label="Discovery"
          leftLabel="Must-do icons"
          rightLabel="New & interesting"
          value={ext.mustDoVsNew}
          onChange={(v) => update({ mustDoVsNew: v })}
          accent={colors.eat}
        />
        <PreferenceSlider
          label="Risk"
          leftLabel="Safe choices"
          rightLabel="Funky & crazy"
          value={ext.safeFunky}
          onChange={(v) => update({ safeFunky: v })}
          accent={colors.drink}
        />
      </View>

      <View style={styles.cta}>
        <Button label="Submit" onPress={onSubmit} />
        <Button label="Back" variant="ghost" onPress={onBack} />
      </View>
    </ScrollView>
  );
}

// ============================================================
// Reusable layout pieces
// ============================================================

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, accent ? { color: accent } : null]}>
        {title}
      </Text>
      <View style={{ marginTop: spacing.s }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  stepBarWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 56,
    paddingBottom: 8,
  },
  stepDot: {
    width: 32,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  stepDotActive: { backgroundColor: colors.accent },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  stepLabel: {
    ...typography.micro,
    color: colors.textMuted,
    letterSpacing: 2,
    fontWeight: '700',
  },
  title: {
    ...typography.display,
    color: colors.text,
    marginTop: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.s,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  photoBlock: { alignItems: 'center', marginBottom: spacing.xl },
  photoButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.bgChip,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { fontSize: 36 },
  photoLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.s,
  },
  photoErrorText: {
    ...typography.small,
    color: colors.danger,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: spacing.l,
  },
  field: { marginBottom: spacing.l },
  fieldLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.s,
  },
  input: {
    backgroundColor: colors.bgChip,
    borderRadius: radius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  freeText: {
    minHeight: 90,
    marginTop: spacing.s,
    textAlignVertical: 'top',
  },
  chipRow: { gap: 8, paddingRight: spacing.l },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.bgChip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { ...typography.small, color: colors.textMuted },
  chipLabelOn: { color: '#0B0B12', fontWeight: '700' },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.h2,
    color: colors.text,
  },
  slidersBlock: { marginTop: spacing.m },
  cta: { marginTop: spacing.l, gap: spacing.s },
  note: {
    ...typography.small,
    color: colors.textDim,
    textAlign: 'center',
  },
});

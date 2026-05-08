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
import { LANGUAGES } from '../constants/languages';
import { useUserStore } from '../store/userStore';
import { colors, radius, spacing, typography } from '../theme';
import type { Gender } from '../types';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

const currentYear = new Date().getFullYear();

interface Props {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: Props) {
  const { profile, updateProfile, setHasOnboarded } = useUserStore();
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
        mediaTypes: 'images',
        quality: 0.6,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        setPhotoError('Picker returned no uri');
        return;
      }
      console.log('[USF] onboarding photo uri:', uri);
      updateProfile({ photoUri: uri });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhotoError(msg);
      console.warn('[USF] onboarding pickPhoto failed:', msg);
    }
  }

  function commitYear() {
    const v = parseInt(yearText, 10);
    if (Number.isFinite(v) && v >= 1900 && v <= currentYear) {
      updateProfile({ birthYear: v });
    } else {
      updateProfile({ birthYear: null });
    }
  }

  const isValid =
    profile.nickname.trim().length >= 2 &&
    !!profile.language &&
    !!profile.gender &&
    profile.birthYear !== null;

  function finish() {
    commitYear();
    setHasOnboarded(true);
    onDone();
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Welcome,{'\n'}foodie traveler.</Text>
        <Text style={styles.subtitle}>
          A couple of details so the city is curated just for you.
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
                onError={(e) => {
                  const msg = e.nativeEvent.error ?? 'unknown';
                  setPhotoError(`Image render failed: ${msg}`);
                  console.warn('[USF] onboarding image error:', msg);
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

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Nickname</Text>
          <TextInput
            style={styles.input}
            placeholder="What should we call you?"
            placeholderTextColor={colors.textDim}
            value={profile.nickname}
            onChangeText={(v) => updateProfile({ nickname: v })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Language</Text>
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
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Year of birth</Text>
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
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Gender</Text>
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
        </View>

        <View style={styles.cta}>
          <Button
            label="Continue"
            onPress={finish}
            disabled={!isValid}
          />
          <Text style={styles.note}>
            You can edit any of this later in the Me tab.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  title: {
    ...typography.display,
    color: colors.text,
    marginTop: spacing.xl,
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
  chipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipLabel: { ...typography.small, color: colors.textMuted },
  chipLabelOn: { color: '#0B0B12', fontWeight: '700' },
  cta: { marginTop: spacing.l, gap: spacing.s },
  note: {
    ...typography.small,
    color: colors.textDim,
    textAlign: 'center',
  },
});

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
import { SafeAreaView } from 'react-native-safe-area-context';
import MultiSelectChips from '../components/MultiSelectChips';
import Section from '../components/Section';
import { ACTIVITY_TYPES } from '../constants/activityTypes';
import { DRINK_STYLES } from '../constants/drinkStyles';
import { FOOD_STYLES } from '../constants/foodStyles';
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

export default function MeScreen() {
  const profile = useUserStore((s) => s.profile);
  const preferences = useUserStore((s) => s.preferences);
  const updateProfile = useUserStore((s) => s.updateProfile);
  const updatePreferences = useUserStore((s) => s.updatePreferences);
  const toggleFoodStyle = useUserStore((s) => s.toggleFoodStyle);
  const toggleDrinkStyle = useUserStore((s) => s.toggleDrinkStyle);
  const toggleActivity = useUserStore((s) => s.toggleActivity);

  const [yearText, setYearText] = useState(
    profile.birthYear ? String(profile.birthYear) : ''
  );

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ photoUri: result.assets[0].uri });
    }
  }

  function commitYear() {
    const v = parseInt(yearText, 10);
    if (Number.isFinite(v) && v >= 1900 && v <= new Date().getFullYear()) {
      updateProfile({ birthYear: v });
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headline}>Me</Text>
          <Text style={styles.lead}>
            Tune your tastes — we'll re-curate every city you visit.
          </Text>

          <View style={styles.profileBlock}>
            <Pressable onPress={pickPhoto} style={styles.avatar}>
              {profile.photoUri ? (
                <Image
                  source={{ uri: profile.photoUri }}
                  style={styles.avatarImg}
                />
              ) : (
                <Text style={styles.avatarPlaceholder}>📷</Text>
              )}
            </Pressable>
            <View style={{ flex: 1, marginLeft: spacing.m }}>
              <Text style={styles.greet}>
                {profile.nickname || 'foodie'}
              </Text>
              <Text style={styles.greetSub}>
                {profile.birthYear ? `${profile.birthYear} · ` : ''}
                {profile.gender ?? '—'} · {profile.language}
              </Text>
            </View>
          </View>

          <Section title="Profile">
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
              <View style={styles.row}>
                {GENDER_OPTIONS.map((g) => {
                  const on = profile.gender === g.value;
                  return (
                    <Pressable
                      key={g.value}
                      onPress={() => updateProfile({ gender: g.value })}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text
                        style={[styles.chipLabel, on && styles.chipLabelOn]}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                      <Text
                        style={[styles.chipLabel, on && styles.chipLabelOn]}
                      >
                        {lang}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Section>

          <Section
            title="Food styles"
            subtitle="What you love to eat — pick as many as you like."
          >
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

          <Section
            title="Drink styles"
            subtitle="From craft beer to natural wine, pour your loves."
          >
            <MultiSelectChips
              options={DRINK_STYLES}
              selected={preferences.drinkStyles}
              onToggle={toggleDrinkStyle}
              accent={colors.drink}
            />
            <TextInput
              style={[styles.input, styles.freeText]}
              placeholder="Anything else? Specific producers, regions, styles…"
              placeholderTextColor={colors.textDim}
              multiline
              value={preferences.drinkFreeText}
              onChangeText={(v) => updatePreferences({ drinkFreeText: v })}
            />
          </Section>

          <Section
            title="Activity types"
            subtitle="What you like to do in a new city."
          >
            <MultiSelectChips
              options={ACTIVITY_TYPES}
              selected={preferences.activityTypes}
              onToggle={toggleActivity}
              accent={colors.do}
            />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  headline: { ...typography.display, color: colors.text },
  lead: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.l,
  },
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    backgroundColor: colors.bgCard,
    borderRadius: radius.l,
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgChip,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 26 },
  greet: { ...typography.h2, color: colors.text },
  greetSub: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  field: { marginBottom: spacing.m },
  fieldLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipRow: { gap: 8, paddingRight: spacing.l },
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
});

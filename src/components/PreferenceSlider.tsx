import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number; // 0..1
  onChange: (v: number) => void;
  accent?: string;
}

/**
 * Labeled 0..1 slider with two-end vibe captions and a percentage badge.
 * Used in OnboardingStep3 and the Me tab for the three vibe axes:
 * classic↔hipster, must-do↔new, safe↔funky.
 */
export default function PreferenceSlider({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
  accent = colors.accent,
}: Props) {
  const pctLeft = Math.round((1 - value) * 100);
  const pctRight = Math.round(value * 100);
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.pctPill, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={[styles.pctText, { color: accent }]}>
            {pctLeft}% / {pctRight}%
          </Text>
        </View>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.05}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={accent}
      />
      <View style={styles.ends}>
        <Text
          style={[
            styles.endLabel,
            value < 0.5 ? { color: accent, fontWeight: '700' } : null,
          ]}
        >
          {leftLabel}
        </Text>
        <Text
          style={[
            styles.endLabel,
            value > 0.5 ? { color: accent, fontWeight: '700' } : null,
            { textAlign: 'right' },
          ]}
        >
          {rightLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.l,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    ...typography.bodyBold,
    color: colors.text,
  },
  pctPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pctText: {
    ...typography.micro,
    fontWeight: '700',
  },
  slider: {
    width: '100%',
    height: 32,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  endLabel: {
    ...typography.small,
    color: colors.textMuted,
    flex: 1,
  },
});

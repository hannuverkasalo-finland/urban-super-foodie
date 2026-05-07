import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography } from '../theme';

interface Props {
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
  accent?: string;
}

export default function MultiSelectChips({
  options,
  selected,
  onToggle,
  accent = colors.accent,
}: Props) {
  return (
    <View style={styles.wrap}>
      {options.map((option) => {
        const isOn = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            style={({ pressed }) => [
              styles.chip,
              isOn && { backgroundColor: accent, borderColor: accent },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                isOn && styles.labelOn,
              ]}
              numberOfLines={1}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.bgChip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...typography.small,
    color: colors.textMuted,
  },
  labelOn: {
    color: '#0B0B12',
    fontWeight: '700',
  },
  pressed: { opacity: 0.85 },
});

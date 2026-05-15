import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useProgressStore } from '../store/progressStore';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  /** Progress key to subscribe to (e.g. "como--italy::eat", "menu"). */
  scopeKey: string;
  /** Accent color for the pulsing indicator. Defaults to category accent. */
  accent?: string;
  /** Optional positional override (e.g. for overlaying a map). */
  style?: StyleProp<ViewStyle>;
  /** Optional override of the message. If provided, displayed when no live status. */
  fallback?: string;
}

/**
 * A slim live-status banner. Renders only when there's a fresh message for
 * the given scopeKey (or a fallback is supplied). The pulsing dot conveys
 * "work is still happening" — distinct from a static label.
 *
 * Designed to sit at the top of a screen, just under the header.
 */
export default function StatusBanner({ scopeKey, accent, style, fallback }: Props) {
  const entry = useProgressStore((s) => s.byKey[scopeKey]);
  const message = entry?.message ?? fallback;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!entry) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [entry, pulse]);

  if (!message) return null;

  const dotOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });
  const dotScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.2],
  });
  const dotColor = accent ?? colors.accent;

  return (
    <View style={[styles.row, style]}>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: dotColor,
            opacity: dotOpacity,
            transform: [{ scale: dotScale }],
          },
        ]}
      />
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.l,
    marginBottom: spacing.s,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.bgCard,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  text: {
    ...typography.small,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
});

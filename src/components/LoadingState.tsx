import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  message?: string;
}

export default function LoadingState({
  message = 'Curating the city for you…',
}: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spin]);
  const rot = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <View style={styles.wrap}>
      <Animated.Text style={[styles.spinner, { transform: [{ rotate: rot }] }]}>
        🌍
      </Animated.Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  spinner: { fontSize: 64, marginBottom: spacing.m },
  text: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

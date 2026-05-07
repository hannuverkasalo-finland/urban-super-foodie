import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, typography } from '../theme';

const { width } = Dimensions.get('window');
const ORBIT_RADIUS = Math.min(width * 0.32, 130);

const ORBITERS = ['🍷', '🍣', '🍝', '🥖', '🍜', '🥃', '🍰', '🍤'];

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const rotate = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const globeScale = useRef(new Animated.Value(0.6)).current;
  const orbitOpacities = useRef(
    ORBITERS.map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.parallel([
      Animated.spring(globeScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.stagger(
        110,
        orbitOpacities.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          })
        )
      ),
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(titleScale, {
            toValue: 1,
            friction: 7,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const timeout = setTimeout(onFinish, 5000);
    return () => clearTimeout(timeout);
  }, [
    rotate,
    titleOpacity,
    titleScale,
    tagOpacity,
    globeScale,
    orbitOpacities,
    onFinish,
  ]);

  const rotateInterp = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <LinearGradient
      colors={['#0B0B12', '#1A0F2E', '#3B0F3A', '#4A1D1F']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <View style={styles.center}>
        <View style={styles.orbitWrap}>
          <Animated.View
            style={[styles.orbit, { transform: [{ rotate: rotateInterp }] }]}
          >
            {ORBITERS.map((emoji, i) => {
              const angle = (i / ORBITERS.length) * Math.PI * 2;
              const x = Math.cos(angle) * ORBIT_RADIUS;
              const y = Math.sin(angle) * ORBIT_RADIUS;
              return (
                <Animated.Text
                  key={emoji + i}
                  style={[
                    styles.orbiter,
                    {
                      transform: [
                        { translateX: x },
                        { translateY: y },
                      ],
                      opacity: orbitOpacities[i],
                    },
                  ]}
                >
                  {emoji}
                </Animated.Text>
              );
            })}
          </Animated.View>
          <Animated.Text
            style={[
              styles.globe,
              { transform: [{ scale: globeScale }] },
            ]}
          >
            🌍
          </Animated.Text>
        </View>

        <Animated.Text
          style={[
            styles.title,
            {
              opacity: titleOpacity,
              transform: [{ scale: titleScale }],
            },
          ]}
        >
          Urban{'\n'}Super Foodie
        </Animated.Text>

        <Animated.Text style={[styles.tag, { opacity: tagOpacity }]}>
          Curated cities, on your map.
        </Animated.Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  orbitWrap: {
    width: ORBIT_RADIUS * 2 + 80,
    height: ORBIT_RADIUS * 2 + 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  orbit: {
    position: 'absolute',
    width: ORBIT_RADIUS * 2 + 80,
    height: ORBIT_RADIUS * 2 + 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbiter: {
    position: 'absolute',
    fontSize: 28,
  },
  globe: { fontSize: 96 },
  title: {
    ...typography.display,
    color: colors.text,
    textAlign: 'center',
    fontSize: 44,
    lineHeight: 50,
  },
  tag: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 12,
    letterSpacing: 0.3,
    fontSize: 16,
  },
});

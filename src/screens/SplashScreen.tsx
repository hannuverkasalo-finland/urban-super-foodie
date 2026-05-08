import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { playIntroFanfare, stopIntroFanfare } from '../services/audio';
import { colors, typography } from '../theme';

const { width, height } = Dimensions.get('window');
const ORBIT_RADIUS = Math.min(width * 0.32, 130);

const ORBITERS = ['🍷', '🍣', '🍝', '🥖', '🍜', '🥃', '🍰', '🍤'];

const CITY_FRAMES: { name: string; uri: string }[] = [
  { name: 'TOKYO', uri: 'https://picsum.photos/seed/usf-tokyo-night/720/1280' },
  { name: 'PARIS', uri: 'https://picsum.photos/seed/usf-paris-eiffel/720/1280' },
  { name: 'NEW YORK', uri: 'https://picsum.photos/seed/usf-nyc-skyline/720/1280' },
  { name: 'LISBON', uri: 'https://picsum.photos/seed/usf-lisbon-tram/720/1280' },
  { name: 'MARRAKECH', uri: 'https://picsum.photos/seed/usf-marrakech-souk/720/1280' },
  { name: 'ISTANBUL', uri: 'https://picsum.photos/seed/usf-istanbul-bosphorus/720/1280' },
  { name: 'BANGKOK', uri: 'https://picsum.photos/seed/usf-bangkok-temple/720/1280' },
  { name: 'CDMX', uri: 'https://picsum.photos/seed/usf-mexico-zocalo/720/1280' },
  { name: 'COPENHAGEN', uri: 'https://picsum.photos/seed/usf-copenhagen-nyhavn/720/1280' },
  { name: 'SINGAPORE', uri: 'https://picsum.photos/seed/usf-singapore-marina/720/1280' },
];

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
  const cityNameOpacity = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const [activeFrame, setActiveFrame] = useState(0);

  useEffect(() => {
    // Kick off the splash fanfare. Fire-and-forget; never blocks animation.
    void playIntroFanfare();

    Animated.timing(bgOpacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    const cityInterval = setInterval(() => {
      setActiveFrame((prev) => (prev + 1) % CITY_FRAMES.length);
      Animated.sequence([
        Animated.timing(cityNameOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(cityNameOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    }, 600);

    Animated.timing(cityNameOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

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
    return () => {
      clearTimeout(timeout);
      clearInterval(cityInterval);
      void stopIntroFanfare();
    };
  }, []);

  const rotateInterp = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.bgWrap, { opacity: bgOpacity }]}>
        {CITY_FRAMES.map((frame, i) => (
          <Image
            key={frame.uri}
            source={{ uri: frame.uri }}
            style={[
              styles.bg,
              { opacity: i === activeFrame ? 1 : 0 },
            ]}
          />
        ))}
      </Animated.View>
      <LinearGradient
        colors={[
          'rgba(11,11,18,0.55)',
          'rgba(26,15,46,0.65)',
          'rgba(74,29,31,0.85)',
          '#0B0B12',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.Text
        style={[styles.cityChip, { opacity: cityNameOpacity }]}
      >
        {CITY_FRAMES[activeFrame].name}
      </Animated.Text>

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
                      transform: [{ translateX: x }, { translateY: y }],
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
            style={[styles.globe, { transform: [{ scale: globeScale }] }]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B12' },
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    width,
    height,
    resizeMode: 'cover',
  },
  cityChip: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    color: '#FFFFFF',
    letterSpacing: 4,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    overflow: 'hidden',
  },
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
  orbiter: { position: 'absolute', fontSize: 28 },
  globe: { fontSize: 96 },
  title: {
    ...typography.display,
    color: colors.text,
    textAlign: 'center',
    fontSize: 44,
    lineHeight: 50,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tag: {
    ...typography.body,
    color: '#F4E8DD',
    marginTop: 12,
    letterSpacing: 0.3,
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

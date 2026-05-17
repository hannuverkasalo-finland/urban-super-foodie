import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import CityPickerModal from '../components/CityPickerModal';
import PermissionPrompt from '../components/PermissionPrompt';
import OnboardingScreen from '../screens/OnboardingScreen';
import SplashScreen from '../screens/SplashScreen';
import WelcomeRevealScreen from '../screens/WelcomeRevealScreen';
import {
  checkPermissionState,
  requestLocationPermission,
  resolveCurrentCity,
  startForegroundTracking,
  stopForegroundTracking,
} from '../services/locationService';
import { cityKeyFor, prefetchCity } from '../services/prefetchService';
import { buildWelcomeForCurrentCity } from '../services/welcomeService';
import { useLocationStore } from '../store/locationStore';
import { computeUserVersion, useUserStore } from '../store/userStore';
import { useWelcomeStore } from '../store/welcomeStore';
import { colors } from '../theme';
import TabNavigator from './TabNavigator';

const RootStack = createNativeStackNavigator();

export default function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false);
  const hasOnboarded = useUserStore((s) => s.hasOnboarded);
  const preferences = useUserStore((s) => s.preferences);
  const permission = useLocationStore((s) => s.permission);
  const city = useLocationStore((s) => s.city);
  const [permissionPromptShown, setPermissionPromptShown] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  // On every cold-start (or city change), show the WelcomeReveal before tabs.
  // This flag is only true between "city resolved" and "user dismissed reveal".
  const [revealPending, setRevealPending] = useState(true);
  // Track which cityKey the reveal was already shown for THIS session so we
  // don't re-pop it on every state update.
  const revealShownForCityKey = useRef<string | null>(null);

  // -------- Eager location: request the moment the splash finishes --------
  // This runs before onboarding too, so by the time the user reaches the
  // welcome reveal we already know the city (which the welcome content
  // depends on).
  useEffect(() => {
    if (!splashDone) return;
    void runLocationFlow();
  }, [splashDone]);

  // -------- On every foreground (cold start OR background-return) --------
  // Re-check location permission AND re-arm the welcome reveal so the user
  // sees a fresh briefing every time they come back to the app.
  useEffect(() => {
    if (!splashDone) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runLocationFlow();
        // Re-arm reveal for the current city.
        setRevealPending(true);
        revealShownForCityKey.current = null;
      }
    });
    return () => sub.remove();
  }, [splashDone]);

  // -------- Eager city research: kick off the moment city + onboarding done --------
  useEffect(() => {
    if (!splashDone || !hasOnboarded || !city) return;
    void prefetchCity(city.name, city.country, preferences);
  }, [splashDone, hasOnboarded, city, preferences]);

  // -------- Eager welcome generation when city resolves (any state) --------
  // If the user is still onboarding, this just front-runs the work. If they're
  // already onboarded, this populates the content for the reveal that's about
  // to appear.
  useEffect(() => {
    if (!splashDone || !city) return;
    const cityKey = cityKeyFor(city.name, city.country);
    const userVersion = computeUserVersion();
    const fresh = useWelcomeStore.getState().getFresh(cityKey, userVersion);
    if (!fresh) {
      void buildWelcomeForCurrentCity({ force: false });
    }
  }, [splashDone, city]);

  async function runLocationFlow() {
    try {
      const result = await requestLocationPermission();
      if (result.granted) {
        setPermissionPromptShown(false);
        await resolveCurrentCity();
        await startForegroundTracking();
      } else {
        stopForegroundTracking();
        setPermissionPromptShown(true);
      }
    } catch {
      // location service swallows + logs internally
    }
  }

  useEffect(() => {
    return () => stopForegroundTracking();
  }, []);

  useEffect(() => {
    void checkPermissionState();
  }, []);

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  if (!hasOnboarded) {
    return (
      <OnboardingScreen
        onDone={() => {
          // hasOnboarded flipped in the store inside OnboardingScreen.
          // revealPending is already true; the next render with
          // hasOnboarded===true will go through the reveal-or-tabs branch.
        }}
      />
    );
  }

  // -------- Returning users: show WelcomeReveal once per city per cold-start --------
  // Skip if we have no city resolved yet (user denied location AND hasn't
  // picked a city) — go straight to tabs and they can use the city picker.
  const cityKey = city ? cityKeyFor(city.name, city.country) : null;
  const shouldShowReveal =
    revealPending &&
    !!cityKey &&
    revealShownForCityKey.current !== cityKey;

  if (shouldShowReveal && cityKey) {
    return (
      <WelcomeRevealScreen
        onDone={() => {
          revealShownForCityKey.current = cityKey;
          setRevealPending(false);
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.accent,
            background: colors.bg,
            card: colors.bgElevated,
            text: colors.text,
            border: colors.border,
            notification: colors.accent,
          },
          fonts: {
            regular: { fontFamily: 'System', fontWeight: '400' },
            medium: { fontFamily: 'System', fontWeight: '500' },
            bold: { fontFamily: 'System', fontWeight: '700' },
            heavy: { fontFamily: 'System', fontWeight: '800' },
          },
        }}
      >
        <RootStack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="Tabs"
        >
          <RootStack.Screen
            name="Tabs"
            component={TabNavigator}
            // Start on the Now tab so the user sees their just-revealed briefing
            // reflected in the live tab.
            initialParams={{ screen: 'Now' }}
          />
        </RootStack.Navigator>
      </NavigationContainer>

      <PermissionPrompt
        visible={
          permissionPromptShown && permission !== 'granted' && !cityPickerOpen
        }
        onUseCityPicker={() => {
          setPermissionPromptShown(false);
          setCityPickerOpen(true);
        }}
        onRetryGranted={() => setPermissionPromptShown(false)}
      />

      <CityPickerModal
        visible={cityPickerOpen && !city}
        onClose={() => setCityPickerOpen(false)}
      />
    </View>
  );
}

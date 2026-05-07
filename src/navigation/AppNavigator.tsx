import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import PermissionPrompt from '../components/PermissionPrompt';
import CityPickerModal from '../components/CityPickerModal';
import OnboardingScreen from '../screens/OnboardingScreen';
import SplashScreen from '../screens/SplashScreen';
import {
  checkPermissionState,
  requestLocationPermission,
  resolveCurrentCity,
  startForegroundTracking,
  stopForegroundTracking,
} from '../services/locationService';
import { useLocationStore } from '../store/locationStore';
import { useUserStore } from '../store/userStore';
import { colors } from '../theme';
import TabNavigator from './TabNavigator';

const RootStack = createNativeStackNavigator();

export default function AppNavigator() {
  const [splashDone, setSplashDone] = useState(false);
  const hasOnboarded = useUserStore((s) => s.hasOnboarded);
  const permission = useLocationStore((s) => s.permission);
  const city = useLocationStore((s) => s.city);
  const [permissionPromptShown, setPermissionPromptShown] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);

  useEffect(() => {
    if (!splashDone) return;
    if (!hasOnboarded) return;
    runLocationFlow();
  }, [splashDone, hasOnboarded]);

  useEffect(() => {
    if (!splashDone || !hasOnboarded) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // re-prompt every time the app comes to the foreground if not granted
        runLocationFlow();
      }
    });
    return () => sub.remove();
  }, [splashDone, hasOnboarded]);

  async function runLocationFlow() {
    const result = await requestLocationPermission();
    if (result.granted) {
      setPermissionPromptShown(false);
      await resolveCurrentCity();
      await startForegroundTracking();
    } else {
      stopForegroundTracking();
      setPermissionPromptShown(true);
    }
  }

  useEffect(() => {
    return () => stopForegroundTracking();
  }, []);

  useEffect(() => {
    checkPermissionState();
  }, []);

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  if (!hasOnboarded) {
    return (
      <OnboardingScreen
        onDone={() => {
          // location flow will pick up via the effect once hasOnboarded flips
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
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Tabs" component={TabNavigator} />
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

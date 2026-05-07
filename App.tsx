import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppNavigator from './src/navigation/AppNavigator';

if (typeof globalThis !== 'undefined') {
  const g = globalThis as { __USF_HANDLERS__?: boolean };
  if (!g.__USF_HANDLERS__) {
    g.__USF_HANDLERS__ = true;
    const errorHandler = (error: unknown, isFatal?: boolean) => {
      console.error('[USF][global]', isFatal ? 'FATAL' : 'non-fatal', error);
    };
    type RNGlobal = {
      ErrorUtils?: {
        getGlobalHandler?: () => (e: unknown, fatal?: boolean) => void;
        setGlobalHandler?: (
          h: (e: unknown, fatal?: boolean) => void
        ) => void;
      };
    };
    const rnGlobal = globalThis as unknown as RNGlobal;
    const prev = rnGlobal.ErrorUtils?.getGlobalHandler?.();
    rnGlobal.ErrorUtils?.setGlobalHandler?.((e, fatal) => {
      errorHandler(e, fatal);
      prev?.(e, fatal);
    });
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

import * as Location from 'expo-location';
import { useLocationStore } from '../store/locationStore';
import { reverseGeocode } from '../api/googlePlaces';

export interface LocationRequestResult {
  granted: boolean;
  canAskAgain: boolean;
}

let watchSubscription: Location.LocationSubscription | null = null;

function logError(stage: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[USF][location] ${stage}:`, msg);
  useLocationStore.getState().setLastError(`${stage}: ${msg}`);
}

export async function requestLocationPermission(): Promise<LocationRequestResult> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') {
      useLocationStore.getState().setPermission('granted');
      return { granted: true, canAskAgain: true };
    }
    const result = await Location.requestForegroundPermissionsAsync();
    const granted = result.status === 'granted';
    useLocationStore
      .getState()
      .setPermission(granted ? 'granted' : 'denied');
    return { granted, canAskAgain: result.canAskAgain };
  } catch (err) {
    logError('requestPermission', err);
    return { granted: false, canAskAgain: false };
  }
}

export async function getCurrentCoords(): Promise<{
  lat: number;
  lng: number;
} | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({});
    if (last) {
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 10_000)
      ),
    ]);
    if (!pos) {
      logError('getCurrentPositionAsync', new Error('timeout after 10s'));
      return null;
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (err) {
    logError('getCurrentCoords', err);
    return null;
  }
}

export async function resolveCurrentCity(): Promise<void> {
  const store = useLocationStore.getState();
  if (store.permission !== 'granted') return;
  if (store.isResolving) return;
  store.setResolving(true);
  store.setLastError(null);
  try {
    const coords = await getCurrentCoords();
    if (!coords) return;
    store.setCoords(coords);
    try {
      const result = await reverseGeocode(coords.lat, coords.lng);
      if (result) {
        store.setCity({
          name: result.city,
          country: result.country,
          region: result.region,
          lat: coords.lat,
          lng: coords.lng,
        });
      } else {
        logError(
          'reverseGeocode',
          new Error('Geocoding API returned no result; check it is enabled')
        );
      }
    } catch (err) {
      logError('reverseGeocode', err);
    }
  } finally {
    store.setResolving(false);
  }
}

export async function startForegroundTracking(): Promise<void> {
  if (watchSubscription) return;
  if (useLocationStore.getState().permission !== 'granted') return;
  try {
    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 250,
        timeInterval: 30_000,
      },
      (pos) => {
        useLocationStore.getState().setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      }
    );
  } catch (err) {
    logError('startForegroundTracking', err);
  }
}

export function stopForegroundTracking(): void {
  watchSubscription?.remove();
  watchSubscription = null;
}

export async function checkPermissionState(): Promise<void> {
  try {
    const result = await Location.getForegroundPermissionsAsync();
    useLocationStore
      .getState()
      .setPermission(result.status === 'granted' ? 'granted' : 'denied');
  } catch (err) {
    logError('checkPermissionState', err);
  }
}

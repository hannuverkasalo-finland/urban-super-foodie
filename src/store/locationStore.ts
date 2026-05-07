import { create } from 'zustand';
import type { City, Coords, LocationPermissionState } from '../types';

interface LocationState {
  permission: LocationPermissionState;
  coords: Coords | null;
  city: City | null;
  isResolving: boolean;
  lastError: string | null;
  setPermission: (p: LocationPermissionState) => void;
  setCoords: (c: Coords | null) => void;
  setCity: (city: City | null) => void;
  setResolving: (b: boolean) => void;
  setLastError: (msg: string | null) => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
  permission: 'unknown',
  coords: null,
  city: null,
  isResolving: false,
  lastError: null,
  setPermission: (p) => set({ permission: p }),
  setCoords: (c) => set({ coords: c }),
  setCity: (city) => set({ city }),
  setResolving: (b) => set({ isResolving: b }),
  setLastError: (msg) => set({ lastError: msg }),
}));

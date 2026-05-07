import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CityContent, LoadStatus } from '../types';

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type StatusMap = Record<string, LoadStatus>;

interface ContentState {
  cityCache: Record<string, CityContent>;
  status: StatusMap;
  errors: Record<string, string | null>;
  setStatus: (cityKey: string, s: LoadStatus) => void;
  setError: (cityKey: string, err: string | null) => void;
  storeCity: (content: CityContent) => void;
  getFresh: (cityKey: string) => CityContent | null;
  invalidate: (cityKey: string) => void;
}

export const useContentStore = create<ContentState>()(
  persist(
    (set, get) => ({
      cityCache: {},
      status: {},
      errors: {},
      setStatus: (cityKey, s) =>
        set((state) => ({ status: { ...state.status, [cityKey]: s } })),
      setError: (cityKey, err) =>
        set((state) => ({ errors: { ...state.errors, [cityKey]: err } })),
      storeCity: (content) =>
        set((state) => ({
          cityCache: { ...state.cityCache, [content.cityKey]: content },
          status: { ...state.status, [content.cityKey]: 'ready' },
          errors: { ...state.errors, [content.cityKey]: null },
        })),
      getFresh: (cityKey) => {
        const cached = get().cityCache[cityKey];
        if (!cached) return null;
        if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
        return cached;
      },
      invalidate: (cityKey) =>
        set((state) => {
          const next = { ...state.cityCache };
          delete next[cityKey];
          return { cityCache: next };
        }),
    }),
    {
      name: 'usf-content-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cityCache: state.cityCache }),
    }
  )
);

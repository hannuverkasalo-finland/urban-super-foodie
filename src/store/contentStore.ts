import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  CityContent,
  ContentPage,
  CuratedPlace,
  LoadStatus,
  NowContent,
} from '../types';

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type StatusMap = Record<string, LoadStatus>;

interface AppendPlacesPatch {
  eatPlaces?: CuratedPlace[];
  drinkPlaces?: CuratedPlace[];
  doPlaces?: CuratedPlace[];
}

interface PagesPatch {
  craftPages?: ContentPage[];
  infoPages?: ContentPage[];
}

interface ContentState {
  cityCache: Record<string, CityContent>;
  status: StatusMap;
  errors: Record<string, string | null>;
  setStatus: (cityKey: string, s: LoadStatus) => void;
  setError: (cityKey: string, err: string | null) => void;
  storeCity: (content: CityContent) => void;
  appendCityPlaces: (cityKey: string, patch: AppendPlacesPatch) => void;
  setCityPages: (cityKey: string, patch: PagesPatch) => void;
  setNowContent: (cityKey: string, nowContent: NowContent) => void;
  getFresh: (cityKey: string) => CityContent | null;
  invalidate: (cityKey: string) => void;
}

function dedupeByPlaceId(arr: CuratedPlace[]): CuratedPlace[] {
  // De-dupe by Google place_id while preferring the entry with more expert
  // source citations (Phase 1+ Claude-curated wins over Phase 0 nearby-popular).
  // Then sort: expert-cited venues first, popular-nearby fallback below.
  const byId = new Map<string, CuratedPlace>();
  for (const p of arr) {
    const existing = byId.get(p.id);
    if (!existing) {
      byId.set(p.id, p);
      continue;
    }
    const existingCites = existing.sourceInspirations?.length ?? 0;
    const newCites = p.sourceInspirations?.length ?? 0;
    if (newCites > existingCites) {
      byId.set(p.id, p);
    }
  }
  const sorted = Array.from(byId.values()).sort((a, b) => {
    const aC = a.sourceInspirations?.length ?? 0;
    const bC = b.sourceInspirations?.length ?? 0;
    if (aC !== bC) return bC - aC;
    return (a.rank ?? 999) - (b.rank ?? 999);
  });
  return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
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
      appendCityPlaces: (cityKey, patch) =>
        set((state) => {
          const existing = state.cityCache[cityKey];
          if (!existing) return state;
          const merged: CityContent = {
            ...existing,
            eatPlaces: patch.eatPlaces
              ? dedupeByPlaceId([...existing.eatPlaces, ...patch.eatPlaces])
              : existing.eatPlaces,
            drinkPlaces: patch.drinkPlaces
              ? dedupeByPlaceId([...existing.drinkPlaces, ...patch.drinkPlaces])
              : existing.drinkPlaces,
            doPlaces: patch.doPlaces
              ? dedupeByPlaceId([...existing.doPlaces, ...patch.doPlaces])
              : existing.doPlaces,
            fetchedAt: existing.fetchedAt,
          };
          return {
            cityCache: { ...state.cityCache, [cityKey]: merged },
          };
        }),
      setCityPages: (cityKey, patch) =>
        set((state) => {
          const existing = state.cityCache[cityKey];
          if (!existing) return state;
          const merged: CityContent = {
            ...existing,
            craftPages:
              patch.craftPages !== undefined
                ? patch.craftPages
                : existing.craftPages,
            infoPages:
              patch.infoPages !== undefined
                ? patch.infoPages
                : existing.infoPages,
            fetchedAt: existing.fetchedAt,
          };
          return {
            cityCache: { ...state.cityCache, [cityKey]: merged },
          };
        }),
      setNowContent: (cityKey, nowContent) =>
        set((state) => {
          const existing = state.cityCache[cityKey];
          if (!existing) return state;
          return {
            cityCache: {
              ...state.cityCache,
              [cityKey]: { ...existing, nowContent },
            },
          };
        }),
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
      name: 'usf-content-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ cityCache: state.cityCache }),
    }
  )
);

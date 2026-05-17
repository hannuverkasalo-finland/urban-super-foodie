import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LoadStatus, WelcomeContent } from '../types';

// 24h: after a day, re-generate even if city+user-version haven't changed,
// so jokes/paragraphs feel fresh on a recurring visit.
const WELCOME_TTL_MS = 1000 * 60 * 60 * 24;

interface WelcomeState {
  /** Cached welcome content keyed by cityKey (e.g. "como--italy"). */
  byCityKey: Record<string, WelcomeContent>;
  /** Per-city generation status so the UI can render "still cooking…" placeholders. */
  status: Record<string, LoadStatus>;
  errors: Record<string, string | null>;
  /** True after the user has finished the entire 3-step onboarding + first reveal at least once. */
  hasSeenReveal: boolean;

  setStatus: (cityKey: string, s: LoadStatus) => void;
  setError: (cityKey: string, e: string | null) => void;
  store: (content: WelcomeContent) => void;
  /** Replace a single field on the cached entry — used as background gen lands piece by piece. */
  patch: (cityKey: string, patch: Partial<WelcomeContent>) => void;
  setHasSeenReveal: (v: boolean) => void;
  /**
   * Returns the cached entry only if it matches userVersion AND is younger
   * than TTL. Otherwise returns null and the caller should regenerate.
   */
  getFresh: (cityKey: string, userVersion: string) => WelcomeContent | null;
  /** Returns whatever is cached for the city, fresh or stale — useful for showing
   *  immediately while a regen runs in the background. */
  getCachedAny: (cityKey: string) => WelcomeContent | null;
  invalidate: (cityKey: string) => void;
  clearAll: () => void;
}

export const useWelcomeStore = create<WelcomeState>()(
  persist(
    (set, get) => ({
      byCityKey: {},
      status: {},
      errors: {},
      hasSeenReveal: false,
      setStatus: (cityKey, s) =>
        set((state) => ({ status: { ...state.status, [cityKey]: s } })),
      setError: (cityKey, e) =>
        set((state) => ({ errors: { ...state.errors, [cityKey]: e } })),
      store: (content) =>
        set((state) => ({
          byCityKey: { ...state.byCityKey, [content.cityKey]: content },
          status: { ...state.status, [content.cityKey]: 'ready' },
          errors: { ...state.errors, [content.cityKey]: null },
        })),
      patch: (cityKey, p) =>
        set((state) => {
          const existing = state.byCityKey[cityKey];
          if (!existing) return state;
          return {
            byCityKey: {
              ...state.byCityKey,
              [cityKey]: { ...existing, ...p },
            },
          };
        }),
      setHasSeenReveal: (v) => set({ hasSeenReveal: v }),
      getFresh: (cityKey, userVersion) => {
        const c = get().byCityKey[cityKey];
        if (!c) return null;
        if (c.userVersion !== userVersion) return null;
        if (Date.now() - c.generatedAt > WELCOME_TTL_MS) return null;
        return c;
      },
      getCachedAny: (cityKey) => get().byCityKey[cityKey] ?? null,
      invalidate: (cityKey) =>
        set((state) => {
          const next = { ...state.byCityKey };
          delete next[cityKey];
          return { byCityKey: next };
        }),
      clearAll: () =>
        set({ byCityKey: {}, status: {}, errors: {}, hasSeenReveal: false }),
    }),
    {
      name: 'usf-welcome-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist transient status flags — only the actual cached content
      // and the "has seen reveal" milestone.
      partialize: (state) => ({
        byCityKey: state.byCityKey,
        hasSeenReveal: state.hasSeenReveal,
      }),
    }
  )
);

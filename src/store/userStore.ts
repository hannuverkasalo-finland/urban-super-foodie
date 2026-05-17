import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ExtendedPreferences,
  UserPreferences,
  UserProfile,
} from '../types';

interface UserState {
  hasOnboarded: boolean;
  profile: UserProfile;
  preferences: UserPreferences;
  extendedPreferences: ExtendedPreferences;
  setHasOnboarded: (v: boolean) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  updateExtendedPreferences: (patch: Partial<ExtendedPreferences>) => void;
  toggleFoodStyle: (s: string) => void;
  toggleDrinkStyle: (s: string) => void;
  toggleActivity: (s: string) => void;
  reset: () => void;
}

const emptyProfile: UserProfile = {
  photoUri: null,
  nickname: '',
  language: 'English',
  birthYear: null,
  gender: null,
};

const emptyPreferences: UserPreferences = {
  foodStyles: [],
  foodFreeText: '',
  drinkStyles: [],
  drinkFreeText: '',
  activityTypes: [],
};

const defaultExtendedPreferences: ExtendedPreferences = {
  classicHipster: 0.5,
  mustDoVsNew: 0.5,
  safeFunky: 0.5,
};

const toggle = (arr: string[], item: string): string[] =>
  arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      profile: emptyProfile,
      preferences: emptyPreferences,
      extendedPreferences: defaultExtendedPreferences,
      setHasOnboarded: (v) => set({ hasOnboarded: v }),
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),
      updatePreferences: (patch) =>
        set((s) => ({ preferences: { ...s.preferences, ...patch } })),
      updateExtendedPreferences: (patch) =>
        set((s) => ({
          extendedPreferences: { ...s.extendedPreferences, ...patch },
        })),
      toggleFoodStyle: (s) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            foodStyles: toggle(state.preferences.foodStyles, s),
          },
        })),
      toggleDrinkStyle: (s) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            drinkStyles: toggle(state.preferences.drinkStyles, s),
          },
        })),
      toggleActivity: (s) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            activityTypes: toggle(state.preferences.activityTypes, s),
          },
        })),
      reset: () =>
        set({
          hasOnboarded: false,
          profile: emptyProfile,
          preferences: emptyPreferences,
          extendedPreferences: defaultExtendedPreferences,
        }),
    }),
    {
      name: 'usf-user-v3',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/**
 * Deterministic hash of every user signal that should invalidate the
 * Welcome content. When this string changes (because the user edited
 * profile, prefs, or sliders), welcomeService regenerates the joke,
 * paragraph, and card spec.
 */
export function computeUserVersion(): string {
  const s = useUserStore.getState();
  const parts = [
    s.profile.nickname,
    s.profile.birthYear ?? '',
    s.profile.gender ?? '',
    s.profile.language,
    [...s.preferences.foodStyles].sort().join(','),
    s.preferences.foodFreeText.trim(),
    [...s.preferences.drinkStyles].sort().join(','),
    s.preferences.drinkFreeText.trim(),
    [...s.preferences.activityTypes].sort().join(','),
    s.extendedPreferences.classicHipster.toFixed(2),
    s.extendedPreferences.mustDoVsNew.toFixed(2),
    s.extendedPreferences.safeFunky.toFixed(2),
  ];
  return parts.join('|');
}

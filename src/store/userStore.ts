import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserPreferences, UserProfile } from '../types';

interface UserState {
  hasOnboarded: boolean;
  profile: UserProfile;
  preferences: UserPreferences;
  setHasOnboarded: (v: boolean) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
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

const toggle = (arr: string[], item: string): string[] =>
  arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      profile: emptyProfile,
      preferences: emptyPreferences,
      setHasOnboarded: (v) => set({ hasOnboarded: v }),
      updateProfile: (patch) =>
        set((s) => ({ profile: { ...s.profile, ...patch } })),
      updatePreferences: (patch) =>
        set((s) => ({ preferences: { ...s.preferences, ...patch } })),
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
        }),
    }),
    {
      name: 'usf-user-v2',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LoadStatus, MenuAnalysis } from '../types';

interface MenuState {
  current: MenuAnalysis | null;
  status: LoadStatus;
  error: string | null;
  setCurrent: (m: MenuAnalysis | null) => void;
  setStatus: (s: LoadStatus) => void;
  setError: (e: string | null) => void;
  clear: () => void;
}

export const useMenuStore = create<MenuState>()(
  persist(
    (set) => ({
      current: null,
      status: 'idle',
      error: null,
      setCurrent: (m) =>
        set({ current: m, status: 'ready', error: null }),
      setStatus: (s) => set({ status: s }),
      setError: (e) => set({ error: e, status: 'error' }),
      clear: () =>
        set({ current: null, status: 'idle', error: null }),
    }),
    {
      name: 'usf-menu-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ current: state.current }),
    }
  )
);

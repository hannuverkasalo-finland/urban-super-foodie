import { create } from 'zustand';

export interface ProgressEntry {
  /** Human-readable status, e.g. "Querying Michelin Guide, 50 Best, Eater…" */
  message: string;
  /** Where this status came from, used purely for debugging / future filtering. */
  source?: string;
  /** Optional 0-1 progress hint for indeterminate bars. */
  progress?: number;
  timestamp: number;
}

interface ProgressState {
  byKey: Record<string, ProgressEntry>;
  setProgress: (key: string, message: string, opts?: { source?: string; progress?: number }) => void;
  clearProgress: (key: string) => void;
}

/**
 * Live status broadcaster. Each tab (Eat/Drink/Do/Now/Place/Menu) subscribes
 * to its own key and renders a small banner with the latest update. The
 * prefetch / Claude / Google Places layers call publishProgress() as they
 * traverse sources, giving the user a moving narrative while heavy work runs.
 */
export const useProgressStore = create<ProgressState>()((set) => ({
  byKey: {},
  setProgress: (key, message, opts) =>
    set((state) => ({
      byKey: {
        ...state.byKey,
        [key]: {
          message,
          source: opts?.source,
          progress: opts?.progress,
          timestamp: Date.now(),
        },
      },
    })),
  clearProgress: (key) =>
    set((state) => {
      if (!state.byKey[key]) return state;
      const next = { ...state.byKey };
      delete next[key];
      return { byKey: next };
    }),
}));

export function publishProgress(
  key: string,
  message: string,
  opts?: { source?: string; progress?: number }
) {
  useProgressStore.getState().setProgress(key, message, opts);
}

export function clearProgress(key: string) {
  useProgressStore.getState().clearProgress(key);
}

/** Key helpers so the layers all agree on the format. */
export function progressKeyFor(cityKey: string, scope: string): string {
  return `${cityKey}::${scope}`;
}

export const MENU_PROGRESS_KEY = 'menu';

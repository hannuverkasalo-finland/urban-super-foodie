import { create } from 'zustand';

export interface DebugEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  tag: string;
  message: string;
}

interface DebugLogState {
  entries: DebugEntry[];
  push: (level: DebugEntry['level'], tag: string, message: string) => void;
  clear: () => void;
}

const MAX = 200;

export const useDebugLog = create<DebugLogState>((set) => ({
  entries: [],
  push: (level, tag, message) =>
    set((state) => {
      const next = [
        { ts: Date.now(), level, tag, message },
        ...state.entries,
      ].slice(0, MAX);
      return { entries: next };
    }),
  clear: () => set({ entries: [] }),
}));

export function dlog(tag: string, message: string) {
  console.log(`[${tag}]`, message);
  useDebugLog.getState().push('info', tag, message);
}

export function dwarn(tag: string, message: string) {
  console.warn(`[${tag}]`, message);
  useDebugLog.getState().push('warn', tag, message);
}

export function derror(tag: string, message: string) {
  console.error(`[${tag}]`, message);
  useDebugLog.getState().push('error', tag, message);
}

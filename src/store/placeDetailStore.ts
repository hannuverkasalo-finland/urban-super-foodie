import { create } from 'zustand';
import type { PlaceDetailResult } from '../api/googlePlaces';
import type { PlaceEnrichment } from '../api/claude';

export interface PlaceDetailBundle {
  placeId: string;
  details?: PlaceDetailResult;
  enrichment?: PlaceEnrichment;
  detailsAt?: number;
  enrichmentAt?: number;
  detailsError?: string;
  enrichmentError?: string;
}

interface PlaceDetailState {
  byPlaceId: Record<string, PlaceDetailBundle>;
  setDetails: (placeId: string, details: PlaceDetailResult) => void;
  setEnrichment: (placeId: string, enrichment: PlaceEnrichment) => void;
  setDetailsError: (placeId: string, err: string) => void;
  setEnrichmentError: (placeId: string, err: string) => void;
  clear: (placeId: string) => void;
}

const TTL_MS = 1000 * 60 * 60 * 12; // 12h

export const usePlaceDetailStore = create<PlaceDetailState>()((set) => ({
  byPlaceId: {},
  setDetails: (placeId, details) =>
    set((state) => ({
      byPlaceId: {
        ...state.byPlaceId,
        [placeId]: {
          ...(state.byPlaceId[placeId] ?? { placeId }),
          details,
          detailsAt: Date.now(),
          detailsError: undefined,
        },
      },
    })),
  setEnrichment: (placeId, enrichment) =>
    set((state) => ({
      byPlaceId: {
        ...state.byPlaceId,
        [placeId]: {
          ...(state.byPlaceId[placeId] ?? { placeId }),
          enrichment,
          enrichmentAt: Date.now(),
          enrichmentError: undefined,
        },
      },
    })),
  setDetailsError: (placeId, err) =>
    set((state) => ({
      byPlaceId: {
        ...state.byPlaceId,
        [placeId]: {
          ...(state.byPlaceId[placeId] ?? { placeId }),
          detailsError: err,
        },
      },
    })),
  setEnrichmentError: (placeId, err) =>
    set((state) => ({
      byPlaceId: {
        ...state.byPlaceId,
        [placeId]: {
          ...(state.byPlaceId[placeId] ?? { placeId }),
          enrichmentError: err,
        },
      },
    })),
  clear: (placeId) =>
    set((state) => {
      const next = { ...state.byPlaceId };
      delete next[placeId];
      return { byPlaceId: next };
    }),
}));

export function isFresh(bundle: PlaceDetailBundle | undefined): boolean {
  if (!bundle?.detailsAt) return false;
  return Date.now() - bundle.detailsAt < TTL_MS;
}

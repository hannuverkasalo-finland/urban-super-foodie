import { enrichPlace } from '../api/claude';
import { getPlaceDetails } from '../api/googlePlaces';
import { dwarn } from '../store/debugLog';
import { useLocationStore } from '../store/locationStore';
import { isFresh, usePlaceDetailStore } from '../store/placeDetailStore';
import { useUserStore } from '../store/userStore';
import type { CuratedPlace } from '../types';

/**
 * Kick off background fetch of rich details for a place. Returns
 * immediately; the store updates as each layer arrives so the modal
 * can subscribe and re-render dynamically.
 *
 * Two parallel calls:
 *  - Google Place Details (hours, phone, website, photos, top reviews)
 *  - Claude enrichPlace (personalised summary, why-today, signature items,
 *    review highlights citing the expert source list)
 */
export async function ensurePlaceDetails(place: CuratedPlace): Promise<void> {
  const placeId = place.id;
  const store = usePlaceDetailStore.getState();
  const existing = store.byPlaceId[placeId];

  const hasFreshDetails = isFresh(existing);
  const hasEnrichment = !!existing?.enrichment;

  const tasks: Promise<void>[] = [];

  if (!hasFreshDetails) {
    tasks.push(
      (async () => {
        try {
          const details = await getPlaceDetails(placeId);
          if (details) {
            usePlaceDetailStore.getState().setDetails(placeId, details);
          } else {
            usePlaceDetailStore
              .getState()
              .setDetailsError(placeId, 'No Place Details returned');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          dwarn('place-details', msg);
          usePlaceDetailStore.getState().setDetailsError(placeId, msg);
        }
      })()
    );
  }

  if (!hasEnrichment) {
    tasks.push(
      (async () => {
        try {
          const profile = useUserStore.getState().profile;
          const prefs = useUserStore.getState().preferences;
          const city = useLocationStore.getState().city;
          const enrichment = await enrichPlace(
            {
              placeName: place.name,
              placeAddress: place.address,
              placeNeighborhood: place.neighborhood,
              cityName: city?.name ?? 'Unknown',
              countryName: city?.country ?? '',
              category: place.category,
              googleRating: place.googleRating,
              sourceInspirations: place.sourceInspirations,
            },
            prefs,
            profile
          );
          usePlaceDetailStore.getState().setEnrichment(placeId, enrichment);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          dwarn('place-enrich', msg);
          usePlaceDetailStore.getState().setEnrichmentError(placeId, msg);
        }
      })()
    );
  }

  // Fire-and-forget: let both run in parallel; do not await externally.
  void Promise.all(tasks);
}

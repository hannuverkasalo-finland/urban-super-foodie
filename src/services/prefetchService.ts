import {
  curatePlaces,
  generateCraftContent,
  generateInfoContent,
  type CuratedPlaceSeed,
} from '../api/claude';
import { buildPhotoUrl, findPlace } from '../api/googlePlaces';
import { useContentStore } from '../store/contentStore';
import { useUserStore } from '../store/userStore';
import type {
  CityContent,
  CuratedPlace,
  PlaceCategory,
  UserPreferences,
} from '../types';

export function cityKeyFor(name: string, country: string): string {
  return `${name.toLowerCase().replace(/\s+/g, '-')}--${country
    .toLowerCase()
    .replace(/\s+/g, '-')}`;
}

async function enrichSeeds(
  seeds: CuratedPlaceSeed[],
  category: PlaceCategory,
  cityName: string,
  countryName: string
): Promise<CuratedPlace[]> {
  const cityHint = `${cityName}, ${countryName}`;
  const enriched: CuratedPlace[] = [];
  // Process in small batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < seeds.length; i += batchSize) {
    const batch = seeds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (seed, idx) => {
        try {
          const found = await findPlace(seed.name, cityHint);
          if (!found) return null;
          if (
            (found.rating ?? 0) < 4.0 ||
            (found.userRatingsTotal ?? 0) < 10
          ) {
            return null;
          }
          const place: CuratedPlace = {
            id: found.placeId,
            googlePlaceId: found.placeId,
            name: found.name,
            category,
            neighborhood: seed.neighborhood,
            address: found.formattedAddress ?? seed.address,
            lat: found.lat,
            lng: found.lng,
            googleRating: found.rating,
            reviewCount: found.userRatingsTotal,
            priceLevel: found.priceLevel,
            photoUrl: found.photoReference
              ? buildPhotoUrl(found.photoReference, 600)
              : undefined,
            whyRecommended: seed.why_recommended,
            sourceInspirations: seed.source_inspirations ?? [],
            rank: i + idx + 1,
          };
          return place;
        } catch {
          return null;
        }
      })
    );
    enriched.push(
      ...results.filter((p): p is CuratedPlace => p !== null)
    );
  }
  return enriched;
}

export async function prefetchCity(
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  options: { force?: boolean } = {}
): Promise<CityContent | null> {
  const key = cityKeyFor(cityName, countryName);
  const store = useContentStore.getState();

  if (!options.force) {
    const fresh = store.getFresh(key);
    if (fresh) return fresh;
  }

  if (store.status[key] === 'loading') return null;

  store.setStatus(key, 'loading');
  store.setError(key, null);

  try {
    const [eatSeeds, drinkSeeds, doSeeds, craftPages, infoPages] =
      await Promise.all([
        curatePlaces('eat', cityName, countryName, prefs, 30).catch(() => []),
        curatePlaces('drink', cityName, countryName, prefs, 30).catch(
          () => []
        ),
        curatePlaces('do', cityName, countryName, prefs, 30).catch(() => []),
        generateCraftContent(cityName, countryName, prefs).catch(() => []),
        generateInfoContent(cityName, countryName).catch(() => []),
      ]);

    const [eatPlaces, drinkPlaces, doPlaces] = await Promise.all([
      enrichSeeds(eatSeeds, 'eat', cityName, countryName),
      enrichSeeds(drinkSeeds, 'drink', cityName, countryName),
      enrichSeeds(doSeeds, 'do', cityName, countryName),
    ]);

    const content: CityContent = {
      cityKey: key,
      cityDisplayName: `${cityName}, ${countryName}`,
      fetchedAt: Date.now(),
      eatPlaces,
      drinkPlaces,
      doPlaces,
      craftPages,
      infoPages,
    };
    store.storeCity(content);
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch city';
    store.setError(key, msg);
    store.setStatus(key, 'error');
    return null;
  }
}

export async function ensureCityContent(
  cityName: string,
  countryName: string
): Promise<CityContent | null> {
  const prefs = useUserStore.getState().preferences;
  return prefetchCity(cityName, countryName, prefs);
}

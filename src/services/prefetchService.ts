import {
  curatePlaces,
  generateCraftContent,
  generateInfoContent,
  generateNowContent,
  type CuratedPlaceSeed,
} from '../api/claude';
import { buildPhotoUrl, findPlace } from '../api/googlePlaces';
import { fetchWeather } from '../api/openMeteo';
import { useContentStore } from '../store/contentStore';
import { dlog, dwarn, derror } from '../store/debugLog';
import { useLocationStore } from '../store/locationStore';
import { useUserStore } from '../store/userStore';
import type {
  CityContent,
  CuratedPlace,
  NowContent,
  PlaceCategory,
  UserPreferences,
  UserProfile,
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
  let foundCount = 0;
  let nullCount = 0;
  let belowThresholdCount = 0;
  const batchSize = 5;
  for (let i = 0; i < seeds.length; i += batchSize) {
    const batch = seeds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (seed, idx) => {
        try {
          const found = await findPlace(seed.name, cityHint);
          if (!found) {
            nullCount++;
            return null;
          }
          foundCount++;
          if (
            (found.rating ?? 0) < 4.0 ||
            (found.userRatingsTotal ?? 0) < 10
          ) {
            belowThresholdCount++;
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
        } catch (err) {
          dwarn(
            'prefetch',
            `enrichSeeds(${category}) error for ${seed.name}: ${err instanceof Error ? err.message : String(err)}`
          );
          return null;
        }
      })
    );
    enriched.push(
      ...results.filter((p): p is CuratedPlace => p !== null)
    );
  }
  dlog(
    'prefetch',
    `enrichSeeds(${category}): ${seeds.length} seeds → found ${foundCount}, null ${nullCount}, below threshold ${belowThresholdCount}, kept ${enriched.length}`
  );
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
    if (fresh) {
      dlog(
        'prefetch',
        `cache hit ${key}: eat=${fresh.eatPlaces.length}, drink=${fresh.drinkPlaces.length}, do=${fresh.doPlaces.length}, craft=${fresh.craftPages.length}, info=${fresh.infoPages.length}`
      );
      return fresh;
    }
  }

  if (store.status[key] === 'loading') {
    dlog('prefetch', `already loading ${key}`);
    return null;
  }

  dlog('prefetch', `start ${key} (force=${!!options.force})`);
  store.setStatus(key, 'loading');
  store.setError(key, null);

  try {
    const t0 = Date.now();
    const seedResults = await Promise.all([
      curatePlaces('eat', cityName, countryName, prefs, 100).catch((err) => {
        dwarn(
          'prefetch',
          `curatePlaces(eat) failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return [] as CuratedPlaceSeed[];
      }),
      curatePlaces('drink', cityName, countryName, prefs, 100).catch((err) => {
        dwarn(
          'prefetch',
          `curatePlaces(drink) failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return [] as CuratedPlaceSeed[];
      }),
      curatePlaces('do', cityName, countryName, prefs, 100).catch((err) => {
        dwarn(
          'prefetch',
          `curatePlaces(do) failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return [] as CuratedPlaceSeed[];
      }),
      generateCraftContent(cityName, countryName, prefs).catch((err) => {
        dwarn(
          'prefetch',
          `craft failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return [];
      }),
      generateInfoContent(cityName, countryName).catch((err) => {
        dwarn(
          'prefetch',
          `info failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return [];
      }),
    ]);
    const [eatSeeds, drinkSeeds, doSeeds, craftPages, infoPages] = seedResults;
    dlog(
      'prefetch',
      `Claude returned: eat=${eatSeeds.length}, drink=${drinkSeeds.length}, do=${doSeeds.length}, craft=${craftPages.length}, info=${infoPages.length} (${Date.now() - t0}ms)`
    );

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
    dlog(
      'prefetch',
      `done ${key} in ${Date.now() - t0}ms: eat=${eatPlaces.length}, drink=${drinkPlaces.length}, do=${doPlaces.length}, craft=${craftPages.length}, info=${infoPages.length}`
    );
    store.storeCity(content);
    // Kick off Now content generation in the background (non-blocking).
    void prefetchNow(cityName, countryName);
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch city';
    derror('prefetch', `failed: ${msg}`);
    store.setError(key, msg);
    store.setStatus(key, 'error');
    return null;
  }
}

const NOW_TTL_MS = 1000 * 60 * 30; // 30 min

export async function prefetchNow(
  cityName: string,
  countryName: string,
  options: { force?: boolean } = {}
): Promise<NowContent | null> {
  const key = cityKeyFor(cityName, countryName);
  const store = useContentStore.getState();
  const cached = store.cityCache[key];
  if (!options.force && cached?.nowContent) {
    if (Date.now() - cached.nowContent.generatedAt < NOW_TTL_MS) {
      dlog('now', `cache hit ${key}`);
      return cached.nowContent;
    }
  }
  const profile: UserProfile = useUserStore.getState().profile;
  const prefs = useUserStore.getState().preferences;
  const coords = useLocationStore.getState().coords ?? {
    lat: cached?.eatPlaces[0]?.lat ?? 0,
    lng: cached?.eatPlaces[0]?.lng ?? 0,
  };
  try {
    dlog('now', `start ${key}`);
    const t0 = Date.now();
    const weather = await fetchWeather(coords.lat, coords.lng);
    const now = await generateNowContent(
      cityName,
      countryName,
      profile,
      prefs,
      weather
    );
    dlog(
      'now',
      `done ${key} in ${Date.now() - t0}ms: ${now.schedule.length} schedule, ${now.newsThemes.length} themes`
    );
    if (cached) {
      store.storeCity({ ...cached, nowContent: now });
    }
    return now;
  } catch (err) {
    dwarn(
      'now',
      `failed: ${err instanceof Error ? err.message : String(err)}`
    );
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

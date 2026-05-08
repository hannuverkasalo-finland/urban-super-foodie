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

const PHASE1_COUNT = 25;
const PHASE2_TARGET = 100;

// Track in-flight phase 2 jobs so we don't double-fire when MapScreen re-mounts.
const phase2InFlight = new Set<string>();

async function enrichSeeds(
  seeds: CuratedPlaceSeed[],
  category: PlaceCategory,
  cityName: string,
  countryName: string,
  startRank: number = 1
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
            rank: startRank + i + idx,
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

/**
 * Run a curate+enrich cycle for one category, returning enriched places.
 * Each step is wrapped so any single failure returns [] without throwing.
 */
async function curateAndEnrich(
  category: PlaceCategory,
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  count: number,
  excludeNames: string[] = [],
  startRank: number = 1
): Promise<CuratedPlace[]> {
  let seeds: CuratedPlaceSeed[] = [];
  try {
    seeds = await curatePlaces(
      category,
      cityName,
      countryName,
      prefs,
      count,
      excludeNames
    );
  } catch (err) {
    dwarn(
      'prefetch',
      `curatePlaces(${category}) failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
  if (seeds.length === 0) return [];
  return enrichSeeds(seeds, category, cityName, countryName, startRank);
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
      // Even on a cache hit, top up if we're below target — could happen if
      // a previous phase 2 was interrupted.
      if (
        fresh.eatPlaces.length < PHASE2_TARGET ||
        fresh.drinkPlaces.length < PHASE2_TARGET ||
        fresh.doPlaces.length < PHASE2_TARGET
      ) {
        void runPhase2(cityName, countryName, prefs, fresh);
      }
      // Always refresh Now in the background — it's time-sensitive (weather, news).
      void prefetchNow(cityName, countryName);
      return fresh;
    }
  }

  if (store.status[key] === 'loading') {
    dlog('prefetch', `already loading ${key}`);
    return null;
  }

  dlog(
    'prefetch',
    `start phase1 ${key} (force=${!!options.force}, count=${PHASE1_COUNT})`
  );
  store.setStatus(key, 'loading');
  store.setError(key, null);

  // Phase 1: a small fast batch + craft + info, all in parallel, all
  // independently catching their own errors so no single failure cascades.
  const t0 = Date.now();
  const [eatPlaces, drinkPlaces, doPlaces, craftPages, infoPages] =
    await Promise.all([
      curateAndEnrich('eat', cityName, countryName, prefs, PHASE1_COUNT),
      curateAndEnrich('drink', cityName, countryName, prefs, PHASE1_COUNT),
      curateAndEnrich('do', cityName, countryName, prefs, PHASE1_COUNT),
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
  dlog(
    'prefetch',
    `phase1 done ${key} in ${Date.now() - t0}ms: eat=${eatPlaces.length}, drink=${drinkPlaces.length}, do=${doPlaces.length}, craft=${craftPages.length}, info=${infoPages.length}`
  );

  // Always store, even if some categories returned 0 — UI will surface
  // partial state and the user sees whatever did succeed.
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

  // Phase 2 in background: expand each category up to PHASE2_TARGET total.
  void runPhase2(cityName, countryName, prefs, content);
  // Now content also kicked off in background.
  void prefetchNow(cityName, countryName);

  return content;
}

/**
 * Phase 2: expand each category up to PHASE2_TARGET, excluding what we
 * already have. Independent per-category; one failure doesn't block the
 * others. Appends incrementally so the UI can render new markers as they
 * arrive.
 */
async function runPhase2(
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  current: CityContent
): Promise<void> {
  const key = current.cityKey;
  if (phase2InFlight.has(key)) {
    dlog('prefetch', `phase2 already in flight ${key}`);
    return;
  }
  phase2InFlight.add(key);
  try {
    const t0 = Date.now();
    dlog(
      'prefetch',
      `start phase2 ${key} (current: eat=${current.eatPlaces.length}, drink=${current.drinkPlaces.length}, do=${current.doPlaces.length})`
    );

    const expandCategory = async (
      category: PlaceCategory,
      existing: CuratedPlace[]
    ): Promise<CuratedPlace[]> => {
      const remaining = PHASE2_TARGET - existing.length;
      if (remaining <= 0) return [];
      const excludeNames = existing.map((p) => p.name);
      const more = await curateAndEnrich(
        category,
        cityName,
        countryName,
        prefs,
        remaining,
        excludeNames,
        existing.length + 1
      );
      // Stream this category's results as soon as they're ready.
      if (more.length > 0) {
        useContentStore.getState().appendCityPlaces(key, {
          [category === 'eat'
            ? 'eatPlaces'
            : category === 'drink'
            ? 'drinkPlaces'
            : 'doPlaces']: more,
        });
        dlog(
          'prefetch',
          `phase2 appended ${more.length} ${category} places to ${key}`
        );
      }
      return more;
    };

    // Run the three category expansions in parallel; any single failure
    // doesn't kill the others (curateAndEnrich already swallows its own).
    await Promise.all([
      expandCategory('eat', current.eatPlaces),
      expandCategory('drink', current.drinkPlaces),
      expandCategory('do', current.doPlaces),
    ]);

    dlog('prefetch', `phase2 done ${key} in ${Date.now() - t0}ms`);
  } catch (err) {
    derror(
      'prefetch',
      `phase2 unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    phase2InFlight.delete(key);
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
    const weather = await fetchWeather(coords.lat, coords.lng).catch((err) => {
      dwarn('now', `weather failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (weather) {
      dlog(
        'weather',
        `${weather.current.tempC}°C, code=${weather.current.weatherCode}, ${weather.daily.length}d forecast`
      );
    }
    const now = await generateNowContent(
      cityName,
      countryName,
      profile,
      prefs,
      weather
    );
    const updated = store.cityCache[key];
    if (updated) {
      // Persist now content alongside the existing CityContent.
      useContentStore.getState().storeCity({
        ...updated,
        nowContent: now,
      });
    }
    dlog(
      'now',
      `done ${key} in ${Date.now() - t0}ms: ${now.schedule.length} schedule, ${now.newsThemes.length} themes`
    );
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

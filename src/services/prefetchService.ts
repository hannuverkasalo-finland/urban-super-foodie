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

const PHASE1_COUNT = 10; // ~5-10s target for first content
const PHASE2_TARGET = 30; // ~30-45s total
const PHASE3_TARGET = 100; // ~2-3min total

// Track in-flight phase jobs so re-entry (tab nav, app-state changes, etc.)
// doesn't kick off duplicate work.
const phase2InFlight = new Set<string>();
const phase3InFlight = new Set<string>();
const nowInFlight = new Set<string>();

// Stricter curation thresholds — only top-rated, currently-open venues.
const MIN_RATING = 4.2;
const MIN_REVIEWS = 25;

async function enrichSeeds(
  seeds: CuratedPlaceSeed[],
  category: PlaceCategory,
  cityName: string,
  countryName: string,
  startRank: number
): Promise<CuratedPlace[]> {
  const cityHint = `${cityName}, ${countryName}`;
  const enriched: CuratedPlace[] = [];
  let foundCount = 0;
  let nullCount = 0;
  let belowThresholdCount = 0;
  let closedCount = 0;
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
          // Drop anything not currently operating (covers
          // CLOSED_TEMPORARILY and CLOSED_PERMANENTLY).
          if (
            found.businessStatus &&
            found.businessStatus !== 'OPERATIONAL'
          ) {
            closedCount++;
            return null;
          }
          if (
            (found.rating ?? 0) < MIN_RATING ||
            (found.userRatingsTotal ?? 0) < MIN_REVIEWS
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
    `enrichSeeds(${category}): ${seeds.length} seeds → found ${foundCount}, null ${nullCount}, below ${MIN_RATING}/${MIN_REVIEWS} ${belowThresholdCount}, closed ${closedCount}, kept ${enriched.length}`
  );
  return enriched;
}

async function curateAndEnrich(
  category: PlaceCategory,
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  count: number,
  excludeNames: string[],
  startRank: number
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

function placesField(category: PlaceCategory) {
  return category === 'eat'
    ? 'eatPlaces'
    : category === 'drink'
    ? 'drinkPlaces'
    : ('doPlaces' as const);
}

/**
 * Public entry point. Idempotent and progressive: phases store as soon as
 * they have data, so each Claude call's result appears in the UI immediately.
 *
 * Phase 1 (~5-10s): 10 places per eat/drink/do, in parallel. Stored together.
 * Phase 2 (~30-45s total): expand each category to 30; full craft, info, now
 *   pages — all in parallel. Each result is appended/set as soon as it lands.
 * Phase 3 (~2-3min total): expand each category to 100 in parallel. Same
 *   append-as-ready behaviour.
 *
 * Re-entry is safe: in-flight jobs are deduped per cityKey.
 */
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
        `cache hit ${key}: eat=${fresh.eatPlaces.length}, drink=${fresh.drinkPlaces.length}, do=${fresh.doPlaces.length}, craft=${fresh.craftPages.length}, info=${fresh.infoPages.length}, now=${fresh.nowContent ? 'yes' : 'no'}`
      );
      // Top up if any phase didn't complete in a prior session.
      if (fresh.eatPlaces.length < PHASE2_TARGET) {
        void runPhase2(cityName, countryName, prefs, fresh);
      } else if (fresh.eatPlaces.length < PHASE3_TARGET) {
        void runPhase3(cityName, countryName, prefs, fresh);
      }
      // Now content is time-sensitive — always refresh in the background.
      void prefetchNow(cityName, countryName);
      return fresh;
    }
  }

  if (store.status[key] === 'loading') {
    dlog('prefetch', `already loading ${key}`);
    return null;
  }

  store.setStatus(key, 'loading');
  store.setError(key, null);

  // =========== PHASE 1: 10 places per category in parallel ===========
  dlog('prefetch', `start phase1 ${key} (count=${PHASE1_COUNT})`);
  const t0 = Date.now();
  const [eat1, drink1, do1] = await Promise.all([
    curateAndEnrich('eat', cityName, countryName, prefs, PHASE1_COUNT, [], 1),
    curateAndEnrich('drink', cityName, countryName, prefs, PHASE1_COUNT, [], 1),
    curateAndEnrich('do', cityName, countryName, prefs, PHASE1_COUNT, [], 1),
  ]);
  dlog(
    'prefetch',
    `phase1 done ${key} in ${Date.now() - t0}ms: eat=${eat1.length}, drink=${drink1.length}, do=${do1.length}`
  );

  const content: CityContent = {
    cityKey: key,
    cityDisplayName: `${cityName}, ${countryName}`,
    fetchedAt: Date.now(),
    eatPlaces: eat1,
    drinkPlaces: drink1,
    doPlaces: do1,
    craftPages: [],
    infoPages: [],
  };
  store.storeCity(content);

  // Phase 2 + Now content kicked off in the background — fire-and-forget.
  // Each subsystem appends/sets its own results as it lands, so the UI
  // surfaces them without waiting for the slowest call.
  void runPhase2(cityName, countryName, prefs, content);
  void prefetchNow(cityName, countryName);

  return content;
}

/**
 * Phase 2: bring each category up to PHASE2_TARGET, plus generate craft and
 * info pages. All in parallel; each result appended/set as soon as it's
 * ready. After phase 2 completes, kicks off phase 3.
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
  const t0 = Date.now();
  dlog(
    'prefetch',
    `start phase2 ${key} (current: eat=${current.eatPlaces.length}, drink=${current.drinkPlaces.length}, do=${current.doPlaces.length})`
  );

  const expandAndAppend = async (
    category: PlaceCategory,
    existing: CuratedPlace[]
  ): Promise<void> => {
    const remaining = PHASE2_TARGET - existing.length;
    if (remaining <= 0) return;
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
    if (more.length > 0) {
      useContentStore
        .getState()
        .appendCityPlaces(key, { [placesField(category)]: more });
      dlog(
        'prefetch',
        `phase2 appended ${more.length} ${category} places to ${key}`
      );
    }
  };

  const craftAndStore = async (): Promise<void> => {
    try {
      const pages = await generateCraftContent(cityName, countryName, prefs);
      useContentStore.getState().setCityPages(key, { craftPages: pages });
      dlog('prefetch', `phase2 craft ${pages.length} pages stored for ${key}`);
    } catch (err) {
      dwarn(
        'prefetch',
        `craft failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const infoAndStore = async (): Promise<void> => {
    try {
      const pages = await generateInfoContent(cityName, countryName);
      useContentStore.getState().setCityPages(key, { infoPages: pages });
      dlog('prefetch', `phase2 info ${pages.length} pages stored for ${key}`);
    } catch (err) {
      dwarn(
        'prefetch',
        `info failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  try {
    await Promise.all([
      expandAndAppend('eat', current.eatPlaces),
      expandAndAppend('drink', current.drinkPlaces),
      expandAndAppend('do', current.doPlaces),
      craftAndStore(),
      infoAndStore(),
    ]);
    dlog('prefetch', `phase2 done ${key} in ${Date.now() - t0}ms`);

    // Phase 3 — expand to 100 in the background.
    const updated = useContentStore.getState().cityCache[key];
    if (updated) {
      void runPhase3(cityName, countryName, prefs, updated);
    }
  } catch (err) {
    derror(
      'prefetch',
      `phase2 unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    phase2InFlight.delete(key);
  }
}

/**
 * Phase 3: expand each category to PHASE3_TARGET. The biggest call per
 * category and the slowest — runs purely in the background.
 */
async function runPhase3(
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  current: CityContent
): Promise<void> {
  const key = current.cityKey;
  if (phase3InFlight.has(key)) {
    dlog('prefetch', `phase3 already in flight ${key}`);
    return;
  }
  phase3InFlight.add(key);
  const t0 = Date.now();
  dlog(
    'prefetch',
    `start phase3 ${key} (current: eat=${current.eatPlaces.length}, drink=${current.drinkPlaces.length}, do=${current.doPlaces.length})`
  );

  const expandAndAppend = async (
    category: PlaceCategory,
    existing: CuratedPlace[]
  ): Promise<void> => {
    const remaining = PHASE3_TARGET - existing.length;
    if (remaining <= 0) return;
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
    if (more.length > 0) {
      useContentStore
        .getState()
        .appendCityPlaces(key, { [placesField(category)]: more });
      dlog(
        'prefetch',
        `phase3 appended ${more.length} ${category} places to ${key}`
      );
    }
  };

  try {
    // Read latest current state when starting each category so phase 2
    // top-ups are reflected.
    const latest = useContentStore.getState().cityCache[key] ?? current;
    await Promise.all([
      expandAndAppend('eat', latest.eatPlaces),
      expandAndAppend('drink', latest.drinkPlaces),
      expandAndAppend('do', latest.doPlaces),
    ]);
    dlog('prefetch', `phase3 done ${key} in ${Date.now() - t0}ms`);
  } catch (err) {
    derror(
      'prefetch',
      `phase3 unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    phase3InFlight.delete(key);
  }
}

const NOW_TTL_MS = 1000 * 60 * 30; // 30 min

export async function prefetchNow(
  cityName: string,
  countryName: string,
  options: { force?: boolean } = {}
): Promise<NowContent | null> {
  const key = cityKeyFor(cityName, countryName);
  if (nowInFlight.has(key)) {
    dlog('now', `already in flight ${key}`);
    return null;
  }
  const store = useContentStore.getState();
  const cached = store.cityCache[key];
  if (!options.force && cached?.nowContent) {
    if (Date.now() - cached.nowContent.generatedAt < NOW_TTL_MS) {
      dlog('now', `cache hit ${key}`);
      return cached.nowContent;
    }
  }
  nowInFlight.add(key);
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
      dwarn(
        'now',
        `weather failed: ${err instanceof Error ? err.message : String(err)}`
      );
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
    // Atomic field-only update so we don't clobber concurrent phase 2/3 appends.
    useContentStore.getState().setNowContent(key, now);
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
  } finally {
    nowInFlight.delete(key);
  }
}

export async function ensureCityContent(
  cityName: string,
  countryName: string
): Promise<CityContent | null> {
  const prefs = useUserStore.getState().preferences;
  return prefetchCity(cityName, countryName, prefs);
}

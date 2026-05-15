import {
  curatePlaces,
  generateCraftContent,
  generateInfoContent,
  generateNowContent,
  type CuratedPlaceSeed,
} from '../api/claude';
import { buildPhotoUrl, findPlace, searchNearby } from '../api/googlePlaces';
import { fetchWeather } from '../api/openMeteo';
import { useContentStore } from '../store/contentStore';
import { dlog, dwarn, derror } from '../store/debugLog';
import { useLocationStore } from '../store/locationStore';
import {
  clearProgress,
  progressKeyFor,
  publishProgress,
} from '../store/progressStore';
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

const PHASE1_COUNT = 10; // ~5-10s target for expert-curated first batch
const PHASE2_TARGET = 30; // ~30-45s total
const PHASE3_TARGET = 100; // ~2-3min total
const PHASE0_RADIUS_METERS = 2500;

// Stricter curation thresholds — only top-rated, currently-open venues.
const MIN_RATING = 4.2;
const MIN_REVIEWS = 25;

// Track in-flight phase jobs so re-entry (tab nav, app-state changes, etc.)
// doesn't kick off duplicate work.
const phase0InFlight = new Set<string>();
const phase2InFlight = new Set<string>();
const phase3InFlight = new Set<string>();
const nowInFlight = new Set<string>();

const GOOGLE_TYPES: Record<PlaceCategory, 'restaurant' | 'bar' | 'tourist_attraction'> = {
  eat: 'restaurant',
  drink: 'bar',
  do: 'tourist_attraction',
};

const SOURCE_BLURBS: Record<PlaceCategory, string> = {
  eat: 'Michelin, 50 Best, Eater, Infatuation, Gambero Rosso, La Liste',
  drink:
    "Raisin, World's 50 Best Bars, Star Wine List, Difford's, Untappd, Sprudge",
  do: 'Atlas Obscura, Lonely Planet, Wallpaper*, Condé Nast, Time Out',
};

function placesField(category: PlaceCategory) {
  return category === 'eat'
    ? 'eatPlaces'
    : category === 'drink'
    ? 'drinkPlaces'
    : ('doPlaces' as const);
}

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
  startRank: number,
  progressKey: string
): Promise<CuratedPlace[]> {
  publishProgress(
    progressKey,
    `Asking Claude to surface top ${count} ${category} picks (${SOURCE_BLURBS[category]})…`,
    { source: 'claude' }
  );
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
  publishProgress(
    progressKey,
    `Verifying ${seeds.length} ${category} picks on Google Maps (rating ≥${MIN_RATING}, ${MIN_REVIEWS}+ reviews, open this week)…`,
    { source: 'google-places' }
  );
  return enrichSeeds(seeds, category, cityName, countryName, startRank);
}

/**
 * Phase 0 — instant nearby content via Google Places. Fires ~3 parallel
 * requests, returning ~20 venues per category in 1-2 seconds total. Markers
 * are on the map essentially the moment the user lands on the tab. These
 * are baseline "popular nearby" picks; Claude's expert curation merges in
 * over the next 30-60 seconds and gets sorted above them.
 */
async function runPhase0(
  cityKey: string,
  cityName: string,
  countryName: string,
  coords: { lat: number; lng: number }
): Promise<{
  eatPlaces: CuratedPlace[];
  drinkPlaces: CuratedPlace[];
  doPlaces: CuratedPlace[];
}> {
  if (phase0InFlight.has(cityKey)) {
    dlog('prefetch', `phase0 already in flight ${cityKey}`);
    return { eatPlaces: [], drinkPlaces: [], doPlaces: [] };
  }
  phase0InFlight.add(cityKey);
  try {
    const t0 = Date.now();
    dlog(
      'prefetch',
      `start phase0 ${cityKey} (radius=${PHASE0_RADIUS_METERS}m)`
    );

    const fetchCategory = async (
      category: PlaceCategory
    ): Promise<CuratedPlace[]> => {
      const scopeKey = progressKeyFor(cityKey, category);
      publishProgress(
        scopeKey,
        `Scanning Google Maps for popular ${category === 'do' ? 'activities' : `${category} spots`} within ${Math.round(PHASE0_RADIUS_METERS / 1000)} km…`,
        { source: 'google-places' }
      );
      const found = await searchNearby(coords.lat, coords.lng, GOOGLE_TYPES[category], {
        radiusMeters: PHASE0_RADIUS_METERS,
        minRating: MIN_RATING,
      });
      const places = found.slice(0, 20).map<CuratedPlace>((f, i) => ({
        id: f.placeId,
        googlePlaceId: f.placeId,
        name: f.name,
        category,
        address: f.formattedAddress,
        lat: f.lat,
        lng: f.lng,
        googleRating: f.rating,
        reviewCount: f.userRatingsTotal,
        priceLevel: f.priceLevel,
        photoUrl: f.photoReference
          ? buildPhotoUrl(f.photoReference, 600)
          : undefined,
        whyRecommended:
          'Highly-rated nearby — Claude is curating expert picks in the background…',
        sourceInspirations: [],
        rank: 100 + i, // pushed below Phase 1+ expert picks after dedupe sort
      }));
      dlog(
        'prefetch',
        `phase0 ${category}: ${found.length} found, ${places.length} kept`
      );
      return places;
    };

    const [eat, drink, doo] = await Promise.all([
      fetchCategory('eat'),
      fetchCategory('drink'),
      fetchCategory('do'),
    ]);

    dlog(
      'prefetch',
      `phase0 done ${cityKey} in ${Date.now() - t0}ms: eat=${eat.length}, drink=${drink.length}, do=${doo.length}`
    );
    return { eatPlaces: eat, drinkPlaces: drink, doPlaces: doo };
  } finally {
    phase0InFlight.delete(cityKey);
  }
}

/**
 * Public entry point. Progressive layered fetch:
 *
 * Phase 0 (~1-3s): Google Places nearby search per category → ~20 popular
 *   venues immediately. UI gets pins on the map within seconds.
 * Phase 1 (~30-60s): Claude curates 10 expert picks per category (Michelin,
 *   50 Best, etc.) and we verify each on Google Places. Appended above
 *   Phase 0 entries in the merged dedupe.
 * Phase 2 (~60-120s): expand expert picks to 30, plus craft, info, now.
 * Phase 3 (~2-3min): expand to 100 expert picks per category.
 *
 * Status banner updates fire from every phase so the user sees a moving
 * narrative ("Querying Michelin, 50 Best…" → "Verifying on Google Maps…")
 * matching the heavy work happening underneath.
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
      if (fresh.eatPlaces.length < PHASE2_TARGET) {
        void runPhase2(cityName, countryName, prefs, fresh);
      } else if (fresh.eatPlaces.length < PHASE3_TARGET) {
        void runPhase3(cityName, countryName, prefs, fresh);
      }
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

  // Resolve coords (use city center as fallback; user GPS is preferred).
  const userCoords = useLocationStore.getState().coords;
  const coords = userCoords ?? null;

  // =========== PHASE 0: instant nearby search ===========
  let phase0: {
    eatPlaces: CuratedPlace[];
    drinkPlaces: CuratedPlace[];
    doPlaces: CuratedPlace[];
  } = { eatPlaces: [], drinkPlaces: [], doPlaces: [] };

  if (coords) {
    phase0 = await runPhase0(key, cityName, countryName, coords);

    const content0: CityContent = {
      cityKey: key,
      cityDisplayName: `${cityName}, ${countryName}`,
      fetchedAt: Date.now(),
      eatPlaces: phase0.eatPlaces,
      drinkPlaces: phase0.drinkPlaces,
      doPlaces: phase0.doPlaces,
      craftPages: [],
      infoPages: [],
    };
    store.storeCity(content0);
  } else {
    // No coords yet — create empty shell so Phase 1 can append.
    store.storeCity({
      cityKey: key,
      cityDisplayName: `${cityName}, ${countryName}`,
      fetchedAt: Date.now(),
      eatPlaces: [],
      drinkPlaces: [],
      doPlaces: [],
      craftPages: [],
      infoPages: [],
    });
  }

  // =========== PHASE 1: Claude expert curation, parallel ===========
  dlog('prefetch', `start phase1 ${key} (count=${PHASE1_COUNT})`);
  const t0 = Date.now();

  const runCategoryPhase1 = async (
    category: PlaceCategory
  ): Promise<void> => {
    const scopeKey = progressKeyFor(key, category);
    const expert = await curateAndEnrich(
      category,
      cityName,
      countryName,
      prefs,
      PHASE1_COUNT,
      [],
      1,
      scopeKey
    );
    if (expert.length > 0) {
      useContentStore.getState().appendCityPlaces(key, {
        [placesField(category)]: expert,
      });
      dlog(
        'prefetch',
        `phase1 appended ${expert.length} ${category} expert picks to ${key}`
      );
    }
    publishProgress(
      scopeKey,
      `Phase 1 ${category}: ${expert.length} expert picks added. Going deeper…`
    );
  };

  await Promise.all([
    runCategoryPhase1('eat'),
    runCategoryPhase1('drink'),
    runCategoryPhase1('do'),
  ]);
  dlog('prefetch', `phase1 done ${key} in ${Date.now() - t0}ms`);

  const afterPhase1 = useContentStore.getState().cityCache[key];

  // Phase 2 + Now in background — fire-and-forget. Each appends as ready.
  if (afterPhase1) {
    void runPhase2(cityName, countryName, prefs, afterPhase1);
  }
  void prefetchNow(cityName, countryName);

  return afterPhase1 ?? null;
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
    const scopeKey = progressKeyFor(key, category);
    // Only count expert-cited entries against the target (Phase 0 nearby
    // entries don't have citations and should be augmented, not blocked).
    const expertCount = existing.filter(
      (p) => (p.sourceInspirations?.length ?? 0) > 0
    ).length;
    const remaining = PHASE2_TARGET - expertCount;
    if (remaining <= 0) return;
    const excludeNames = existing
      .filter((p) => (p.sourceInspirations?.length ?? 0) > 0)
      .map((p) => p.name);
    const more = await curateAndEnrich(
      category,
      cityName,
      countryName,
      prefs,
      remaining,
      excludeNames,
      expertCount + 1,
      scopeKey
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
    publishProgress(scopeKey, `Phase 2 ${category} complete (${more.length} more added).`);
  };

  const placeScopeKey = progressKeyFor(key, 'place');
  const craftAndStore = async (): Promise<void> => {
    publishProgress(
      placeScopeKey,
      `Drafting "What to taste in ${cityName}" — referencing Eater, Bloomberg, Gambero Rosso, Star Wine List…`,
      { source: 'claude.craft' }
    );
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
    publishProgress(
      placeScopeKey,
      `Deep-diving "${cityName} essentials" across 6 pages (history → modern politics → current culture → hidden gems → direction)…`,
      { source: 'claude.info' }
    );
    try {
      const pages = await generateInfoContent(cityName, countryName);
      useContentStore.getState().setCityPages(key, { infoPages: pages });
      publishProgress(
        placeScopeKey,
        `Place: ${pages.length} pages ready.`
      );
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
    // Clear category banners now that the heavy work is settling
    for (const cat of ['eat', 'drink', 'do'] as PlaceCategory[]) {
      const scopeKey = progressKeyFor(key, cat);
      // Don't clear if phase 3 is still going to update them
    }
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
  dlog('prefetch', `start phase3 ${key}`);

  const expandAndAppend = async (
    category: PlaceCategory,
    existing: CuratedPlace[]
  ): Promise<void> => {
    const scopeKey = progressKeyFor(key, category);
    const expertCount = existing.filter(
      (p) => (p.sourceInspirations?.length ?? 0) > 0
    ).length;
    const remaining = PHASE3_TARGET - expertCount;
    if (remaining <= 0) return;
    const excludeNames = existing
      .filter((p) => (p.sourceInspirations?.length ?? 0) > 0)
      .map((p) => p.name);
    publishProgress(
      scopeKey,
      `Final pass: 60+ more ${category} venues across niche specialty sources…`,
      { source: 'claude.phase3' }
    );
    const more = await curateAndEnrich(
      category,
      cityName,
      countryName,
      prefs,
      remaining,
      excludeNames,
      expertCount + 1,
      scopeKey
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
    publishProgress(
      scopeKey,
      `All sources covered. ${expertCount + more.length} expert ${category} picks now indexed.`
    );
    // Clear after a brief pause so the user can read the final message
    setTimeout(() => clearProgress(scopeKey), 4000);
  };

  try {
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
  const scopeKey = progressKeyFor(key, 'now');
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
    publishProgress(
      scopeKey,
      `Pulling live weather from Open-Meteo for ${cityName}…`,
      { source: 'open-meteo' }
    );
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
    publishProgress(
      scopeKey,
      `Asking Claude to scan ${cityName} news this week (web search) and draft your 24-hour briefing…`,
      { source: 'claude.now' }
    );
    const now = await generateNowContent(
      cityName,
      countryName,
      profile,
      prefs,
      weather
    );
    useContentStore.getState().setNowContent(key, now);
    dlog(
      'now',
      `done ${key} in ${Date.now() - t0}ms: ${now.schedule.length} schedule, ${now.newsThemes.length} themes`
    );
    publishProgress(scopeKey, `Now briefing ready: ${now.schedule.length} schedule items, ${now.newsThemes.length} themes from this week.`);
    setTimeout(() => clearProgress(scopeKey), 4000);
    return now;
  } catch (err) {
    dwarn(
      'now',
      `failed: ${err instanceof Error ? err.message : String(err)}`
    );
    publishProgress(scopeKey, `Now generation failed; tap the tab to retry.`);
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

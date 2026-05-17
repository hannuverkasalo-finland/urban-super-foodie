import {
  generateWelcomeCardSpec,
  generateWelcomeJoke,
  generateWelcomeParagraph,
} from '../api/claude';
import { buildPhotoUrl, findPlace } from '../api/googlePlaces';
import { dlog, dwarn } from '../store/debugLog';
import { useLocationStore } from '../store/locationStore';
import { computeUserVersion, useUserStore } from '../store/userStore';
import { useWelcomeStore } from '../store/welcomeStore';
import type { WelcomeCardSpec, WelcomeContent } from '../types';
import { cityKeyFor } from './prefetchService';

/**
 * Build everything the WelcomeReveal screen needs (cartoon card spec, joke,
 * paragraph) for the current city + user, store progressively in welcomeStore
 * so the UI can render each piece the moment it lands.
 *
 * Idempotent / safe to call repeatedly:
 *  - If we have a cached entry whose userVersion matches AND it's <24h old,
 *    short-circuit and return it.
 *  - If a generation is already in flight for the city, no-op.
 *
 * Triggered from:
 *  - OnboardingStep1 "Next" press (kicks off joke + card spec — paragraph
 *    needs preferences so it runs after Step 2).
 *  - OnboardingStep2 "Submit" press (kicks off paragraph; also kicks off
 *    prefetchCity for the whole map content separately).
 *  - AppNavigator on cold start when city resolves (regenerates if
 *    userVersion changed or the cached entry is stale).
 *  - MeScreen after the user changes profile/prefs/sliders.
 *
 * Parts (cardSpec, joke, paragraph) generate in parallel. Each writes back
 * to the welcomeStore as soon as it's done so the reveal can render
 * progressively if the user reaches it before all 3 finish.
 */

const inFlightByCity = new Set<string>();

interface BuildOptions {
  /** Run cardSpec + joke immediately, defer paragraph. Used by Step 1. */
  skipParagraph?: boolean;
  /** Force regenerate even if a fresh cached entry exists. */
  force?: boolean;
}

export async function buildWelcomeForCurrentCity(
  options: BuildOptions = {}
): Promise<WelcomeContent | null> {
  const city = useLocationStore.getState().city;
  if (!city) {
    dlog('welcome', 'no city yet — skipping');
    return null;
  }
  const cityKey = cityKeyFor(city.name, city.country);
  const userVersion = computeUserVersion();
  const profile = useUserStore.getState().profile;
  const prefs = useUserStore.getState().preferences;
  const extPrefs = useUserStore.getState().extendedPreferences;
  const store = useWelcomeStore.getState();

  if (!options.force) {
    const fresh = store.getFresh(cityKey, userVersion);
    if (fresh) {
      dlog('welcome', `cache hit ${cityKey}`);
      return fresh;
    }
  }

  if (inFlightByCity.has(cityKey)) {
    dlog('welcome', `already in flight ${cityKey}`);
    return store.getCachedAny(cityKey);
  }

  inFlightByCity.add(cityKey);
  store.setStatus(cityKey, 'loading');
  store.setError(cityKey, null);

  // Seed the store with an empty shell so the reveal screen can render
  // skeletons immediately rather than waiting for all 3 pieces.
  const seed: WelcomeContent = {
    cityKey,
    cityDisplayName: `${city.name}, ${city.country}`,
    userVersion,
    generatedAt: Date.now(),
    cardSpec: {
      cityEmojis: ['🌍', '🍷', '🍽️', '✨'],
      headline: `${profile.nickname || 'Foodie'}, ${city.name} is yours.`,
      subhead: `Welcome to ${city.name}.`,
      accentHex: '#FF7A45',
    },
    joke: '',
    paragraph: '',
  };
  store.store(seed);

  try {
    const t0 = Date.now();
    dlog(
      'welcome',
      `start ${cityKey} (userVersion=${userVersion.slice(0, 24)}…, skipParagraph=${!!options.skipParagraph})`
    );

    // === card spec === (needs only profile + city)
    const cardPromise = generateWelcomeCardSpec(
      city.name,
      city.country,
      profile,
      prefs
    )
      .then(async ({ gen }) => {
        // Resolve a landmark photo via Google Places using Claude's hint.
        let landmarkPhotoUrl: string | undefined;
        let landmarkPlaceId: string | undefined;
        if (gen.landmarkSearchQuery) {
          try {
            const place = await findPlace(
              gen.landmarkSearchQuery,
              `${city.name}, ${city.country}`
            );
            if (place) {
              landmarkPlaceId = place.placeId;
              if (place.photoReference) {
                landmarkPhotoUrl = buildPhotoUrl(place.photoReference, 1080);
              }
            }
          } catch (e) {
            dwarn(
              'welcome',
              `landmark lookup failed: ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
        const spec: WelcomeCardSpec = {
          cityEmojis: gen.cityEmojis?.length ? gen.cityEmojis : ['🌍', '✨'],
          headline: gen.headline ?? `${profile.nickname || 'Foodie'}, here we go.`,
          subhead: gen.subhead ?? `Welcome to ${city.name}.`,
          landmarkPlaceId,
          landmarkPhotoUrl,
          accentHex: /^#[0-9A-Fa-f]{6}$/.test(gen.accentHex ?? '')
            ? gen.accentHex
            : '#FF7A45',
        };
        useWelcomeStore.getState().patch(cityKey, { cardSpec: spec });
        dlog('welcome', `cardSpec ready for ${cityKey} (${Date.now() - t0}ms)`);
      })
      .catch((err) => {
        dwarn(
          'welcome',
          `cardSpec failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // === joke === (needs profile + prefs + city)
    const jokePromise = generateWelcomeJoke(
      city.name,
      city.country,
      profile,
      prefs
    )
      .then((joke) => {
        useWelcomeStore.getState().patch(cityKey, { joke });
        dlog(
          'welcome',
          `joke ready for ${cityKey} (${Date.now() - t0}ms, ${joke.length} chars)`
        );
      })
      .catch((err) => {
        dwarn(
          'welcome',
          `joke failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // === paragraph === (heaviest; needs everything)
    const paragraphPromise = options.skipParagraph
      ? Promise.resolve()
      : generateWelcomeParagraph(city.name, city.country, profile, prefs, extPrefs)
          .then((paragraph) => {
            useWelcomeStore.getState().patch(cityKey, { paragraph });
            dlog(
              'welcome',
              `paragraph ready for ${cityKey} (${Date.now() - t0}ms, ${paragraph.length} chars)`
            );
          })
          .catch((err) => {
            dwarn(
              'welcome',
              `paragraph failed: ${err instanceof Error ? err.message : String(err)}`
            );
          });

    await Promise.all([cardPromise, jokePromise, paragraphPromise]);

    const final = useWelcomeStore.getState().byCityKey[cityKey];
    if (final) {
      useWelcomeStore.getState().store({
        ...final,
        userVersion,
        generatedAt: Date.now(),
      });
    }
    dlog('welcome', `done ${cityKey} in ${Date.now() - t0}ms`);
    return useWelcomeStore.getState().byCityKey[cityKey] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dwarn('welcome', `failed: ${msg}`);
    useWelcomeStore.getState().setError(cityKey, msg);
    useWelcomeStore.getState().setStatus(cityKey, 'error');
    return null;
  } finally {
    inFlightByCity.delete(cityKey);
  }
}

/**
 * Top up just the paragraph (called from Step 2 Submit when the user has
 * now provided their preferences). If the card+joke already exist from
 * Step 1's earlier call, this completes the trio without redoing them.
 */
export async function buildWelcomeParagraphOnly(): Promise<void> {
  const city = useLocationStore.getState().city;
  if (!city) return;
  const cityKey = cityKeyFor(city.name, city.country);
  const profile = useUserStore.getState().profile;
  const prefs = useUserStore.getState().preferences;
  const extPrefs = useUserStore.getState().extendedPreferences;
  const userVersion = computeUserVersion();
  try {
    const t0 = Date.now();
    const paragraph = await generateWelcomeParagraph(
      city.name,
      city.country,
      profile,
      prefs,
      extPrefs
    );
    useWelcomeStore
      .getState()
      .patch(cityKey, { paragraph, userVersion, generatedAt: Date.now() });
    dlog(
      'welcome',
      `paragraph top-up ready for ${cityKey} (${Date.now() - t0}ms)`
    );
  } catch (err) {
    dwarn(
      'welcome',
      `paragraph top-up failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

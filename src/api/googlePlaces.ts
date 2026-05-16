const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const BASE = 'https://maps.googleapis.com/maps/api/place';

function logFailure(stage: string, detail: unknown) {
  const msg = detail instanceof Error ? detail.message : String(detail);
  console.warn(`[USF][gmaps] ${stage}: ${msg}`);
}

export interface PlaceFindResult {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  formattedAddress?: string;
  photoReference?: string;
  businessStatus?: string;
}

interface FindPlaceCandidate {
  place_id?: string;
  name?: string;
  geometry?: { location?: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  formatted_address?: string;
  photos?: Array<{ photo_reference?: string }>;
  business_status?: string;
}

interface FindPlaceResponse {
  candidates?: FindPlaceCandidate[];
  status?: string;
  error_message?: string;
}

export async function findPlace(
  query: string,
  cityHint: string
): Promise<PlaceFindResult | null> {
  if (!KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
  const fields = [
    'place_id',
    'name',
    'geometry/location',
    'rating',
    'user_ratings_total',
    'price_level',
    'formatted_address',
    'photos',
    'business_status',
  ].join(',');
  const input = `${query} ${cityHint}`;
  const url = `${BASE}/findplacefromtext/json?input=${encodeURIComponent(
    input
  )}&inputtype=textquery&fields=${fields}&key=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logFailure('findPlace', `HTTP ${res.status}`);
      return null;
    }
    const json: FindPlaceResponse = await res.json();
    if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      logFailure(
        'findPlace',
        `${json.status}: ${json.error_message ?? 'no detail'}`
      );
      return null;
    }
    const c = json.candidates?.[0];
    if (!c?.place_id || !c.geometry?.location) return null;
    return {
      placeId: c.place_id,
      name: c.name ?? query,
      lat: c.geometry.location.lat,
      lng: c.geometry.location.lng,
      rating: c.rating,
      userRatingsTotal: c.user_ratings_total,
      priceLevel: c.price_level,
      formattedAddress: c.formatted_address,
      photoReference: c.photos?.[0]?.photo_reference,
      businessStatus: c.business_status,
    };
  } catch (err) {
    logFailure('findPlace', err);
    return null;
  }
}

export function buildPhotoUrl(
  photoReference: string,
  maxWidth = 600
): string {
  return `${BASE}/photo?maxwidth=${maxWidth}&photoreference=${photoReference}&key=${KEY}`;
}

interface NearbySearchResponse {
  results?: Array<{
    place_id?: string;
    name?: string;
    geometry?: { location?: { lat: number; lng: number } };
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    vicinity?: string;
    photos?: Array<{ photo_reference?: string }>;
    business_status?: string;
    types?: string[];
  }>;
  status?: string;
  error_message?: string;
}

/**
 * One-shot nearby places query for instant "popular nearby" content. Returns
 * up to 20 venues in ~500ms, no Claude involvement. Used for Phase 0 of the
 * prefetch so the user sees pins on the map within seconds while the Claude
 * curators do their deeper work in the background.
 */
export interface PlaceDetailResult {
  placeId: string;
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  formattedPhoneNumber?: string;
  website?: string;
  url?: string; // canonical Google Maps URL
  openingHours?: {
    weekdayText: string[];
    /** Today (0=Sun..6=Sat) — only present if Google returned it */
    todayLine?: string;
    openNow?: boolean;
  };
  photos: string[]; // photo URLs already built
  businessStatus?: string;
  reviews?: Array<{
    authorName: string;
    rating: number;
    relativeTime: string;
    text: string;
  }>;
  editorialSummary?: string;
}

interface PlaceDetailsResponse {
  result?: {
    place_id?: string;
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    formatted_address?: string;
    international_phone_number?: string;
    formatted_phone_number?: string;
    website?: string;
    url?: string;
    business_status?: string;
    opening_hours?: {
      weekday_text?: string[];
      open_now?: boolean;
    };
    photos?: Array<{ photo_reference?: string }>;
    reviews?: Array<{
      author_name?: string;
      rating?: number;
      relative_time_description?: string;
      text?: string;
    }>;
    editorial_summary?: { overview?: string };
  };
  status?: string;
  error_message?: string;
}

/**
 * Fetch the rich Place Details for a single place. Used by the place-detail
 * pop-up to surface opening hours, phone, website, and curated photos +
 * review snippets without spending a Claude call.
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetailResult | null> {
  if (!KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
  const fields = [
    'place_id',
    'name',
    'rating',
    'user_ratings_total',
    'price_level',
    'formatted_address',
    'international_phone_number',
    'formatted_phone_number',
    'website',
    'url',
    'business_status',
    'opening_hours',
    'photos',
    'reviews',
    'editorial_summary',
  ].join(',');
  const url = `${BASE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logFailure('getPlaceDetails', `HTTP ${res.status}`);
      return null;
    }
    const json: PlaceDetailsResponse = await res.json();
    if (json.status && json.status !== 'OK') {
      logFailure(
        'getPlaceDetails',
        `${json.status}: ${json.error_message ?? 'no detail'}`
      );
      return null;
    }
    const r = json.result;
    if (!r?.place_id) return null;
    // Today's hour line. Google returns weekday_text ordered Mon..Sun.
    const weekdayText = r.opening_hours?.weekday_text ?? [];
    const jsToday = new Date().getDay(); // 0=Sun..6=Sat
    const googleIdx = jsToday === 0 ? 6 : jsToday - 1;
    const todayLine = weekdayText[googleIdx];
    return {
      placeId: r.place_id,
      name: r.name ?? 'Unnamed',
      rating: r.rating,
      userRatingsTotal: r.user_ratings_total,
      priceLevel: r.price_level,
      formattedAddress: r.formatted_address,
      internationalPhoneNumber: r.international_phone_number,
      formattedPhoneNumber: r.formatted_phone_number,
      website: r.website,
      url: r.url,
      businessStatus: r.business_status,
      openingHours: r.opening_hours
        ? {
            weekdayText,
            todayLine,
            openNow: r.opening_hours.open_now,
          }
        : undefined,
      photos: (r.photos ?? [])
        .slice(0, 6)
        .map((p) => (p.photo_reference ? buildPhotoUrl(p.photo_reference, 1200) : ''))
        .filter(Boolean),
      reviews: (r.reviews ?? []).slice(0, 5).map((rev) => ({
        authorName: rev.author_name ?? 'Anonymous',
        rating: rev.rating ?? 0,
        relativeTime: rev.relative_time_description ?? '',
        text: rev.text ?? '',
      })),
      editorialSummary: r.editorial_summary?.overview,
    };
  } catch (err) {
    logFailure('getPlaceDetails', err);
    return null;
  }
}

export async function searchNearby(
  lat: number,
  lng: number,
  type: 'restaurant' | 'bar' | 'tourist_attraction',
  options: { radiusMeters?: number; minRating?: number } = {}
): Promise<PlaceFindResult[]> {
  if (!KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
  const radius = options.radiusMeters ?? 2500;
  const url =
    `${BASE}/nearbysearch/json?location=${lat},${lng}` +
    `&radius=${radius}&type=${type}&key=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logFailure('searchNearby', `HTTP ${res.status}`);
      return [];
    }
    const json: NearbySearchResponse = await res.json();
    if (
      json.status &&
      json.status !== 'OK' &&
      json.status !== 'ZERO_RESULTS'
    ) {
      logFailure(
        'searchNearby',
        `${json.status}: ${json.error_message ?? 'no detail'}`
      );
      return [];
    }
    const minRating = options.minRating ?? 4.2;
    const results = (json.results ?? [])
      .filter(
        (r) =>
          r.business_status === 'OPERATIONAL' &&
          r.geometry?.location &&
          r.place_id &&
          (r.rating ?? 0) >= minRating
      )
      .map<PlaceFindResult>((r) => ({
        placeId: r.place_id!,
        name: r.name ?? 'Unnamed',
        lat: r.geometry!.location!.lat,
        lng: r.geometry!.location!.lng,
        rating: r.rating,
        userRatingsTotal: r.user_ratings_total,
        priceLevel: r.price_level,
        formattedAddress: r.vicinity,
        photoReference: r.photos?.[0]?.photo_reference,
        businessStatus: r.business_status,
      }));
    return results;
  } catch (err) {
    logFailure('searchNearby', err);
    return [];
  }
}

interface GeocodeResponse {
  results?: Array<{
    address_components?: Array<{
      long_name?: string;
      types?: string[];
    }>;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  }>;
  status?: string;
  error_message?: string;
}

export interface ReverseGeocodeResult {
  city: string;
  country: string;
  region?: string;
  formattedAddress?: string;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  if (!KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logFailure('reverseGeocode', `HTTP ${res.status}`);
      return null;
    }
    const json: GeocodeResponse = await res.json();
    if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      logFailure(
        'reverseGeocode',
        `${json.status}: ${json.error_message ?? 'no detail'}`
      );
      return null;
    }
    const r = json.results?.[0];
    if (!r) return null;
    const components = r.address_components ?? [];
    const findComp = (...types: string[]) =>
      components.find((c) => types.some((t) => c.types?.includes(t)))
        ?.long_name;
    // Prefer locality / sublocality / admin_level_3 (city-level) over admin_level_2 (province).
    // Fixes "Provincia di Bergamo" → "Bergamo" so Claude curates city picks, not province picks.
    const city =
      findComp('locality') ??
      findComp('postal_town') ??
      findComp('administrative_area_level_3') ??
      findComp('sublocality') ??
      findComp('administrative_area_level_2') ??
      findComp('administrative_area_level_1') ??
      'Unknown city';
    const country = findComp('country') ?? '';
    const region = findComp('administrative_area_level_1');
    return {
      city,
      country,
      region,
      formattedAddress: r.formatted_address,
    };
  } catch (err) {
    logFailure('reverseGeocode', err);
    return null;
  }
}

export async function geocodeCity(
  query: string
): Promise<{ lat: number; lng: number; city: string; country: string } | null> {
  if (!KEY) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    query
  )}&key=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logFailure('geocodeCity', `HTTP ${res.status}`);
      return null;
    }
    const json: GeocodeResponse = await res.json();
    if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      logFailure(
        'geocodeCity',
        `${json.status}: ${json.error_message ?? 'no detail'}`
      );
      return null;
    }
    const r = json.results?.[0];
    if (!r?.geometry?.location) return null;
    const components = r.address_components ?? [];
    const findComp = (...types: string[]) =>
      components.find((c) => types.some((t) => c.types?.includes(t)))
        ?.long_name;
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      city:
        findComp('locality') ??
        findComp('postal_town') ??
        findComp('administrative_area_level_1') ??
        query,
      country: findComp('country') ?? '',
    };
  } catch (err) {
    logFailure('geocodeCity', err);
    return null;
  }
}

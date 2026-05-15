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

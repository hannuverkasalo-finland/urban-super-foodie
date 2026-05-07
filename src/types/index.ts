export type Gender = 'female' | 'male' | 'non-binary' | 'prefer-not-to-say';

export interface UserProfile {
  photoUri: string | null;
  nickname: string;
  language: string;
  birthYear: number | null;
  gender: Gender | null;
}

export interface UserPreferences {
  foodStyles: string[];
  foodFreeText: string;
  drinkStyles: string[];
  drinkFreeText: string;
  activityTypes: string[];
}

export interface City {
  name: string;
  country: string;
  region?: string;
  lat: number;
  lng: number;
}

export type PlaceCategory = 'eat' | 'drink' | 'do';

export interface CuratedPlace {
  id: string;
  name: string;
  category: PlaceCategory;
  neighborhood?: string;
  address?: string;
  lat: number;
  lng: number;
  googleRating?: number;
  reviewCount?: number;
  priceLevel?: number;
  photoUrl?: string;
  whyRecommended: string;
  sourceInspirations: string[];
  rank: number;
  googlePlaceId?: string;
}

export interface ContentPage {
  title: string;
  subtitle?: string;
  body: string;
  highlights: string[];
  accentHex?: string;
}

export interface CityContent {
  cityKey: string;
  cityDisplayName: string;
  fetchedAt: number;
  eatPlaces: CuratedPlace[];
  drinkPlaces: CuratedPlace[];
  doPlaces: CuratedPlace[];
  craftPages: ContentPage[];
  infoPages: ContentPage[];
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type LocationPermissionState =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'never-asked';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

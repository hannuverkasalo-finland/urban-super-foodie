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
  nowContent?: NowContent;
}

export interface NowSchedule {
  when: string;
  activity: string;
  place?: string;
  why: string;
}

export interface NowNewsTheme {
  title: string;
  summary: string;
}

export interface NowSong {
  title: string;
  artist: string;
  spotifyUrl: string;
}

export interface NowVideo {
  title: string;
  query: string;
  youtubeUrl: string;
}

export interface NowContent {
  generatedAt: number;
  cityName: string;
  slogan: string;
  bigPicture: string;
  newsThemes: NowNewsTheme[];
  schedule: NowSchedule[];
  song: NowSong;
  video: NowVideo;
  wikiTitle: string;
  wikiUrl: string;
  imageQueries: string[];
  weather?: {
    tempC: number;
    weatherCode: number;
    summary: string;
  };
  forecast?: Array<{
    weekday: string;
    highC: number;
    lowC: number;
    weatherCode: number;
  }>;
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

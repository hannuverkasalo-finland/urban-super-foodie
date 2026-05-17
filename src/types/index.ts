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
  hourly?: Array<{
    hourLabel: string;
    dayLabel: string;
    tempC: number;
    weatherCode: number;
    precipitationProbability: number;
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

export interface MenuItem {
  originalName: string;
  englishName: string;
  description: string;
  price: string;
}

export interface MenuSection {
  name: string;
  originalName: string;
  items: MenuItem[];
}

export interface MenuRecommendation {
  itemName: string;
  whyForYou: string;
  tags: string[];
}

export interface MenuAnalysis {
  analyzedAt: number;
  photoUri: string;
  languageDetected: string;
  menuTitle: string;
  currency: string;
  sections: MenuSection[];
  recommendations: MenuRecommendation[];
}

/**
 * Three vibe sliders (0..1). Used as additional input signal to Claude
 * curation so picks lean toward the user's stated taste axis.
 */
export interface ExtendedPreferences {
  /** 0 = classic/elegant, 1 = hipster/explorative */
  classicHipster: number;
  /** 0 = must-do staples, 1 = new/interesting/under-the-radar */
  mustDoVsNew: number;
  /** 0 = safe choices, 1 = funky/crazy/raw */
  safeFunky: number;
}

export interface WelcomeCardSpec {
  /** 4-6 single-emoji symbols Claude picks to represent the city's food/landmark identity. */
  cityEmojis: string[];
  /** Punchy 4-8 word headline for the card. */
  headline: string;
  /** One-sentence subhead with vibe words. */
  subhead: string;
  /** Best Google Place ID for a city-landmark photo, when available. */
  landmarkPlaceId?: string;
  /** Direct photo URL (Google Places photo URL) for the landmark background. */
  landmarkPhotoUrl?: string;
  /** Hex accent color picked to match the city's vibe. */
  accentHex: string;
}

export interface WelcomeContent {
  cityKey: string;
  cityDisplayName: string;
  /** Hash of the relevant user fields at generation time; used to detect when
   *  the user has updated their profile/preferences and the welcome should be
   *  re-generated. */
  userVersion: string;
  generatedAt: number;
  cardSpec: WelcomeCardSpec;
  joke: string;
  paragraph: string;
}

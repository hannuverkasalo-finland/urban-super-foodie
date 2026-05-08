import type {
  ContentPage,
  NowContent,
  UserPreferences,
  UserProfile,
} from '../types';
import type { WeatherSnapshot } from './openMeteo';
import { describeWeather } from './openMeteo';
import {
  DO_SOURCES,
  DRINK_SOURCES,
  EAT_SOURCES,
} from '../constants/sources';
import { dlog, dwarn } from '../store/debugLog';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const MODEL = process.env.EXPO_PUBLIC_CLAUDE_MODEL ?? 'claude-sonnet-4-6';

export interface CuratedPlaceSeed {
  name: string;
  neighborhood?: string;
  address?: string;
  why_recommended: string;
  source_inspirations: string[];
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4000,
  label = 'claude'
): Promise<string> {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ANTHROPIC_API_KEY');
  }
  const t0 = Date.now();
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    dwarn(label, `HTTP ${res.status}: ${errText.slice(0, 200)}`);
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data: AnthropicResponse = await res.json();
  const text = data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();
  if (!text) {
    dwarn(label, 'empty response');
    throw new Error('Empty Claude response');
  }
  dlog(
    label,
    `${Date.now() - t0}ms · ${text.length} chars · stop=${data.stop_reason ?? '?'}`
  );
  return text;
}

function extractJson<T>(raw: string, label = 'parse'): T {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const firstBrace = candidate.indexOf('{');
  const firstBracket = candidate.indexOf('[');
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start < 0) {
    dwarn(label, `no JSON found in: ${raw.slice(0, 200)}`);
    throw new Error(`Could not find JSON in: ${raw.slice(0, 200)}`);
  }
  const lastBrace = candidate.lastIndexOf('}');
  const lastBracket = candidate.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  const sliced = candidate.slice(start, end + 1);
  try {
    return JSON.parse(sliced) as T;
  } catch (err) {
    dwarn(
      label,
      `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}; sample: ${sliced.slice(0, 200)}`
    );
    throw err;
  }
}

function preferencesBlock(prefs: UserPreferences): string {
  const parts: string[] = [];
  if (prefs.foodStyles.length) {
    parts.push(`Food preferences: ${prefs.foodStyles.join(', ')}.`);
  }
  if (prefs.foodFreeText) {
    parts.push(`Extra food notes: ${prefs.foodFreeText}.`);
  }
  if (prefs.drinkStyles.length) {
    parts.push(`Drink preferences: ${prefs.drinkStyles.join(', ')}.`);
  }
  if (prefs.drinkFreeText) {
    parts.push(`Extra drink notes: ${prefs.drinkFreeText}.`);
  }
  if (prefs.activityTypes.length) {
    parts.push(`Activity preferences: ${prefs.activityTypes.join(', ')}.`);
  }
  return parts.length ? parts.join('\n') : 'No specific preferences yet.';
}

export async function curatePlaces(
  category: 'eat' | 'drink' | 'do',
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  count = 30
): Promise<CuratedPlaceSeed[]> {
  const sources =
    category === 'eat'
      ? EAT_SOURCES
      : category === 'drink'
      ? DRINK_SOURCES
      : DO_SOURCES;

  const categoryDescription =
    category === 'eat'
      ? 'restaurants and food places'
      : category === 'drink'
      ? 'bars, wine bars, coffee shops, breweries, and other drinking establishments'
      : 'activities, cultural sites, and experiences (NOT restaurants or bars)';

  const sourceList = sources.map((s) => `- ${s}`).join('\n');

  const system = `You are an expert urban travel curator with deep knowledge of these reference sources:
${sourceList}

You must produce concrete, real, currently-existing places. Never invent. Only use venues that exist on Google Maps with at least 4.0 rating and 10+ reviews to the best of your knowledge. Prioritize places mentioned in the reference sources above. Respond with valid JSON only — no preamble, no markdown.`;

  const user = `City: ${cityName}, ${countryName}
Category: ${categoryDescription}

User preferences:
${preferencesBlock(prefs)}

Task: Return the top ${count} ${categoryDescription} in ${cityName} that best match this user, ranked from #1 (most recommended) downward.

Output JSON only — an array of ${count} objects with this exact shape:
[
  {
    "name": "exact venue name as it appears on Google Maps",
    "neighborhood": "neighborhood or district",
    "address": "approximate street address if known",
    "why_recommended": "1-2 sentences explaining why this matches the user's preferences, citing what makes the place notable",
    "source_inspirations": ["list of 2-4 of the reference sources above that have featured or rated this place"]
  }
]

Strict requirements:
- Only real venues, currently operating
- Spell venue names exactly so they can be matched on Google Maps
- Reference at least one source from the list above per place where applicable
- Order by how well it matches the user's preferences
- Diverse mix across price points and neighborhoods
- Output ONLY the JSON array, nothing else.`;

  const raw = await callClaude(system, user, 8000, `claude.${category}`);
  return extractJson<CuratedPlaceSeed[]>(raw, `parse.${category}`);
}

export async function generateCraftContent(
  cityName: string,
  countryName: string,
  prefs: UserPreferences
): Promise<ContentPage[]> {
  const allSources = [...EAT_SOURCES, ...DRINK_SOURCES];
  const sourceList = allSources.slice(0, 20).map((s) => `- ${s}`).join('\n');

  const system = `You are an expert food and drink writer drawing on these reference sources:
${sourceList}

Respond with valid JSON only — no preamble, no markdown.`;

  const user = `City: ${cityName}, ${countryName}

User preferences:
${preferencesBlock(prefs)}

Create a 3-page magazine-style guide titled "What to taste in ${cityName}". Each page should focus on a different theme:
Page 1: Signature dishes, ingredients, and produce of ${cityName} the user must try
Page 2: Drinks, wines, beers, or coffee specialties unique to ${cityName}
Page 3: Modern, hidden, or up-and-coming food experiences in ${cityName} right now

Output JSON only — an array of exactly 3 objects with this exact shape:
[
  {
    "title": "page title (4-7 words)",
    "subtitle": "short subtitle (under 12 words)",
    "body": "2-3 paragraphs of vivid, specific writing — name actual dishes, drinks, ingredients, sauces, regional traditions",
    "highlights": ["array of 5 short tags or 'must try' bullets, max 6 words each"],
    "accentHex": "a hex color that matches the theme (e.g. #FFC857)"
  }
]
Tailor recommendations to the user's preferences when possible. Mention specific neighborhoods or markets where relevant. Output ONLY the JSON array.`;

  const raw = await callClaude(system, user, 4000, 'claude.craft');
  const pages = extractJson<ContentPage[]>(raw, 'parse.craft');
  return pages.slice(0, 3);
}

export async function generateInfoContent(
  cityName: string,
  countryName: string
): Promise<ContentPage[]> {
  const system = `You are an expert urban travel writer drawing on Lonely Planet, Condé Nast Traveler, National Geographic Travel, Atlas Obscura, Wikipedia, Time Out, and Wallpaper* City Guides. Respond with valid JSON only — no preamble, no markdown.`;

  const user = `City: ${cityName}, ${countryName}

Create a 3-page mini guide titled "${cityName} essentials". Each page covers a different angle:
Page 1: Core facts, history, and why ${cityName} is famous
Page 2: What's cool, current, and culturally relevant right now
Page 3: Curious facts, hidden spots, and key experiences any visitor must try

Output JSON only — an array of exactly 3 objects:
[
  {
    "title": "page title (4-7 words)",
    "subtitle": "short subtitle (under 12 words)",
    "body": "2-3 paragraphs — concrete, specific, no generic platitudes",
    "highlights": ["array of 5 sharp bullet facts/tips, max 8 words each"],
    "accentHex": "matching hex color"
  }
]
Output ONLY the JSON array.`;

  const raw = await callClaude(system, user, 4000, 'claude.info');
  const pages = extractJson<ContentPage[]>(raw, 'parse.info');
  return pages.slice(0, 3);
}

interface NowGen {
  slogan: string;
  bigPicture: string;
  newsThemes: Array<{ title: string; summary: string }>;
  schedule: Array<{
    when: string;
    activity: string;
    place?: string;
    why: string;
  }>;
  song: { title: string; artist: string };
  video: { title: string; query: string };
  wikiTitle: string;
  imageQueries: string[];
}

function spotifySearchUrl(title: string, artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;
}

function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function wikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.trim().replace(/ /g, '_'))}`;
}

function profileBlock(profile: UserProfile): string {
  const age = profile.birthYear
    ? new Date().getFullYear() - profile.birthYear
    : null;
  const parts: string[] = [];
  if (profile.nickname) parts.push(`Nickname: ${profile.nickname}`);
  if (age) parts.push(`Age: ${age}`);
  if (profile.gender) parts.push(`Gender: ${profile.gender}`);
  if (profile.language) parts.push(`Language: ${profile.language}`);
  return parts.length ? parts.join(' · ') : 'Anonymous traveler';
}

export async function generateNowContent(
  cityName: string,
  countryName: string,
  profile: UserProfile,
  prefs: UserPreferences,
  weather: WeatherSnapshot | null,
  now: Date = new Date()
): Promise<NowContent> {
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  const dateLabel = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  const partOfDay =
    hour < 5
      ? 'late night'
      : hour < 12
      ? 'morning'
      : hour < 17
      ? 'afternoon'
      : hour < 21
      ? 'evening'
      : 'night';

  const weatherText = weather
    ? `${describeWeather(weather.current.weatherCode).emoji} ${weather.current.tempC}°C, ${describeWeather(weather.current.weatherCode).label}, wind ${weather.current.windKph} km/h, humidity ${weather.current.humidity}%. Forecast next 3 days: ${weather.daily
        .slice(1, 4)
        .map(
          (d) =>
            `${d.weekday} ${d.lowC}-${d.highC}°C ${describeWeather(d.weatherCode).emoji}`
        )
        .join(', ')}.`
    : 'Weather data unavailable';

  const system = `You are a brilliantly witty, slightly cheeky, deeply knowledgeable local concierge AI. Your job: read this user's profile and generate a hyper-personalised, contextual, hilarious-but-useful "right now" snapshot for the city they're in. Use real venues that exist on Google Maps. Be specific. Be funny. Be warm. Drop lyrical references and inside jokes only a real local would know. Output JSON only — no preamble, no markdown.`;

  const user = `City: ${cityName}, ${countryName}
Local time: ${dayName} ${dateLabel}, ${partOfDay} (${now.toLocaleTimeString()})
Weather: ${weatherText}

User:
${profileBlock(profile)}
Food preferences: ${prefs.foodStyles.join(', ') || 'open to anything'}
Drink preferences: ${prefs.drinkStyles.join(', ') || 'open to anything'}
Activity preferences: ${prefs.activityTypes.join(', ') || 'open to anything'}
${prefs.foodFreeText ? 'Food notes: ' + prefs.foodFreeText : ''}
${prefs.drinkFreeText ? 'Drink notes: ' + prefs.drinkFreeText : ''}

Generate a richly contextual "Now" briefing. Output ONLY this JSON shape, nothing else:

{
  "slogan": "8-12 word punchy, witty tagline for THIS specific moment of THIS user being in THIS city. Reference the weather, day, and one of the user's preferences. Be funny.",
  "bigPicture": "2-3 conversational paragraphs (~150 words total) summarising what's happening in ${cityName} right now — major themes locals are talking about this week, mood of the city, what makes this exact day/hour special. Conversational tone, drop in 1-2 jokes, address the user by nickname. Mix in a cheeky reference to their preferences.",
  "newsThemes": [
    { "title": "Sharp 5-7 word headline", "summary": "1-2 sentence punchy take" }
  ] (provide exactly 4 — current local conversations: politics, culture, sports/events, food&drink scene),
  "schedule": [
    { "when": "label like 'Right now', '11:00', 'Lunch', 'Late afternoon', 'Evening drink', 'Dinner', 'Late night'", "activity": "what to do (verb-led)", "place": "specific real venue name in ${cityName}", "why": "why THIS user would love it (reference preferences/weather)" }
  ] (provide exactly 10 entries spanning the next 12-24 hours, ordered chronologically. Mix eats, drinks, activities, walks, viewpoints. Real venues only.),
  "song": { "title": "Real song title that fits ${cityName} vibe + user taste", "artist": "Real artist" },
  "video": { "title": "Compelling YouTube title (real or representative)", "query": "search query that will return a great video" },
  "wikiTitle": "Wikipedia article title most relevant for context (city itself, or a specific neighborhood / dish / scene)",
  "imageQueries": ["3 short image search queries for evocative photos: e.g., 'skopje old bazaar dusk', 'macedonian ajvar', 'vardar river'"]
}

Be unapologetically witty. Reference user's age, gender, language background where relevant. Make the schedule feel like a real day. Output ONLY the JSON.`;

  const raw = await callClaude(system, user, 4500, 'claude.now');
  const gen = extractJson<NowGen>(raw, 'parse.now');

  return {
    generatedAt: Date.now(),
    cityName,
    slogan: gen.slogan,
    bigPicture: gen.bigPicture,
    newsThemes: gen.newsThemes ?? [],
    schedule: gen.schedule ?? [],
    song: {
      title: gen.song?.title ?? '',
      artist: gen.song?.artist ?? '',
      spotifyUrl: spotifySearchUrl(gen.song?.title ?? '', gen.song?.artist ?? ''),
    },
    video: {
      title: gen.video?.title ?? '',
      query: gen.video?.query ?? cityName,
      youtubeUrl: youtubeSearchUrl(gen.video?.query ?? cityName),
    },
    wikiTitle: gen.wikiTitle ?? cityName,
    wikiUrl: wikiUrl(gen.wikiTitle ?? cityName),
    imageQueries: gen.imageQueries ?? [],
    weather: weather
      ? {
          tempC: weather.current.tempC,
          weatherCode: weather.current.weatherCode,
          summary: describeWeather(weather.current.weatherCode).label,
        }
      : undefined,
    forecast: weather?.daily.slice(0, 4).map((d) => ({
      weekday: d.weekday,
      highC: d.highC,
      lowC: d.lowC,
      weatherCode: d.weatherCode,
    })),
  };
}

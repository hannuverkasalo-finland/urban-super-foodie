import type {
  ContentPage,
  MenuAnalysis,
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

interface CallClaudeOptions {
  /** Enable Claude's server-side web search tool for fresh real-world data. */
  webSearch?: boolean;
  /** Max times Claude may call web_search in one turn. Default 3. */
  webSearchMaxUses?: number;
}

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4000,
  label = 'claude',
  opts: CallClaudeOptions = {}
): Promise<string> {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ANTHROPIC_API_KEY');
  }
  const t0 = Date.now();
  // Body shape allows an optional tools array for server-side web_search.
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (opts.webSearch) {
    body.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: opts.webSearchMaxUses ?? 3,
      },
    ];
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
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
    // SALVAGE PATH: Claude often truncates mid-object when hitting max_tokens.
    // Find the last complete top-level object (closing '}' followed by ',' or end-of-array)
    // and rebuild a valid array from it.
    const isArray = sliced.trimStart().startsWith('[');
    if (isArray) {
      const salvaged = salvageTruncatedArray(sliced);
      if (salvaged) {
        try {
          const parsed = JSON.parse(salvaged) as T;
          const len = Array.isArray(parsed) ? parsed.length : 0;
          dwarn(
            label,
            `recovered ${len} complete entries from truncated JSON (orig ${sliced.length} chars)`
          );
          return parsed;
        } catch {
          // fall through to original error
        }
      }
    }
    dwarn(
      label,
      `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}; sample: ${sliced.slice(0, 200)}`
    );
    throw err;
  }
}

/**
 * Salvage a truncated JSON array string by trimming back to the last complete
 * top-level object and closing the array. Tracks brace depth to avoid mistaking
 * a brace inside a nested object/string for a top-level boundary.
 */
function salvageTruncatedArray(text: string): string | null {
  // Strip leading whitespace + opening '['
  const openIdx = text.indexOf('[');
  if (openIdx < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteEnd = -1; // index just after the last complete top-level '}'
  for (let i = openIdx + 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteEnd = i + 1; // include this closing brace
      }
    } else if (ch === ']' && depth === 0) {
      // already a complete array — caller would've parsed
      return null;
    }
  }
  if (lastCompleteEnd < 0) return null;
  return text.slice(0, lastCompleteEnd) + ']';
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
  count = 30,
  excludeNames: string[] = []
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

  const system = `You are a hyper-selective urban concierge curating ONLY venues that the expert reference sources below have written up, ranked, or starred. NEVER include generic crowd-pleasers, chain restaurants, mass-market spots, or tourist traps. Every pick MUST be one that at least one of these specialised editors would put in their own list:
${sourceList}

For ${category === 'eat' ? 'food' : category === 'drink' ? 'drinks (wines, cocktails, coffee, beer, sake, etc.)' : 'activities and culture'}, weight heavily toward:
${
  category === 'eat'
    ? '- Michelin-recognised kitchens, World\'s 50 Best lists, Eater Essentials, Infatuation Top picks, Bib Gourmand, Opinionated About Dining\n- Chef-driven, ingredient-led, regional-specialty kitchens\n- Star Wine List restaurants for wine-led venues'
    : category === 'drink'
    ? '- Raisin-listed natural-wine bars, Star Wine List spots, World\'s 50 Best Bars / Top 500 Bars / Difford\'s notable venues\n- Untappd top-rated and RateBeer Best craft beer\n- Vivino-verified bottle lists, Wine-Searcher backed venues\n- Sprudge / Perfect Daily Grind specialty-coffee roasters and shops\n- For cocktails: Punch, Liquor.com, Imbibe-mentioned bars'
    : '- Atlas Obscura, Wallpaper* City Guide, Condé Nast, National Geographic Travel-listed places\n- Design-led / architecture-significant venues\n- Time Out / Culture Trip current top picks'
}

Hard rules:
- Real, currently-operating venues only. If you suspect a place may have closed, drop it.
- Must be on Google Maps with ≥4.2 rating and ≥25 reviews (best of your knowledge).
- Spell the venue name EXACTLY as it appears on Google Maps so it can be matched.
- The "source_inspirations" array MUST contain at least one of the named sources above that has actually featured this place. If you can't cite a real expert source for a venue, do NOT include it.
- Each "why_recommended" is ONE compact sentence (max 25 words), citing what makes this place a specialist's pick.
- Keep "source_inspirations" to max 3 entries.
- Output ONLY the JSON array — no preamble, no markdown, no commentary.`;

  const excludeBlock =
    excludeNames.length > 0
      ? `\n\nDO NOT include any of these venues (already covered): ${excludeNames.slice(0, 50).join(', ')}.`
      : '';

  const user = `City: ${cityName}, ${countryName}
Category: ${categoryDescription}

User preferences:
${preferencesBlock(prefs)}${excludeBlock}

Task: Return the top ${count} ${categoryDescription} in ${cityName} that best match this user, ranked from #1 (most recommended) downward.

Output JSON only — an array of ${count} objects with this exact shape:
[
  {
    "name": "exact venue name as it appears on Google Maps",
    "neighborhood": "neighborhood or district",
    "address": "approximate street address if known",
    "why_recommended": "ONE short sentence (max 25 words) — why this matches user's preferences",
    "source_inspirations": ["max 3 source names from the list above"]
  }
]

Strict requirements:
- Only real venues, currently operating, currently open this week
- Each pick MUST be one a specialist editor (from the system source list) would actually endorse — no generic crowd-pleasers, no chains, no tourist traps
- "source_inspirations" must include at least one real source that has covered the venue. If you can't cite one honestly, skip the venue.
- Spell venue names exactly so they can be matched on Google Maps
- Order by how well it matches the user's preferences AND by editorial reputation
- Diverse mix across price points and neighborhoods
- Keep "why_recommended" to ONE short sentence (max 25 words), citing what specialists love
- Keep "source_inspirations" to max 3 entries
- Output ONLY the JSON array, nothing else.`;

  // Token budget: ~140 chars/place compact format × count + overhead.
  // 25 places ≈ 4000 chars (~1500 tokens) → 5000 max_tokens
  // 100 places ≈ 16000 chars (~5500 tokens) → 12000 max_tokens
  const maxTokens = Math.min(20000, Math.max(4000, count * 120));
  const raw = await callClaude(system, user, maxTokens, `claude.${category}`);
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
  const system = `You are a sharp, witty travel writer with the voice of a global globetrotter who has actually been there — drawing on Lonely Planet, Condé Nast Traveler, National Geographic Travel, Atlas Obscura, Wikipedia, Time Out, Wallpaper* City Guides, plus deep web research.

For pages 3-6 you MUST use the web_search tool to ground content in REAL events, political shifts, cultural moves, and direction-of-the-city stories from the past 10-20 years and especially the last few years. Don't speculate — search and cite.

Tone: humorous, specific, never generic. Drop in dry one-liners and globetrotter knowing-asides. Use real names, real dates, real numbers. Respond with valid JSON only — no preamble, no markdown.`;

  const user = `City: ${cityName}, ${countryName}

Create a 6-page deep-dive titled "${cityName} essentials". Each page has a distinct angle and is RICH in detail. Each page's body should be 3-4 substantial paragraphs (~250-300 words each). No platitudes, no clichés.

Page 1 — "The deep history": founding, key empires/dynasties, defining battles or treaties, why the city ended up where it did geographically/economically. Real dates, real names. Write it like an entertaining popular-history podcast.
Page 2 — "20th century shifts": wars, revolutions, regime changes, industrial rises and falls, the people who shaped the city. Concrete events with dates.
Page 3 — "Modern era — political and social shifts (past 10-20 years)": real recent politics, elections, protests, social movements, leadership changes, EU/regional dynamics. USE WEB SEARCH for the past 5 years specifically.
Page 4 — "Cultural fabric right now": music scene, art, literature, food revolution, what's edgy, what's establishment, where the cool kids vs. the old guard go. USE WEB SEARCH for current cultural news.
Page 5 — "Hidden gems and curious facts": insider knowledge — unusual museums, ghost stories, secret bars, underground spots, neighborhoods locals love that tourists miss. Funny and specific.
Page 6 — "Where ${cityName} is heading": new infrastructure, demographic shifts, gentrification debates, tech/creative-industry moves, urban-planning controversies, climate adaptation, expat flows. USE WEB SEARCH for current direction-of-city stories.

Output ONLY this JSON shape — an array of exactly 6 objects:
[
  {
    "title": "page title (4-7 words, evocative)",
    "subtitle": "short subtitle (under 14 words)",
    "body": "3-4 paragraphs of vivid, specific prose with real names/dates/numbers. Globetrotter voice — humorous, knowing, never dry. 250-300 words.",
    "highlights": ["5 sharp bullet facts/tips/dates, max 10 words each"],
    "accentHex": "matching hex colour (e.g. #5BA9FF)"
  }
]
Output ONLY the JSON array, nothing else.`;

  const raw = await callClaude(system, user, 16000, 'claude.info', {
    webSearch: true,
    webSearchMaxUses: 6,
  });
  const pages = extractJson<ContentPage[]>(raw, 'parse.info');
  return pages.slice(0, 6);
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

  const system = `You are a brilliantly witty, slightly cheeky, deeply knowledgeable local concierge AI. Your job: read this user's profile and generate a hyper-personalised, contextual, hilarious-but-useful "right now" snapshot for the city they're in.

CRITICAL FOR "newsThemes" AND "bigPicture": use the web_search tool to find ACTUAL local news from THIS WEEK in ${cityName}. Search for things like:
- "${cityName} news this week"
- "${cityName} ${dateLabel.slice(0, 7)}"  (year-month)
- big stories, cultural events, sports, food scene happening right now
DO NOT rely on training data for current events — your training data is outdated. Always cite events from the last 7 days.

Use real venues that exist on Google Maps. Be specific. Be funny. Be warm. Drop lyrical references and inside jokes only a real local would know. After web search, output ONLY the final JSON — no preamble, no markdown, no commentary about what you searched.`;

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
  "bigPicture": "2-3 conversational paragraphs (~150 words total) summarising what's ACTUALLY happening in ${cityName} this week as found via web_search — name real recent events with approximate dates. Conversational tone, drop in 1-2 jokes, address the user by nickname. Mix in a cheeky reference to their preferences.",
  "newsThemes": [
    { "title": "Sharp 5-7 word headline of a REAL recent story", "summary": "1-2 sentence punchy take grounded in something found via web_search this week" }
  ] (provide exactly 4 themes from THIS WEEK in ${cityName} — politics/policy, culture/arts, sports/events, food&drink scene. Each MUST reference a real event from the last 7-14 days. No generic recurring topics.),
  "schedule": [
    { "when": "label like 'Right now', '11:00', 'Lunch', 'Late afternoon', 'Evening drink', 'Dinner', 'Late night'", "activity": "what to do (verb-led)", "place": "specific real venue name in ${cityName}", "why": "why THIS user would love it (reference preferences/weather)" }
  ] (provide exactly 10 entries spanning the next 12-24 hours, ordered chronologically. Mix eats, drinks, activities, walks, viewpoints. Real venues only.),
  "song": { "title": "Real song title that fits ${cityName} vibe + user taste", "artist": "Real artist" },
  "video": { "title": "Compelling YouTube title (real or representative)", "query": "search query that will return a great video" },
  "wikiTitle": "Wikipedia article title most relevant for context (city itself, or a specific neighborhood / dish / scene)",
  "imageQueries": ["3 short image search queries for evocative photos: e.g., 'skopje old bazaar dusk', 'macedonian ajvar', 'vardar river'"]
}

Be unapologetically witty. Reference user's age, gender, language background where relevant. Make the schedule feel like a real day. Output ONLY the JSON.`;

  const raw = await callClaude(system, user, 6000, 'claude.now', {
    webSearch: true,
    webSearchMaxUses: 4,
  });
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
    forecast: weather?.daily.slice(0, 7).map((d) => ({
      weekday: d.weekday,
      highC: d.highC,
      lowC: d.lowC,
      weatherCode: d.weatherCode,
    })),
    hourly: weather?.hourly.slice(0, 48).map((h) => ({
      hourLabel: h.hourLabel,
      dayLabel: h.dayLabel,
      tempC: h.tempC,
      weatherCode: h.weatherCode,
      precipitationProbability: h.precipitationProbability,
    })),
  };
}

// ============================================================
// Menu vision analysis
// ============================================================

interface AnthropicVisionBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

async function callClaudeWithImage(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  imageMediaType: string,
  maxTokens: number,
  label: string
): Promise<string> {
  if (!API_KEY) throw new Error('Missing EXPO_PUBLIC_ANTHROPIC_API_KEY');
  const t0 = Date.now();
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMediaType,
              data: imageBase64,
            },
          } as AnthropicVisionBlock,
          { type: 'text', text: userText } as AnthropicTextBlock,
        ],
      },
    ],
  };
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
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

interface MenuGen {
  languageDetected: string;
  menuTitle: string;
  currency: string;
  sections: Array<{
    name: string;
    originalName: string;
    items: Array<{
      originalName: string;
      englishName: string;
      description: string;
      price: string;
    }>;
  }>;
  recommendations: Array<{
    itemName: string;
    whyForYou: string;
    tags: string[];
  }>;
}

export async function analyzeMenu(
  imageBase64: string,
  imageMediaType: string,
  cityName: string,
  countryName: string,
  prefs: UserPreferences,
  photoUri: string
): Promise<MenuAnalysis> {
  const system = `You are an expert sommelier, food critic, and translator. You are looking at a photo of a menu (food, drinks, wines, or cocktails) from a venue in ${cityName}, ${countryName}.

Your job:
1. Identify the menu language.
2. Transcribe and translate every item to English, preserving the menu structure (sections), with prices.
3. Pick 4-6 standout recommendations based on the user's preferences below. PRIORITIZE local specialties and regional/seasonal items — use the user's preferences to break ties. Never invent items not on the menu.

Respond with valid JSON only — no preamble, no markdown.`;

  const userText = `User preferences:
${preferencesBlock(prefs)}

Analyse the menu in the attached image. Output ONLY this JSON shape (no other text):

{
  "languageDetected": "language name",
  "menuTitle": "venue name if visible, else 'Menu'",
  "currency": "currency symbol or code (e.g. €, $, ден, ¥) — best guess if not stated",
  "sections": [
    {
      "name": "Section name in English (e.g. 'Starters', 'Main Courses', 'Wines by the Glass')",
      "originalName": "Section name as it appears on the menu",
      "items": [
        {
          "originalName": "item name exactly as printed",
          "englishName": "concise English translation",
          "description": "translated description (or empty string if not on menu)",
          "price": "price with currency, e.g. '€18' or '350 ден' — empty string if unknown"
        }
      ]
    }
  ],
  "recommendations": [
    {
      "itemName": "the originalName of the chosen item, exactly as in the menu",
      "whyForYou": "1-2 sentences. Cite the user's preferences. Note if it is a local specialty.",
      "tags": ["short labels e.g. 'local specialty', 'matches: raw seafood', 'natural wine']
    }
  ]
}

Rules:
- Transcribe ONLY what's visible on the menu — do not invent items, sections, or prices.
- Keep the JSON compact. Each description ≤ 25 words. Each whyForYou ≤ 30 words.
- Pick 4-6 recommendations total, ranked best-first.
- If the menu is mostly drinks, recommend drinks; if food, food; if mixed, balance.
- Output ONLY the JSON object.`;

  const raw = await callClaudeWithImage(
    system,
    userText,
    imageBase64,
    imageMediaType,
    8000,
    'claude.menu'
  );
  const gen = extractJson<MenuGen>(raw, 'parse.menu');
  return {
    analyzedAt: Date.now(),
    photoUri,
    languageDetected: gen.languageDetected ?? 'Unknown',
    menuTitle: gen.menuTitle ?? 'Menu',
    currency: gen.currency ?? '',
    sections: gen.sections ?? [],
    recommendations: gen.recommendations ?? [],
  };
}

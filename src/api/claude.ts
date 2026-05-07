import type { ContentPage, UserPreferences } from '../types';
import {
  DO_SOURCES,
  DRINK_SOURCES,
  EAT_SOURCES,
} from '../constants/sources';

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
  maxTokens = 4000
): Promise<string> {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ANTHROPIC_API_KEY');
  }
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
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
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data: AnthropicResponse = await res.json();
  const text = data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();
  if (!text) throw new Error('Empty Claude response');
  return text;
}

function extractJson<T>(raw: string): T {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const firstBrace = candidate.indexOf('{');
  const firstBracket = candidate.indexOf('[');
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start < 0) {
    throw new Error(`Could not find JSON in: ${raw.slice(0, 200)}`);
  }
  const lastBrace = candidate.lastIndexOf('}');
  const lastBracket = candidate.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  const sliced = candidate.slice(start, end + 1);
  return JSON.parse(sliced) as T;
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

  const raw = await callClaude(system, user, 8000);
  return extractJson<CuratedPlaceSeed[]>(raw);
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

  const raw = await callClaude(system, user, 4000);
  const pages = extractJson<ContentPage[]>(raw);
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

  const raw = await callClaude(system, user, 4000);
  const pages = extractJson<ContentPage[]>(raw);
  return pages.slice(0, 3);
}

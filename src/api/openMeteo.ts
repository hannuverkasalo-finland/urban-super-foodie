import { dwarn, dlog } from '../store/debugLog';

const BASE = 'https://api.open-meteo.com/v1/forecast';

export interface CurrentWeather {
  tempC: number;
  windKph: number;
  humidity: number;
  weatherCode: number;
  time: string;
}

export interface DailyForecast {
  date: string;
  weekday: string;
  highC: number;
  lowC: number;
  weatherCode: number;
}

export interface HourlyForecast {
  time: string; // ISO-like local datetime
  hourLabel: string; // e.g. "14:00"
  dayLabel: string; // e.g. "Today", "Tomorrow", "Fri"
  tempC: number;
  weatherCode: number;
  precipitationProbability: number;
  windKph: number;
}

export interface WeatherSnapshot {
  current: CurrentWeather;
  daily: DailyForecast[];
  hourly: HourlyForecast[]; // next ~48h from now
  timezone: string;
}

interface OMResponse {
  timezone?: string;
  current?: {
    time: string;
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
  };
}

const WEATHER_LABELS: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Clear sky', emoji: '☀️' },
  1: { label: 'Mostly clear', emoji: '🌤' },
  2: { label: 'Partly cloudy', emoji: '⛅' },
  3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Foggy', emoji: '🌫' },
  48: { label: 'Rime fog', emoji: '🌫' },
  51: { label: 'Light drizzle', emoji: '🌦' },
  53: { label: 'Drizzle', emoji: '🌦' },
  55: { label: 'Heavy drizzle', emoji: '🌧' },
  61: { label: 'Light rain', emoji: '🌦' },
  63: { label: 'Rain', emoji: '🌧' },
  65: { label: 'Heavy rain', emoji: '🌧' },
  71: { label: 'Light snow', emoji: '🌨' },
  73: { label: 'Snow', emoji: '🌨' },
  75: { label: 'Heavy snow', emoji: '❄️' },
  77: { label: 'Snow grains', emoji: '❄️' },
  80: { label: 'Rain showers', emoji: '🌧' },
  81: { label: 'Heavy showers', emoji: '⛈' },
  82: { label: 'Violent showers', emoji: '⛈' },
  85: { label: 'Snow showers', emoji: '🌨' },
  86: { label: 'Heavy snow showers', emoji: '❄️' },
  95: { label: 'Thunderstorm', emoji: '⛈' },
  96: { label: 'Storm + hail', emoji: '⛈' },
  99: { label: 'Severe storm', emoji: '⛈' },
};

export function describeWeather(code: number): { label: string; emoji: string } {
  return WEATHER_LABELS[code] ?? { label: 'Unknown', emoji: '🌡' };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dayLabelFor(d: Date, todayMidnight: Date): string {
  const dayDiff = Math.floor(
    (d.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return WEEKDAYS[d.getDay()];
}

export async function fetchWeather(
  lat: number,
  lng: number
): Promise<WeatherSnapshot | null> {
  try {
    const url =
      `${BASE}?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) {
      dwarn('weather', `HTTP ${res.status}`);
      return null;
    }
    const json: OMResponse = await res.json();
    if (!json.current || !json.daily) {
      dwarn('weather', 'incomplete response');
      return null;
    }
    const daily: DailyForecast[] = json.daily.time.map((dateStr, i) => {
      const d = new Date(dateStr);
      return {
        date: dateStr,
        weekday: WEEKDAYS[d.getUTCDay()],
        highC: Math.round(json.daily!.temperature_2m_max[i]),
        lowC: Math.round(json.daily!.temperature_2m_min[i]),
        weatherCode: json.daily!.weather_code[i],
      };
    });

    // Build 48h hourly forecast starting at "now" (next whole hour).
    let hourly: HourlyForecast[] = [];
    if (json.hourly?.time?.length) {
      const now = new Date();
      const todayMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const startIdx = Math.max(
        0,
        json.hourly.time.findIndex((t) => {
          // Open-Meteo returns local-time strings like "2026-05-15T14:00"
          const ht = new Date(t);
          return ht.getTime() >= now.getTime() - 60 * 60 * 1000;
        })
      );
      const endIdx = Math.min(json.hourly.time.length, startIdx + 48);
      hourly = json.hourly.time
        .slice(startIdx, endIdx)
        .map((t, i) => {
          const d = new Date(t);
          return {
            time: t,
            hourLabel: `${pad2(d.getHours())}:00`,
            dayLabel: dayLabelFor(d, todayMidnight),
            tempC: Math.round(json.hourly!.temperature_2m[startIdx + i]),
            weatherCode: json.hourly!.weather_code[startIdx + i],
            precipitationProbability: Math.round(
              json.hourly!.precipitation_probability[startIdx + i] ?? 0
            ),
            windKph: Math.round(
              json.hourly!.wind_speed_10m[startIdx + i] ?? 0
            ),
          };
        });
    }

    const snapshot: WeatherSnapshot = {
      timezone: json.timezone ?? 'UTC',
      current: {
        tempC: Math.round(json.current.temperature_2m),
        windKph: Math.round(json.current.wind_speed_10m),
        humidity: Math.round(json.current.relative_humidity_2m),
        weatherCode: json.current.weather_code,
        time: json.current.time,
      },
      daily,
      hourly,
    };
    dlog(
      'weather',
      `${snapshot.current.tempC}°C, code=${snapshot.current.weatherCode}, ${daily.length}d forecast, ${hourly.length}h hourly`
    );
    return snapshot;
  } catch (err) {
    dwarn('weather', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export function formatWeatherSummary(w: WeatherSnapshot): string {
  const c = describeWeather(w.current.weatherCode);
  const today = w.daily[0];
  const todayDesc = today ? ` Today ${today.lowC}-${today.highC}°C.` : '';
  return `${c.emoji} ${w.current.tempC}°C · ${c.label}.${todayDesc}`;
}

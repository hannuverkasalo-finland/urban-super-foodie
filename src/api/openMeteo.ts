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

export interface WeatherSnapshot {
  current: CurrentWeather;
  daily: DailyForecast[];
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

export async function fetchWeather(
  lat: number,
  lng: number
): Promise<WeatherSnapshot | null> {
  try {
    const url = `${BASE}?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
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
    };
    dlog(
      'weather',
      `${snapshot.current.tempC}°C, code=${snapshot.current.weatherCode}, ${daily.length}d forecast`
    );
    return snapshot;
  } catch (err) {
    dwarn(
      'weather',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export function formatWeatherSummary(w: WeatherSnapshot): string {
  const c = describeWeather(w.current.weatherCode);
  const today = w.daily[0];
  const todayDesc = today
    ? ` Today ${today.lowC}-${today.highC}°C.`
    : '';
  return `${c.emoji} ${w.current.tempC}°C · ${c.label}.${todayDesc}`;
}

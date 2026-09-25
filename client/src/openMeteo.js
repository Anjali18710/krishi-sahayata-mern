// Backup path: call Open-Meteo straight from the browser.
// Used only when our server reports WEATHER_UNAVAILABLE. Free hosting shares its outgoing IP address
// with many other apps, so Open-Meteo's free daily limit for that IP can run out (HTTP 429).
// The user's own browser has its own IP and its own limit.
// Returns the same shapes as the server (server/src/services/weather.service.js).
import axios from 'axios';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'wind_gusts_10m_max',
  'precipitation_probability_max',
];

const round = (n) => Number(Number(n).toFixed(2));

/** True when the server said the weather service failed, so the browser should try directly. */
export const isWeatherUnavailable = (err) => err?.response?.data?.code === 'WEATHER_UNAVAILABLE';

export async function fetchForecastDirect(latitude, longitude) {
  const { data } = await axios.get(FORECAST_URL, {
    timeout: 10000,
    params: {
      latitude: round(latitude),
      longitude: round(longitude),
      forecast_days: 7,
      daily: DAILY_VARS.join(','),
      timezone: 'auto',
    },
  });
  const d = data.daily || {};
  return (d.time || []).map((date, i) => ({
    date,
    weatherCode: d.weather_code?.[i] ?? null,
    tempMax: d.temperature_2m_max?.[i] ?? null,
    tempMin: d.temperature_2m_min?.[i] ?? null,
    precipitation: d.precipitation_sum?.[i] ?? null,
    windGustMax: d.wind_gusts_10m_max?.[i] ?? null,
    precipitationProbability: d.precipitation_probability_max?.[i] ?? null,
  }));
}

export async function searchPlacesDirect(q) {
  const { data } = await axios.get(GEOCODING_URL, {
    timeout: 10000,
    params: { name: q, count: 8, language: 'en', countryCode: 'IN', format: 'json' },
  });
  return (data.results || []).map((r) => ({
    name: r.name,
    state: r.admin1 || '',
    district: r.admin2 || '',
    latitude: r.latitude,
    longitude: r.longitude,
    label: [r.name, r.admin2, r.admin1].filter(Boolean).join(', '),
  }));
}

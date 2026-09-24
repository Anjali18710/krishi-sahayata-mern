// Talks to the free Open-Meteo APIs (no API key needed):
//   - Historical weather (archive-api)  : past daily weather, available with about 5 days delay
//   - Forecast (api)                    : next 7 days, and also the last few weeks via past_days
//   - Geocoding (geocoding-api)         : place name -> latitude/longitude
// Docs: https://open-meteo.com/en/docs
const axios = require('axios');
const WeatherCache = require('../models/WeatherCache');

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// The archive API is about 5 days behind, so anything more recent comes from the forecast API.
const ARCHIVE_DELAY_DAYS = 6;

const DAILY_VARS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_gusts_10m_max'];

const http = axios.create({ timeout: 10000 });

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateString = (d) => new Date(d).toISOString().slice(0, 10); // "2026-09-24"
const round = (n, digits = 2) => Number(Number(n).toFixed(digits));

// Returns cached data for `key`, or calls fetcher() and caches the result for ttlSeconds.
async function cached(key, ttlSeconds, fetcher) {
  const hit = await WeatherCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
  if (hit) return hit.data;

  const data = await fetcher();
  await WeatherCache.updateOne(
    { key },
    { $set: { data, expiresAt: new Date(Date.now() + ttlSeconds * 1000) } },
    { upsert: true }
  );
  return data;
}

// Open-Meteo returns columns: { time: [...], precipitation_sum: [...], ... }.
// This turns them into rows: [{ date, precipitation, tempMax, ... }, ...]
function toDays(daily) {
  if (!daily || !Array.isArray(daily.time)) return [];
  return daily.time.map((date, i) => ({
    date,
    weatherCode: daily.weather_code?.[i] ?? null,
    tempMax: daily.temperature_2m_max?.[i] ?? null,
    tempMin: daily.temperature_2m_min?.[i] ?? null,
    precipitation: daily.precipitation_sum?.[i] ?? null,
    windGustMax: daily.wind_gusts_10m_max?.[i] ?? null,
    precipitationProbability: daily.precipitation_probability_max?.[i] ?? null,
  }));
}

/**
 * Daily weather for a location between two dates (inclusive, "YYYY-MM-DD").
 * Returns { source: 'archive' | 'forecast', days: [...] }
 */
async function getDailyHistory(latitude, longitude, startDate, endDate) {
  const lat = round(latitude);
  const lon = round(longitude);
  const start = toDateString(startDate);
  const end = toDateString(endDate);
  const useArchive = new Date(end).getTime() <= Date.now() - ARCHIVE_DELAY_DAYS * DAY_MS;

  const key = `history:${lat},${lon}:${start}:${end}`;
  // Old data never changes, so cache it for 30 days; recent data for 6 hours
  const ttl = useArchive ? 30 * 24 * 3600 : 6 * 3600;

  return cached(key, ttl, async () => {
    if (useArchive) {
      const { data } = await http.get(ARCHIVE_URL, {
        params: {
          latitude: lat,
          longitude: lon,
          start_date: start,
          end_date: end,
          daily: DAILY_VARS.join(','),
          timezone: 'auto',
        },
      });
      return { source: 'archive', days: toDays(data.daily) };
    }

    // Recent dates: ask the forecast API for enough past days and keep only the range we need
    const pastDays = Math.min(92, Math.ceil((Date.now() - new Date(start).getTime()) / DAY_MS) + 1);
    const { data } = await http.get(FORECAST_URL, {
      params: {
        latitude: lat,
        longitude: lon,
        past_days: pastDays,
        forecast_days: 1,
        daily: DAILY_VARS.join(','),
        timezone: 'auto',
      },
    });
    const days = toDays(data.daily).filter((d) => d.date >= start && d.date <= end);
    return { source: 'forecast', days };
  });
}

/** 7-day forecast for a location. */
async function getForecast(latitude, longitude) {
  const lat = round(latitude);
  const lon = round(longitude);
  return cached(`forecast:${lat},${lon}`, 3600, async () => {
    const { data } = await http.get(FORECAST_URL, {
      params: {
        latitude: lat,
        longitude: lon,
        forecast_days: 7,
        daily: [...DAILY_VARS, 'precipitation_probability_max'].join(','),
        timezone: 'auto',
      },
    });
    return { timezone: data.timezone, days: toDays(data.daily) };
  });
}

/** Search Indian places by name. Returns [{ name, state, district, latitude, longitude, label }] */
async function searchPlaces(query) {
  const q = String(query).trim();
  return cached(`geocode:${q.toLowerCase()}`, 24 * 3600, async () => {
    const { data } = await http.get(GEOCODING_URL, {
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
  });
}

module.exports = { getDailyHistory, getForecast, searchPlaces, toDays, toDateString, DAY_MS };

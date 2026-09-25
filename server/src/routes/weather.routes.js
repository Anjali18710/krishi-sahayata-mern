const express = require('express');
const { query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const { getForecast, searchPlaces } = require('../services/weather.service');
const { runWeatherAlerts } = require('../jobs/weatherAlerts');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(requireAuth);

// Wraps Open-Meteo errors so the user sees a friendly message instead of a crash
async function callWeatherApi(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Log the real reason (e.g. Open-Meteo's own error message) so it shows up in the server logs
    console.error(`Open-Meteo request failed: ${err.response?.status || ''} ${err.response?.data?.reason || err.message}`);
    throw new ApiError(502, 'Weather service is not responding. Please try again shortly.', 'WEATHER_UNAVAILABLE');
  }
}

// GET /api/weather/forecast?latitude=20.29&longitude=85.82
router.get(
  '/forecast',
  [
    query('latitude').isFloat({ min: -90, max: 90 }).withMessage('latitude is required'),
    query('longitude').isFloat({ min: -180, max: 180 }).withMessage('longitude is required'),
  ],
  validate,
  async (req, res) => {
    const forecast = await callWeatherApi(() => getForecast(Number(req.query.latitude), Number(req.query.longitude)));
    res.json(forecast);
  }
);

// GET /api/weather/places?q=Bhubaneswar  - search a village/town to get its coordinates
router.get(
  '/places',
  [query('q').trim().isLength({ min: 2, max: 60 }).withMessage('Type at least 2 letters')],
  validate,
  async (req, res) => {
    const places = await callWeatherApi(() => searchPlaces(req.query.q));
    res.json({ places });
  }
);

// POST /api/weather/alerts/run  (admin) - run the daily weather-alert job right now
router.post('/alerts/run', requireRole(ROLES.ADMIN), async (req, res) => {
  res.json(await runWeatherAlerts());
});

module.exports = router;

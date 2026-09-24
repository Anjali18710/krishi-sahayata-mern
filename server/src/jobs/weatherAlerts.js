// Daily job: checks the weather forecast for every farmer's farm location and sends an
// SMS warning when heavy rain, extreme heat or very strong wind is expected in the next 2 days.
const cron = require('node-cron');
const env = require('../config/env');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { ROLES } = require('../constants');
const { getForecast } = require('../services/weather.service');
const { sendSms } = require('../services/sms.service');

const THRESHOLDS = {
  heavyRainMm: 64.5, // IMD "heavy rain"
  extremeHeatC: 45, // IMD heatwave
  strongWindKmh: 62,
};
const DAYS_AHEAD = 2;

/** Pure function: which alerts does this forecast trigger? */
function detectAlerts(days) {
  const alerts = [];
  for (const day of days.slice(0, DAYS_AHEAD)) {
    if (day.precipitation >= THRESHOLDS.heavyRainMm) alerts.push({ type: 'heavy_rain', date: day.date, value: day.precipitation });
    if (day.tempMax >= THRESHOLDS.extremeHeatC) alerts.push({ type: 'extreme_heat', date: day.date, value: day.tempMax });
    if (day.windGustMax >= THRESHOLDS.strongWindKmh) alerts.push({ type: 'strong_wind', date: day.date, value: day.windGustMax });
  }
  return alerts;
}

function formatDate(isoDate, language) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const LINES = {
  en: {
    heavy_rain: (a, d) => `Heavy rain (about ${Math.round(a.value)} mm) expected on ${d}. Move harvested crop to a safe place and clear field drainage.`,
    extreme_heat: (a, d) => `Extreme heat (up to ${Math.round(a.value)}°C) expected on ${d}. Irrigate if needed and avoid field work in the afternoon.`,
    strong_wind: (a, d) => `Strong winds (gusts up to ${Math.round(a.value)} km/h) expected on ${d}. Secure sheds and support tall crops.`,
  },
  hi: {
    heavy_rain: (a, d) => `${d} को भारी बारिश (लगभग ${Math.round(a.value)} मिमी) की संभावना है। कटी फसल सुरक्षित जगह रखें और खेत से पानी निकलने का रास्ता साफ़ रखें।`,
    extreme_heat: (a, d) => `${d} को बहुत तेज़ गर्मी (${Math.round(a.value)}°C तक) की संभावना है। ज़रूरत हो तो सिंचाई करें और दोपहर में खेत का काम न करें।`,
    strong_wind: (a, d) => `${d} को तेज़ हवाएं (${Math.round(a.value)} किमी/घंटा तक) चलने की संभावना है। शेड मज़बूत करें और ऊँची फसलों को सहारा दें।`,
  },
};

function buildAlertMessage(alerts, language = 'en') {
  const lines = LINES[language] || LINES.en;
  const header = language === 'hi' ? 'कृषि सहायता मौसम चेतावनी:' : 'Krishi Sahayata weather alert:';
  return [header, ...alerts.map((a) => lines[a.type](a, formatDate(a.date, language)))].join('\n');
}

async function runWeatherAlerts() {
  const summary = { locations: 0, farmersChecked: 0, alertsSent: 0, skippedAlreadyAlerted: 0, errors: 0 };

  const farmers = await User.find({
    role: ROLES.FARMER,
    isActive: true,
    'farmLocation.latitude': { $ne: null },
    'farmLocation.longitude': { $ne: null },
  }).select('name phone language farmLocation');

  // Group farmers by location (rounded to ~1 km) so each location's forecast is fetched once
  const groups = new Map();
  for (const f of farmers) {
    const key = `${f.farmLocation.latitude.toFixed(2)},${f.farmLocation.longitude.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  summary.locations = groups.size;
  summary.farmersChecked = farmers.length;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  for (const [key, group] of groups) {
    const [lat, lon] = key.split(',').map(Number);
    let alerts;
    try {
      const forecast = await getForecast(lat, lon);
      alerts = detectAlerts(forecast.days);
    } catch (err) {
      summary.errors += 1;
      console.error(`Weather alerts: forecast failed for ${key}: ${err.message}`);
      continue;
    }
    if (alerts.length === 0) continue;

    for (const farmer of group) {
      // At most one weather alert per farmer per day, even if the job runs twice
      const already = await Notification.exists({ user: farmer._id, type: 'weather_alert', createdAt: { $gte: startOfToday } });
      if (already) {
        summary.skippedAlreadyAlerted += 1;
        continue;
      }
      await sendSms({
        to: farmer.phone,
        body: buildAlertMessage(alerts, farmer.language),
        type: 'weather_alert',
        userId: farmer._id,
      });
      summary.alertsSent += 1;
    }
  }

  return summary;
}

function scheduleWeatherAlerts() {
  const expr = env.weatherAlertCron;
  if (!expr || expr === 'off') return null;
  if (!cron.validate(expr)) {
    console.error(`WEATHER_ALERT_CRON "${expr}" is not a valid cron expression; weather alerts are disabled`);
    return null;
  }
  console.log(`Weather alerts scheduled: "${expr}" (Asia/Kolkata)`);
  return cron.schedule(
    expr,
    async () => {
      try {
        const summary = await runWeatherAlerts();
        console.log('Weather alerts finished:', summary);
      } catch (err) {
        console.error('Weather alerts job failed:', err);
      }
    },
    { timezone: 'Asia/Kolkata', noOverlap: true }
  );
}

module.exports = { runWeatherAlerts, scheduleWeatherAlerts, detectAlerts, buildAlertMessage, THRESHOLDS };

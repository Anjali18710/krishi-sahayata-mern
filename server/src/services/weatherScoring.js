// Weather check for claims: does the actual recorded weather around the date of loss
// match the cause the farmer reported?
//
// This file is "pure": it only does calculations on the numbers it is given
// (no database, no internet), which makes it easy to unit test.
//
// Output:
//   score   0-100, how strongly the weather supports the claim (higher = more support)
//   verdict consistent (>= 60) | inconclusive (30-59) | inconsistent (< 30) | not_applicable
//   reasons plain-English sentences explaining the score, shown to officers
//
// Rainfall thresholds follow the India Meteorological Department (IMD) daily rainfall
// categories: rainy day >= 2.5 mm, rather heavy 35.6-64.4 mm, heavy 64.5-115.5 mm,
// very heavy >= 115.6 mm. Other thresholds are simple rules of thumb.
// Important limitation: the rules use fixed thresholds, not each district's normal climate,
// so the result is a signal to help an officer, not a final decision.

const WEATHER_CAUSES = ['drought', 'flood', 'excess_rain', 'hailstorm', 'cyclone', 'heatwave', 'frost'];

// How many days before / after the date of loss to look at, per cause
const WINDOWS = {
  drought: { before: 30, after: 0 },
  flood: { before: 7, after: 1 },
  excess_rain: { before: 7, after: 1 },
  hailstorm: { before: 2, after: 1 },
  cyclone: { before: 3, after: 1 },
  heatwave: { before: 7, after: 0 },
  frost: { before: 3, after: 1 },
};

const RAIN = { RAINY_DAY: 2.5, RATHER_HEAVY: 35.6, HEAVY: 64.5, VERY_HEAVY: 115.6 };

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => dateOnly(new Date(new Date(d).getTime() + n * DAY_MS));

const values = (days, field) => days.map((d) => d[field]).filter((v) => typeof v === 'number');
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const max = (arr) => (arr.length ? Math.max(...arr) : null);
const min = (arr) => (arr.length ? Math.min(...arr) : null);
const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

// Largest total rainfall over any 3 consecutive days
function maxRolling3(days) {
  let best = 0;
  for (let i = 0; i < days.length; i += 1) {
    const total = sum(values(days.slice(i, i + 3), 'precipitation'));
    best = Math.max(best, total);
  }
  return best;
}

function verdictFor(score) {
  if (score >= 60) return 'consistent';
  if (score >= 30) return 'inconclusive';
  return 'inconsistent';
}

/** Date range of weather needed for a claim: { start, end } as "YYYY-MM-DD" (end is never in the future). */
function requiredRange(causeOfLoss, lossDate, today = new Date()) {
  const w = WINDOWS[causeOfLoss];
  if (!w) return null;
  const end = addDays(lossDate, w.after);
  return { start: addDays(lossDate, -w.before), end: end > dateOnly(today) ? dateOnly(today) : end };
}

// ---- one rule per cause: each returns { score, reasons, metrics } ----

const RULES = {
  drought(days) {
    const rain = values(days, 'precipitation');
    const total = sum(rain);
    const dryDays = rain.filter((v) => v < RAIN.RAINY_DAY).length;
    let score;
    if (total <= 25) score = 90;
    else if (total <= 60) score = 70;
    else if (total <= 120) score = 45;
    else score = 15;
    return {
      score,
      reasons: [
        `${r1(total)} mm of rain fell in the ${rain.length} days up to the date of loss.`,
        `${dryDays} of ${rain.length} days had less than ${RAIN.RAINY_DAY} mm of rain (dry days).`,
      ],
      metrics: { rainTotalMm: r1(total), dryDays, daysChecked: rain.length },
    };
  },

  flood(days) {
    const rain = values(days, 'precipitation');
    const max1d = max(rain) ?? 0;
    const max3d = maxRolling3(days);
    const total = sum(rain);
    let score;
    if (max1d >= RAIN.VERY_HEAVY) score = 95;
    else if (max1d >= RAIN.HEAVY) score = 80;
    else if (max3d >= 100) score = 70;
    else if (max1d >= RAIN.RATHER_HEAVY) score = 45;
    else if (total >= 50) score = 35;
    else score = 10;
    return {
      score,
      reasons: [
        `Highest single-day rainfall was ${r1(max1d)} mm (IMD "heavy rain" starts at ${RAIN.HEAVY} mm).`,
        `Highest 3-day rainfall was ${r1(max3d)} mm; total over the period was ${r1(total)} mm.`,
      ],
      metrics: { maxDailyRainMm: r1(max1d), max3DayRainMm: r1(max3d), rainTotalMm: r1(total) },
    };
  },

  excess_rain(days) {
    const rain = values(days, 'precipitation');
    const total = sum(rain);
    const max1d = max(rain) ?? 0;
    const rainyDays = rain.filter((v) => v >= RAIN.RAINY_DAY).length;
    let score;
    if (total >= 150) score = 90;
    else if (total >= 75 || max1d >= RAIN.HEAVY) score = 70;
    else if (total >= 35) score = 40;
    else score = 10;
    return {
      score,
      reasons: [
        `${r1(total)} mm of rain fell over ${rain.length} days around the date of loss, with ${rainyDays} rainy days.`,
        `Highest single-day rainfall was ${r1(max1d)} mm.`,
      ],
      metrics: { rainTotalMm: r1(total), rainyDays, maxDailyRainMm: r1(max1d) },
    };
  },

  hailstorm(days) {
    const codes = values(days, 'weatherCode');
    const thunderstorm = codes.some((c) => c >= 95 && c <= 99);
    const gust = max(values(days, 'windGustMax')) ?? 0;
    const max1d = max(values(days, 'precipitation')) ?? 0;
    let score;
    if (thunderstorm && gust >= 40) score = 80;
    else if (thunderstorm) score = 65;
    else if (gust >= 50 && max1d >= 10) score = 50;
    else if (max1d >= 10) score = 35;
    else score = 10;
    return {
      score,
      reasons: [
        thunderstorm
          ? 'A thunderstorm was recorded around the date of loss.'
          : 'No thunderstorm was recorded around the date of loss.',
        `Strongest wind gust was ${r1(gust)} km/h; highest daily rainfall was ${r1(max1d)} mm.`,
        'Note: weather models do not report hail directly for India, so thunderstorms and gusts are used as signs of hail.',
      ],
      metrics: { thunderstorm, maxWindGustKmh: r1(gust), maxDailyRainMm: r1(max1d) },
    };
  },

  cyclone(days) {
    const gust = max(values(days, 'windGustMax')) ?? 0;
    const max1d = max(values(days, 'precipitation')) ?? 0;
    let score;
    if (gust >= 88) score = 90;
    else if (gust >= 62) score = 75;
    else if (gust >= 40 && max1d >= RAIN.HEAVY) score = 60;
    else if (max1d >= RAIN.HEAVY) score = 40;
    else score = 10;
    return {
      score,
      reasons: [
        `Strongest wind gust was ${r1(gust)} km/h (62 km/h and above is cyclonic-storm strength).`,
        `Highest single-day rainfall was ${r1(max1d)} mm.`,
      ],
      metrics: { maxWindGustKmh: r1(gust), maxDailyRainMm: r1(max1d) },
    };
  },

  heatwave(days) {
    const tmax = max(values(days, 'tempMax'));
    if (tmax === null) return { score: null, reasons: ['No temperature data was available.'], metrics: {} };
    const hotDays = values(days, 'tempMax').filter((t) => t >= 40).length;
    let score;
    if (tmax >= 45) score = 90;
    else if (tmax >= 42) score = 70;
    else if (tmax >= 40) score = 50;
    else score = 10;
    return {
      score,
      reasons: [
        `Highest temperature in the week before the loss was ${r1(tmax)} °C (IMD declares a heatwave at 45 °C and above).`,
        `${hotDays} day(s) reached 40 °C or more.`,
      ],
      metrics: { maxTempC: r1(tmax), daysAbove40C: hotDays },
    };
  },

  frost(days) {
    const tmin = min(values(days, 'tempMin'));
    if (tmin === null) return { score: null, reasons: ['No temperature data was available.'], metrics: {} };
    let score;
    if (tmin <= 0) score = 90;
    else if (tmin <= 2) score = 75;
    else if (tmin <= 4) score = 50;
    else score = 10;
    return {
      score,
      reasons: [`Lowest temperature around the date of loss was ${r1(tmin)} °C (frost is likely at or below about 2 °C).`],
      metrics: { minTempC: r1(tmin) },
    };
  },
};

/**
 * @param {string} causeOfLoss
 * @param {Array} days  daily rows from weather.service (already limited to requiredRange)
 */
function scoreClaimWeather(causeOfLoss, days) {
  if (!WEATHER_CAUSES.includes(causeOfLoss)) {
    return {
      score: null,
      verdict: 'not_applicable',
      reasons: ['This cause of loss cannot be checked against weather data.'],
      metrics: {},
    };
  }

  // Need usable numbers for at least half of the days, otherwise don't guess
  const usable = days.filter((d) => [d.precipitation, d.tempMax, d.tempMin].some((v) => typeof v === 'number'));
  if (days.length === 0 || usable.length < Math.ceil(days.length / 2)) {
    return {
      score: null,
      verdict: 'inconclusive',
      reasons: ['Not enough weather data was available for this location and date.'],
      metrics: { daysChecked: usable.length },
    };
  }

  const result = RULES[causeOfLoss](usable);
  if (result.score === null) return { ...result, verdict: 'inconclusive' };
  return { ...result, verdict: verdictFor(result.score) };
}

module.exports = { scoreClaimWeather, requiredRange, verdictFor, WEATHER_CAUSES, WINDOWS, RAIN };

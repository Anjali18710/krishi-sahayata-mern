const { scoreClaimWeather, requiredRange, verdictFor } = require('../../src/services/weatherScoring');

// Builds n days of weather where fn(i) supplies the values for day i
function days(n, fn) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    precipitation: null,
    tempMax: null,
    tempMin: null,
    windGustMax: null,
    weatherCode: null,
    ...fn(i),
  }));
}

describe('verdictFor', () => {
  test('maps scores to verdicts', () => {
    expect(verdictFor(95)).toBe('consistent');
    expect(verdictFor(60)).toBe('consistent');
    expect(verdictFor(45)).toBe('inconclusive');
    expect(verdictFor(29)).toBe('inconsistent');
  });
});

describe('requiredRange', () => {
  test('drought looks at the 30 days before the loss', () => {
    expect(requiredRange('drought', '2026-09-20', new Date('2026-09-24'))).toEqual({ start: '2026-08-21', end: '2026-09-20' });
  });
  test('never asks for dates in the future', () => {
    expect(requiredRange('flood', '2026-09-24', new Date('2026-09-24T10:00:00Z')).end).toBe('2026-09-24');
  });
  test('returns null for causes that weather cannot check', () => {
    expect(requiredRange('pest_attack', '2026-09-20')).toBeNull();
  });
});

describe('scoreClaimWeather', () => {
  test('flood with very heavy rain is consistent', () => {
    const result = scoreClaimWeather('flood', days(9, (i) => ({ precipitation: i === 4 ? 130 : 3 })));
    expect(result.verdict).toBe('consistent');
    expect(result.score).toBe(95);
    expect(result.metrics.maxDailyRainMm).toBe(130);
  });

  test('flood claim with no rain is inconsistent', () => {
    const result = scoreClaimWeather('flood', days(9, () => ({ precipitation: 0 })));
    expect(result.verdict).toBe('inconsistent');
  });

  test('drought with almost no rain is consistent, a wet month is inconsistent', () => {
    expect(scoreClaimWeather('drought', days(31, (i) => ({ precipitation: i % 10 === 0 ? 4 : 0 }))).verdict).toBe('consistent');
    expect(scoreClaimWeather('drought', days(31, () => ({ precipitation: 10 }))).verdict).toBe('inconsistent');
  });

  test('hailstorm uses thunderstorm codes and gusts', () => {
    expect(scoreClaimWeather('hailstorm', days(4, (i) => ({ precipitation: 12, weatherCode: i === 2 ? 95 : 3, windGustMax: 45 }))).score).toBe(80);
    expect(scoreClaimWeather('hailstorm', days(4, () => ({ precipitation: 0, weatherCode: 1, windGustMax: 10 }))).verdict).toBe('inconsistent');
  });

  test('cyclone uses wind gust thresholds', () => {
    expect(scoreClaimWeather('cyclone', days(5, () => ({ precipitation: 20, windGustMax: 95 }))).score).toBe(90);
  });

  test('heatwave and frost use temperature', () => {
    expect(scoreClaimWeather('heatwave', days(8, () => ({ tempMax: 46 }))).verdict).toBe('consistent');
    expect(scoreClaimWeather('heatwave', days(8, () => ({ tempMax: 33 }))).verdict).toBe('inconsistent');
    expect(scoreClaimWeather('frost', days(5, () => ({ tempMin: 1 }))).score).toBe(75);
  });

  test('causes like pest attack are not applicable', () => {
    expect(scoreClaimWeather('pest_attack', []).verdict).toBe('not_applicable');
  });

  test('missing data gives inconclusive instead of a guess', () => {
    const result = scoreClaimWeather('flood', days(9, () => ({})));
    expect(result.verdict).toBe('inconclusive');
    expect(result.score).toBeNull();
  });
});

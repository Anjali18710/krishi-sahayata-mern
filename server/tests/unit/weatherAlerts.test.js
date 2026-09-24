const { detectAlerts, buildAlertMessage } = require('../../src/jobs/weatherAlerts');

const day = (date, values) => ({ date, precipitation: 0, tempMax: 30, windGustMax: 20, ...values });

describe('detectAlerts', () => {
  test('finds heavy rain, extreme heat and strong wind in the next 2 days', () => {
    const alerts = detectAlerts([
      day('2026-09-25', { precipitation: 80 }),
      day('2026-09-26', { tempMax: 46, windGustMax: 70 }),
    ]);
    expect(alerts.map((a) => a.type)).toEqual(['heavy_rain', 'extreme_heat', 'strong_wind']);
  });

  test('ignores normal weather and days beyond the 2-day window', () => {
    const alerts = detectAlerts([day('2026-09-25', {}), day('2026-09-26', {}), day('2026-09-27', { precipitation: 200 })]);
    expect(alerts).toEqual([]);
  });
});

describe('buildAlertMessage', () => {
  const alerts = [{ type: 'heavy_rain', date: '2026-09-25', value: 80.4 }];

  test('English', () => {
    expect(buildAlertMessage(alerts, 'en')).toMatch(/Heavy rain \(about 80 mm\) expected on 25 Sep/);
  });

  test('Hindi', () => {
    expect(buildAlertMessage(alerts, 'hi')).toMatch(/भारी बारिश/);
  });
});

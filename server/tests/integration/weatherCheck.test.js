// Tests the weather check end to end with Open-Meteo replaced by fake data,
// so the tests don't depend on the internet.
jest.mock('../../src/services/weather.service', () => ({
  getDailyHistory: jest.fn(),
}));

const request = require('supertest');
const db = require('../helpers/db');
const app = require('../../src/app');
const { getDailyHistory } = require('../../src/services/weather.service');
const { createFarmer, createStaff, authHeader, claimFields } = require('../helpers/factory');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

async function fileFloodClaim() {
  const officer = await createStaff('officer', { district: 'Puri' });
  const farmer = await createFarmer();
  let req = request(app).post('/api/claims').set(authHeader(farmer));
  for (const [k, v] of Object.entries(claimFields({ causeOfLoss: 'flood' }))) req = req.field(k, String(v));
  const { body } = await req;
  return { officer, claimId: body.claim._id };
}

test('heavy rain makes a flood claim "consistent"', async () => {
  getDailyHistory.mockResolvedValue({
    source: 'forecast',
    days: Array.from({ length: 9 }, (_, i) => ({ date: `2026-09-${10 + i}`, precipitation: i === 5 ? 140 : 5 })),
  });
  const { officer, claimId } = await fileFloodClaim();

  const res = await request(app).post(`/api/claims/${claimId}/weather-check`).set(authHeader(officer));
  expect(res.status).toBe(200);
  expect(res.body.weatherCheck).toMatchObject({ status: 'done', verdict: 'consistent', score: 95, source: 'forecast' });
  expect(res.body.weatherCheck.reasons.length).toBeGreaterThan(0);
});

test('no rain makes a flood claim "inconsistent" and it can be filtered', async () => {
  getDailyHistory.mockResolvedValue({
    source: 'archive',
    days: Array.from({ length: 9 }, (_, i) => ({ date: `2026-09-${10 + i}`, precipitation: 0 })),
  });
  const { officer, claimId } = await fileFloodClaim();
  await request(app).post(`/api/claims/${claimId}/weather-check`).set(authHeader(officer));

  const list = await request(app).get('/api/claims?verdict=inconsistent').set(authHeader(officer));
  expect(list.body.total).toBe(1);
});

test('a weather service outage is recorded, not crashed on', async () => {
  getDailyHistory.mockRejectedValue(new Error('connect ETIMEDOUT'));
  const { officer, claimId } = await fileFloodClaim();

  const res = await request(app).post(`/api/claims/${claimId}/weather-check`).set(authHeader(officer));
  expect(res.status).toBe(200);
  expect(res.body.weatherCheck).toMatchObject({ status: 'failed', verdict: 'inconclusive' });
});

test('farmers cannot run the weather check', async () => {
  const farmer = await createFarmer();
  const res = await request(app).post('/api/claims/64b000000000000000000000/weather-check').set(authHeader(farmer));
  expect(res.status).toBe(403);
});

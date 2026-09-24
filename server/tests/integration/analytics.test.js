const request = require('supertest');
const db = require('../helpers/db');
const app = require('../../src/app');
const Claim = require('../../src/models/Claim');
const { createFarmer, createStaff, authHeader, claimFields } = require('../helpers/factory');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

async function fileClaim(farmer, overrides) {
  let req = request(app).post('/api/claims').set(authHeader(farmer));
  for (const [k, v] of Object.entries(claimFields(overrides))) req = req.field(k, String(v));
  return (await req).body.claim;
}

test('summary counts claims, amounts and approval rate', async () => {
  const admin = await createStaff('admin');
  await createStaff('officer', { district: 'Puri' });
  const farmer = await createFarmer();

  const a = await fileClaim(farmer, { amountClaimed: 10000 });
  const b = await fileClaim(farmer, { amountClaimed: 20000, causeOfLoss: 'drought' });
  await fileClaim(farmer, { amountClaimed: 5000 });

  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await Claim.updateOne(
    { _id: a._id },
    { status: 'disbursed', amountApproved: 8000, decidedAt: new Date(), submittedAt: tenDaysAgo }
  );
  await Claim.updateOne({ _id: b._id }, { status: 'rejected', decidedAt: new Date(), submittedAt: tenDaysAgo });

  const res = await request(app).get('/api/analytics/summary').set(authHeader(admin));
  expect(res.status).toBe(200);
  expect(res.body.totals).toMatchObject({
    claims: 3,
    open: 1,
    amountClaimed: 35000,
    amountApproved: 8000,
    amountDisbursed: 8000,
    approvalRate: 50,
    avgDaysToDecision: 10,
  });
  expect(res.body.byCause).toEqual(
    expect.arrayContaining([
      { cause: 'flood', count: 2 },
      { cause: 'drought', count: 1 },
    ])
  );
  expect(res.body.monthly).toHaveLength(12);
  expect(res.body.monthly.reduce((sum, m) => sum + m.count, 0)).toBe(3);
});

test('officer workload lists open and overdue claims per officer', async () => {
  const admin = await createStaff('admin');
  const officer = await createStaff('officer', { district: 'Puri' });
  const farmer = await createFarmer();
  const claim = await fileClaim(farmer);
  await Claim.updateOne({ _id: claim._id }, { statusChangedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) });

  const res = await request(app).get('/api/analytics/officers').set(authHeader(admin));
  const row = res.body.officers.find((o) => o.officerId === String(officer._id));
  expect(row).toMatchObject({ open: 1, overdue: 1 });
});

test('farmers cannot see analytics', async () => {
  const farmer = await createFarmer();
  expect((await request(app).get('/api/analytics/summary').set(authHeader(farmer))).status).toBe(403);
});

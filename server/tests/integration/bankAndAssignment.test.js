// IFSC checks, crop amount limits, and assigning waiting claims to newly added officers.
const request = require('supertest');
const db = require('../helpers/db');
const app = require('../../src/app');
const Claim = require('../../src/models/Claim');
const { lookupIfsc } = require('../../src/services/ifsc.service');
const { createFarmer, createStaff, authHeader, claimFields } = require('../helpers/factory');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

function fileClaim(farmer, overrides) {
  let req = request(app).post('/api/claims').set(authHeader(farmer));
  for (const [k, v] of Object.entries(claimFields(overrides))) req = req.field(k, String(v));
  return req;
}

describe('IFSC check', () => {
  test('a known IFSC saves the official bank name and branch', async () => {
    const farmer = await createFarmer();
    const res = await fileClaim(farmer, { bankName: 'sbi' });
    expect(res.status).toBe(201);
    expect(res.body.claim.bank).toMatchObject({
      bankName: 'State Bank of India',
      branch: 'Main Branch, Puri',
      ifscVerified: true,
    });
  });

  test('an IFSC that does not exist is refused', async () => {
    const farmer = await createFarmer();
    const res = await fileClaim(farmer, { ifsc: 'XXXX0123456' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([expect.objectContaining({ field: 'ifsc' })]);
    expect(await Claim.countDocuments()).toBe(0);
  });

  test('if the IFSC service is down, the claim is still accepted but not marked verified', async () => {
    lookupIfsc.mockRejectedValueOnce(new Error('connect ETIMEDOUT'));
    const farmer = await createFarmer();
    const res = await fileClaim(farmer, { bankName: 'My Bank' });
    expect(res.status).toBe(201);
    expect(res.body.claim.bank).toMatchObject({ bankName: 'My Bank', ifscVerified: false });
  });

  test('lookup endpoint returns the branch, or 404 for an unknown code', async () => {
    const farmer = await createFarmer();
    const ok = await request(app).get('/api/ifsc/sbin0001234').set(authHeader(farmer));
    expect(ok.status).toBe(200);
    expect(ok.body.branch.bank).toBe('State Bank of India');

    const missing = await request(app).get('/api/ifsc/XXXX0123456').set(authHeader(farmer));
    expect(missing.status).toBe(404);

    const bad = await request(app).get('/api/ifsc/123').set(authHeader(farmer));
    expect(bad.status).toBe(400);
  });
});

describe('assigning waiting claims to a new officer', () => {
  test('claims filed before any officer existed go to the officer the admin adds', async () => {
    const admin = await createStaff('admin');
    const farmer = await createFarmer({ district: 'Bastar' });
    const filed = await fileClaim(farmer, { state: 'Chhattisgarh', district: 'Bastar' });
    expect(filed.body.claim.assignedOfficer).toBeNull();

    const res = await request(app).post('/api/users/staff').set(authHeader(admin)).send({
      name: 'Bastar Officer',
      email: 'bastar.officer@test.in',
      password: 'Password@123',
      role: 'officer',
      state: 'Chhattisgarh',
      district: 'bastar', // different letter case still matches
    });
    expect(res.status).toBe(201);
    expect(res.body.claimsAssigned).toBe(1);

    const claim = await Claim.findById(filed.body.claim._id);
    expect(String(claim.assignedOfficer)).toBe(res.body.user._id);
    expect(claim.statusHistory.at(-1).remark).toMatch(/Assigned to Bastar Officer/);
  });

  test('closed claims and claims in other districts are left alone', async () => {
    const admin = await createStaff('admin');
    const farmer = await createFarmer();
    const other = (await fileClaim(farmer, { district: 'Nalanda' })).body.claim;
    const closed = (await fileClaim(farmer, { district: 'Bastar' })).body.claim;
    await Claim.updateOne({ _id: closed._id }, { $set: { status: 'rejected' } });

    const officer = await createStaff('officer', { district: 'Nashik' });
    const res = await request(app).patch(`/api/users/${officer._id}`).set(authHeader(admin)).send({ district: 'Bastar' });
    expect(res.body.claimsAssigned).toBe(0);
    expect((await Claim.findById(other._id)).assignedOfficer).toBeNull();
  });
});

describe('crop amount limits (two-admin rule)', () => {
  const propose = (user, body) => request(app).post('/api/crop-limits/proposals').set(authHeader(user)).send(body);
  const decide = (user, id, action) => request(app).post(`/api/crop-limits/${id}/${action}`).set(authHeader(user));

  test('a limit only takes effect after a different admin approves it', async () => {
    const adminA = await createStaff('admin', { name: 'Admin A' });
    const adminB = await createStaff('admin', { name: 'Admin B' });
    const officer = await createStaff('officer', { district: 'Puri' });
    const farmer = await createFarmer();

    expect((await propose(officer, { crop: 'Paddy', maxPerAcre: 6000 })).status).toBe(403);

    const proposed = await propose(adminA, { crop: ' Paddy ', maxPerAcre: 6000 });
    expect(proposed.status).toBe(201);
    const id = proposed.body.limit._id;
    expect(proposed.body.limit).toMatchObject({ crop: 'paddy', maxPerAcre: null, pending: { maxPerAcre: 6000 } });

    // Only one pending change at a time
    expect((await propose(adminB, { crop: 'PADDY', maxPerAcre: 9000 })).status).toBe(409);

    // 25,000 for 2.5 acres = 10,000 per acre. Not approved yet, so no limit applies.
    const claim = (await fileClaim(farmer, { cropName: 'paddy', areaAcres: 2.5, amountClaimed: 25000 })).body.claim;
    const before = await request(app).get(`/api/claims/${claim._id}`).set(authHeader(officer));
    expect(before.body.amountCheck).toEqual({ crop: 'paddy', perAcre: 10000, limit: null });

    // The proposer cannot approve their own change
    const self = await decide(adminA, id, 'approve');
    expect(self.status).toBe(403);

    const approved = await decide(adminB, id, 'approve');
    expect(approved.status).toBe(200);
    expect(approved.body.limit).toMatchObject({ maxPerAcre: 6000 });
    expect(approved.body.limit.pending?.proposedBy).toBeUndefined();

    const detail = await request(app).get(`/api/claims/${claim._id}`).set(authHeader(officer));
    expect(detail.body.amountCheck).toEqual({
      crop: 'paddy',
      perAcre: 10000,
      limit: 6000,
      maxAllowed: 15000,
      ratio: 1.67,
      overLimit: true,
    });

    // Farmers never see the amount check
    const own = await request(app).get(`/api/claims/${claim._id}`).set(authHeader(farmer));
    expect(own.body.amountCheck).toBeUndefined();
  });

  test('raising a limit is recorded in the history, and a rejected change leaves the old limit', async () => {
    const adminA = await createStaff('admin', { name: 'Admin A' });
    const adminB = await createStaff('admin', { name: 'Admin B' });
    const officer = await createStaff('officer');

    const { _id: id } = (await propose(adminA, { crop: 'Paddy', maxPerAcre: 15000 })).body.limit;
    await decide(adminB, id, 'approve');

    // Admin A tries to raise it for a friend; Admin B rejects
    await propose(adminA, { crop: 'Paddy', maxPerAcre: 20000 });
    const rejected = await decide(adminB, id, 'reject');
    expect(rejected.body.limit.maxPerAcre).toBe(15000);

    const { body } = await request(app).get('/api/crop-limits/history').set(authHeader(officer));
    expect(body.history.map((h) => [h.action, h.oldValue, h.newValue, h.byName])).toEqual([
      ['rejected', 15000, 20000, 'Admin B'],
      ['proposed', 15000, 20000, 'Admin A'],
      ['approved', null, 15000, 'Admin B'],
      ['proposed', null, 15000, 'Admin A'],
    ]);
  });

  test('removing a limit also needs a second admin; the proposer can cancel their own proposal', async () => {
    const adminA = await createStaff('admin');
    const adminB = await createStaff('admin');
    const { _id: id } = (await propose(adminA, { crop: 'Wheat', maxPerAcre: 12000 })).body.limit;
    await decide(adminB, id, 'approve');

    await propose(adminA, { crop: 'Wheat', remove: true });
    expect((await decide(adminA, id, 'reject')).body.limit.maxPerAcre).toBe(12000); // cancelled

    await propose(adminB, { crop: 'Wheat', remove: true });
    expect((await decide(adminA, id, 'approve')).body.limit).toBeNull();
    const list = await request(app).get('/api/crop-limits').set(authHeader(adminA));
    expect(list.body.limits).toHaveLength(0);
  });

  test('a crop without a limit just shows the per-acre amount', async () => {
    const officer = await createStaff('officer', { district: 'Puri' });
    const farmer = await createFarmer();
    const claim = (await fileClaim(farmer, { cropName: 'Maize', areaAcres: 2, amountClaimed: 9000 })).body.claim;
    const detail = await request(app).get(`/api/claims/${claim._id}`).set(authHeader(officer));
    expect(detail.body.amountCheck).toEqual({ crop: 'Maize', perAcre: 4500, limit: null });
  });
});

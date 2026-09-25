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

describe('crop amount limits', () => {
  test('only admins can set limits; officers see an over-limit warning on the claim', async () => {
    const admin = await createStaff('admin');
    const officer = await createStaff('officer', { district: 'Puri' });
    const farmer = await createFarmer();

    const denied = await request(app).put('/api/crop-limits').set(authHeader(officer)).send({ crop: 'Paddy', maxPerAcre: 8000 });
    expect(denied.status).toBe(403);

    const set = await request(app).put('/api/crop-limits').set(authHeader(admin)).send({ crop: ' Paddy ', maxPerAcre: 8000 });
    expect(set.status).toBe(200);
    expect(set.body.limit.crop).toBe('paddy');

    // Updating the same crop replaces the limit instead of adding a duplicate
    await request(app).put('/api/crop-limits').set(authHeader(admin)).send({ crop: 'PADDY', maxPerAcre: 6000 });
    const list = await request(app).get('/api/crop-limits').set(authHeader(officer));
    expect(list.body.limits).toHaveLength(1);
    expect(list.body.limits[0].maxPerAcre).toBe(6000);

    // 25,000 for 2.5 acres = 10,000 per acre, limit 6,000 -> over by 1.67x
    const claim = (await fileClaim(farmer, { cropName: 'paddy', areaAcres: 2.5, amountClaimed: 25000 })).body.claim;
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

  test('a crop without a limit just shows the per-acre amount', async () => {
    const officer = await createStaff('officer', { district: 'Puri' });
    const farmer = await createFarmer();
    const claim = (await fileClaim(farmer, { cropName: 'Maize', areaAcres: 2, amountClaimed: 9000 })).body.claim;
    const detail = await request(app).get(`/api/claims/${claim._id}`).set(authHeader(officer));
    expect(detail.body.amountCheck).toEqual({ crop: 'Maize', perAcre: 4500, limit: null });
  });
});

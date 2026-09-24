const request = require('supertest');
const db = require('../helpers/db');
const app = require('../../src/app');
const Claim = require('../../src/models/Claim');
const Notification = require('../../src/models/Notification');
const { createFarmer, createStaff, authHeader, claimFields } = require('../helpers/factory');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

// A tiny valid PNG header followed by filler bytes
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

function fileClaim(farmer, fields = claimFields(), photos = []) {
  let req = request(app).post('/api/claims').set(authHeader(farmer));
  for (const [key, value] of Object.entries(fields)) req = req.field(key, String(value));
  for (const photo of photos) req = req.attach('photos', photo.buffer, { filename: photo.name, contentType: photo.type });
  return req;
}

describe('filing a claim', () => {
  test('creates a claim, assigns the district officer and sends an SMS', async () => {
    const officer = await createStaff('officer', { district: 'Puri' });
    const farmer = await createFarmer();

    const res = await fileClaim(farmer);
    expect(res.status).toBe(201);
    const { claim } = res.body;
    expect(claim.claimNumber).toMatch(/^KS-\d{4}-000001$/);
    expect(claim.status).toBe('submitted');
    expect(claim.assignedOfficer).toBe(String(officer._id));
    expect(claim.bank.accountNumber).toBeUndefined();
    expect(claim.bank.accountLast4).toBe('9012');

    const sms = await Notification.find({ claim: claim._id });
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ type: 'status_update', status: 'logged' });
  });

  test('picks the officer with fewer open claims', async () => {
    await createStaff('officer', { district: 'Puri', name: 'Officer A' });
    await createStaff('officer', { district: 'Puri', name: 'Officer B' });
    const farmer = await createFarmer();

    const first = (await fileClaim(farmer)).body.claim;
    const second = (await fileClaim(farmer)).body.claim;
    // The first officer now has 1 open claim, so the second claim goes to the other officer
    expect(second.assignedOfficer).not.toBe(first.assignedOfficer);
  });

  test('validates the form', async () => {
    const farmer = await createFarmer();
    const res = await fileClaim(farmer, claimFields({ ifsc: 'BAD', lossDate: '2020-01-01', amountClaimed: 0 }));
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['ifsc', 'lossDate', 'amountClaimed']));
  });

  test('officers cannot file claims', async () => {
    const officer = await createStaff('officer');
    expect((await fileClaim(officer)).status).toBe(403);
  });

  test('stores photos and only shows them to people who can see the claim', async () => {
    const farmer = await createFarmer();
    const stranger = await createFarmer();
    const res = await fileClaim(farmer, claimFields(), [{ buffer: PNG, name: 'field.png', type: 'image/png' }]);
    expect(res.status).toBe(201);
    const { fileId } = res.body.claim.photos[0];

    const own = await request(app).get(`/api/files/${fileId}`).set(authHeader(farmer));
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/png');

    expect((await request(app).get(`/api/files/${fileId}`).set(authHeader(stranger))).status).toBe(404);
  });

  test('rejects files that are not really images', async () => {
    const farmer = await createFarmer();
    const res = await fileClaim(farmer, claimFields(), [{ buffer: Buffer.from('hello world, not an image'), name: 'x.png', type: 'image/png' }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });
});

describe('who can see which claims', () => {
  test('farmers only see their own claims', async () => {
    const a = await createFarmer();
    const b = await createFarmer();
    const { body } = await fileClaim(a);

    const list = await request(app).get('/api/claims').set(authHeader(b));
    expect(list.body.total).toBe(0);
    expect((await request(app).get(`/api/claims/${body.claim._id}`).set(authHeader(b))).status).toBe(404);
    expect((await request(app).get(`/api/claims/${body.claim._id}`).set(authHeader(a))).status).toBe(200);
  });

  test('officers see assigned claims but not other districts', async () => {
    const puriOfficer = await createStaff('officer', { district: 'Puri' });
    const cuttackOfficer = await createStaff('officer', { district: 'Cuttack' });
    const farmer = await createFarmer();
    await fileClaim(farmer);

    expect((await request(app).get('/api/claims').set(authHeader(puriOfficer))).body.total).toBe(1);
    expect((await request(app).get('/api/claims').set(authHeader(cuttackOfficer))).body.total).toBe(0);
  });
});

describe('status changes', () => {
  async function setup() {
    const officer = await createStaff('officer', { district: 'Puri' });
    const admin = await createStaff('admin');
    const farmer = await createFarmer({ language: 'hi' });
    const { body } = await fileClaim(farmer);
    const patch = (user, data) => request(app).patch(`/api/claims/${body.claim._id}/status`).set(authHeader(user)).send(data);
    return { officer, admin, farmer, claimId: body.claim._id, patch };
  }

  test('full lifecycle with SMS at every step', async () => {
    const { officer, admin, claimId, patch } = await setup();
    expect((await patch(officer, { to: 'under_review' })).status).toBe(200);
    expect((await patch(officer, { to: 'field_verification', remark: 'Visit on Monday' })).status).toBe(200);
    expect((await patch(officer, { to: 'approved', amountApproved: 20000 })).body.claim.status).toBe('approved');
    expect((await patch(officer, { to: 'disbursed' })).status).toBe(403); // officers can't disburse
    expect((await patch(admin, { to: 'disbursed' })).body.claim.status).toBe('disbursed');

    const claim = await Claim.findById(claimId);
    expect(claim.statusHistory.map((h) => h.to)).toEqual(['submitted', 'under_review', 'field_verification', 'approved', 'disbursed']);

    const sms = await Notification.find({ claim: claimId }).sort({ createdAt: 1 });
    expect(sms).toHaveLength(5);
    expect(sms[4].body).toMatch(/आपके बैंक खाते/); // farmer chose Hindi
  });

  test('invalid moves are refused', async () => {
    const { officer, patch } = await setup();
    const res = await patch(officer, { to: 'approved', amountApproved: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  test('farmers cannot change status', async () => {
    const { farmer, patch } = await setup();
    expect((await patch(farmer, { to: 'under_review' })).status).toBe(403);
  });

  test('bulk update reports each claim separately', async () => {
    const { officer, farmer, claimId } = await setup();
    const second = (await fileClaim(farmer)).body.claim._id;
    await Claim.updateOne({ _id: second }, { status: 'rejected' });

    const res = await request(app)
      .post('/api/claims/bulk/status')
      .set(authHeader(officer))
      .send({ ids: [claimId, second], to: 'under_review' });
    expect(res.body.updated).toBe(1);
    expect(res.body.results.find((r) => r.id === second).ok).toBe(false);
  });
});

describe('filters and overdue claims', () => {
  test('finds overdue claims', async () => {
    const admin = await createStaff('admin');
    const farmer = await createFarmer();
    const { body } = await fileClaim(farmer);
    await Claim.updateOne({ _id: body.claim._id }, { statusChangedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) });
    await fileClaim(farmer);

    const res = await request(app).get('/api/claims?overdue=true').set(authHeader(admin));
    expect(res.body.total).toBe(1);
    expect(res.body.claims[0].isOverdue).toBe(true);
  });

  test('searches by claim number or farmer name', async () => {
    const admin = await createStaff('admin');
    const farmer = await createFarmer({ name: 'Sukanti Behera' });
    await fileClaim(farmer);
    expect((await request(app).get('/api/claims?q=sukanti').set(authHeader(admin))).body.total).toBe(1);
    expect((await request(app).get('/api/claims?q=nobody').set(authHeader(admin))).body.total).toBe(0);
  });
});

describe('public tracking', () => {
  test('needs the claim number and last 4 digits of the phone', async () => {
    const farmer = await createFarmer();
    const { body } = await fileClaim(farmer);
    const last4 = farmer.phone.slice(-4);

    const ok = await request(app).get(`/api/public/track?claimNumber=${body.claim.claimNumber.toLowerCase()}&phoneLast4=${last4}`);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('submitted');
    expect(ok.body.farmerPhone).toBeUndefined();

    const wrong = await request(app).get(`/api/public/track?claimNumber=${body.claim.claimNumber}&phoneLast4=0000`);
    expect(wrong.status).toBe(404);
  });
});

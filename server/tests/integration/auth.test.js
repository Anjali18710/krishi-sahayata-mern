const request = require('supertest');
const db = require('../helpers/db');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Otp = require('../../src/models/Otp');
const { createStaff } = require('../helpers/factory');

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.close);

const register = {
  phone: '98765 43210',
  purpose: 'register',
  name: 'Ramesh Sahu',
  state: 'Odisha',
  district: 'Puri',
  language: 'hi',
};

async function requestOtp(body) {
  const res = await request(app).post('/api/auth/otp/request').send(body);
  return res;
}

describe('farmer OTP registration and login', () => {
  test('registers a new farmer with a valid OTP', async () => {
    const otpRes = await requestOtp({ phone: register.phone, purpose: 'register' });
    expect(otpRes.status).toBe(200);
    // In tests Twilio is not configured, so the API returns the OTP (devOtp)
    expect(otpRes.body.devOtp).toMatch(/^\d{6}$/);

    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ ...register, code: otpRes.body.devOtp });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toMatchObject({ name: 'Ramesh Sahu', phone: '+919876543210', role: 'farmer', language: 'hi' });
  });

  test('stores only a hash of the OTP', async () => {
    const otpRes = await requestOtp({ phone: register.phone, purpose: 'register' });
    const stored = await Otp.findOne({ phone: '+919876543210' });
    expect(stored.codeHash).not.toContain(otpRes.body.devOtp);
  });

  test('wrong OTP is rejected and counted', async () => {
    await requestOtp({ phone: register.phone, purpose: 'register' });
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ ...register, code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_INVALID');
    expect((await Otp.findOne({ phone: '+919876543210' })).attempts).toBe(1);
  });

  test('an OTP can be used only once', async () => {
    const { body } = await requestOtp({ phone: register.phone, purpose: 'register' });
    await request(app)
      .post('/api/auth/otp/verify')
      .send({ ...register, code: body.devOtp })
      .expect(201);
    const again = await request(app)
      .post('/api/auth/otp/verify')
      .send({ ...register, code: body.devOtp });
    expect(again.body.code).toBe('OTP_EXPIRED');
  });

  test('cannot request two OTPs within the cooldown', async () => {
    await requestOtp({ phone: register.phone, purpose: 'register' }).then((r) => expect(r.status).toBe(200));
    const second = await requestOtp({ phone: register.phone, purpose: 'register' });
    expect(second.status).toBe(429);
  });

  test('login requires an existing farmer, register requires a new number', async () => {
    const login = await requestOtp({ phone: '9123456789', purpose: 'login' });
    expect(login.status).toBe(404);

    await User.create({ name: 'Existing', phone: '+919123456789' });
    const reg = await requestOtp({ phone: '9123456789', purpose: 'register' });
    expect(reg.status).toBe(409);
  });

  test('demo accounts get the OTP on screen and are never sent a real SMS', async () => {
    await User.create({ name: 'Demo Farmer', phone: '+919999900001', isDemo: true });
    const res = await requestOtp({ phone: '9999900001', purpose: 'login' });
    expect(res.status).toBe(200);
    expect(res.body.devOtp).toMatch(/^\d{6}$/);
    const sms = await require('../../src/models/Notification').findOne({ to: '+919999900001' });
    expect(sms.status).toBe('logged');
    expect(sms.body).not.toContain(res.body.devOtp); // the code itself is never stored
  });

  test('rejects invalid phone numbers and injection attempts', async () => {
    expect((await requestOtp({ phone: '12345', purpose: 'login' })).status).toBe(400);
    expect((await requestOtp({ phone: { $ne: null }, purpose: 'login' })).status).toBe(400);
  });
});

describe('staff login', () => {
  test('logs in with the right password only', async () => {
    const officer = await createStaff('officer');
    const ok = await request(app).post('/api/auth/staff/login').send({ email: officer.email, password: 'Password@123' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.passwordHash).toBeUndefined();

    const bad = await request(app).post('/api/auth/staff/login').send({ email: officer.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  test('disabled accounts cannot log in', async () => {
    const officer = await createStaff('officer', { isActive: false });
    const res = await request(app).post('/api/auth/staff/login').send({ email: officer.email, password: 'Password@123' });
    expect(res.status).toBe(403);
  });
});

describe('protected routes', () => {
  test('need a valid token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-token')).status).toBe(401);
  });

  test('admin-only routes reject officers', async () => {
    const officer = await createStaff('officer');
    const { body } = await request(app).post('/api/auth/staff/login').send({ email: officer.email, password: 'Password@123' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(403);
  });
});

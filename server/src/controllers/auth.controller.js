const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { normalizeIndianPhone } = require('../utils/phone');
const { issueOtp, verifyOtp, OTP_TTL_MINUTES } = require('../services/otp.service');
const { signToken } = require('../middleware/auth');
const { aiEnabled } = require('../services/ai.service');
const { ROLES } = require('../constants');

function parsePhone(raw) {
  const phone = normalizeIndianPhone(raw);
  if (!phone) throw ApiError.badRequest('Enter a valid 10-digit Indian mobile number', 'INVALID_PHONE');
  return phone;
}

function authResponse(user) {
  return { token: signToken(user), user };
}

// POST /api/auth/otp/request   { phone, purpose: "login" | "register", language? }
async function requestOtp(req, res) {
  const phone = parsePhone(req.body.phone);
  const { purpose } = req.body;
  const existing = await User.findOne({ phone });

  if (purpose === 'login' && (!existing || existing.role !== ROLES.FARMER)) {
    throw ApiError.notFound('No farmer account with this number. Please register first.', 'USER_NOT_FOUND');
  }
  if (purpose === 'register' && existing) {
    throw ApiError.conflict('This number is already registered. Please log in.', 'ALREADY_REGISTERED');
  }
  if (existing && !existing.isActive) throw ApiError.forbidden('This account has been disabled');

  const language = existing?.language || req.body.language || 'en';
  // Demo mode and seeded demo accounts: the OTP is shown on screen instead of being texted
  const simulate = env.demoMode || Boolean(existing?.isDemo);
  const { code } = await issueOtp(phone, purpose, language, { simulate });

  const response = { message: 'OTP sent', expiresInMinutes: OTP_TTL_MINUTES };
  // Only for demo mode, demo accounts, or local development without Twilio - see config/env.js
  if (env.exposeOtp || simulate) response.devOtp = code;
  res.json(response);
}

// POST /api/auth/otp/verify
//   login:    { phone, code, purpose: "login" }
//   register: { phone, code, purpose: "register", name, state, district, village?, language? }
async function verifyOtpAndLogin(req, res) {
  const phone = parsePhone(req.body.phone);
  const { purpose, code } = req.body;

  await verifyOtp(phone, purpose, code);

  let user;
  if (purpose === 'register') {
    const { name, state, district, village, language } = req.body;
    user = await User.create({ name, phone, state, district, village, language, role: ROLES.FARMER });
  } else {
    user = await User.findOne({ phone, role: ROLES.FARMER });
    if (!user) throw ApiError.notFound('Account not found', 'USER_NOT_FOUND');
  }

  user.lastLoginAt = new Date();
  await user.save();
  res.status(purpose === 'register' ? 201 : 200).json(authResponse(user));
}

// POST /api/auth/staff/login   { email, password }  (officers and admins)
async function staffLogin(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');

  // Same message whether the email or the password is wrong, so attackers
  // can't find out which emails exist.
  const ok = user && user.role !== ROLES.FARMER && (await user.checkPassword(password));
  if (!ok) throw ApiError.unauthorized('Incorrect email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  user.lastLoginAt = new Date();
  await user.save();
  res.json(authResponse(user));
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user });
}

// PATCH /api/auth/me   { name?, village?, language?, farmLocation? }
async function updateMe(req, res) {
  const allowed = ['name', 'village', 'language', 'farmLocation'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) req.user[key] = req.body[key];
  }
  await req.user.save();
  res.json({ user: req.user });
}

// GET /api/auth/config - tells the frontend whether demo mode is on
function publicConfig(req, res) {
  res.json({ demoMode: env.demoMode, smsEnabled: env.smsEnabled, aiEnabled: aiEnabled() });
}

module.exports = { requestOtp, verifyOtpAndLogin, staffLogin, me, updateMe, publicConfig };

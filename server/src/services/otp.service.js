// Creates and checks 6-digit one-time passwords sent by SMS.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Otp = require('../models/Otp');
const ApiError = require('../utils/ApiError');
const { sendSms } = require('./sms.service');

const OTP_TTL_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 5;

const MESSAGES = {
  en: (code) =>
    `Your Krishi Sahayata OTP is ${code}. It is valid for ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.`,
  hi: (code) =>
    `आपका कृषि सहायता OTP ${code} है। यह ${OTP_TTL_MINUTES} मिनट तक मान्य है। इसे किसी के साथ साझा न करें।`,
};

/**
 * Generate an OTP, store its hash and send it by SMS.
 * Returns { code, notification } - the code is only used by the caller
 * in demo/development mode (see auth.controller.js).
 */
async function issueOtp(phone, purpose, language = 'en', { simulate = false } = {}) {
  const latest = await Otp.findOne({ phone, purpose }).sort({ createdAt: -1 });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    throw new ApiError(429, `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before asking for a new OTP`, 'OTP_COOLDOWN');
  }

  // crypto.randomInt is cryptographically secure, unlike Math.random
  const code = String(crypto.randomInt(100000, 1000000));
  await Otp.deleteMany({ phone, purpose });
  await Otp.create({
    phone,
    purpose,
    codeHash: await bcrypt.hash(code, 8),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });

  const body = (MESSAGES[language] || MESSAGES.en)(code);
  const notification = await sendSms({
    to: phone,
    body,
    type: 'otp',
    logBody: body.replace(code, '******'),
    simulate,
  });

  if (notification.status === 'failed') {
    throw new ApiError(502, 'Could not send the OTP SMS. Please try again later.', 'SMS_FAILED');
  }
  return { code, notification };
}

/** Throws an ApiError if the code is wrong or expired; deletes the OTP when it is correct. */
async function verifyOtp(phone, purpose, code) {
  const otp = await Otp.findOne({ phone, purpose }).sort({ createdAt: -1 });

  if (!otp || otp.expiresAt < new Date()) {
    throw ApiError.badRequest('OTP has expired. Please request a new one.', 'OTP_EXPIRED');
  }
  if (otp.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw new ApiError(429, 'Too many wrong attempts. Please request a new OTP.', 'OTP_LOCKED');
  }

  const ok = await bcrypt.compare(String(code), otp.codeHash);
  if (!ok) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest('Incorrect OTP', 'OTP_INVALID');
  }

  await Otp.deleteOne({ _id: otp._id });
}

module.exports = { issueOtp, verifyOtp, OTP_TTL_MINUTES };

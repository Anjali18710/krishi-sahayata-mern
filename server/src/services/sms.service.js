// Sends SMS through Twilio and records every attempt in the Notification collection.
//
// If Twilio keys are not set in .env, messages are printed to the terminal instead
// (status "logged"), so the whole app still works on a laptop without a Twilio account.
const twilio = require('twilio');
const env = require('../config/env');
const Notification = require('../models/Notification');

const MAX_ATTEMPTS = 3;

let client = null;
function getClient() {
  if (!client) client = twilio(env.twilio.accountSid, env.twilio.authToken);
  return client;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Twilio errors with these HTTP statuses will never succeed on retry
// (e.g. 400 = invalid "to" number, or an unverified number on a trial account).
function isPermanentFailure(err) {
  return err && err.status >= 400 && err.status < 500 && err.status !== 429;
}

/**
 * Send one SMS. Never throws: SMS problems must not break the main request
 * (e.g. a claim status change should still be saved if the SMS fails).
 * The returned Notification document tells the caller what happened.
 *
 * @param {object} opts
 * @param {string} opts.to        phone number in +91XXXXXXXXXX format
 * @param {string} opts.body      message text
 * @param {string} opts.type      'otp' | 'status_update' | 'weather_alert'
 * @param {string} [opts.userId]
 * @param {string} [opts.claimId]
 * @param {string} [opts.logBody] text saved in the database instead of body (used to hide OTP codes)
 */
async function sendSms({ to, body, type, userId, claimId, logBody }) {
  const notification = await Notification.create({
    to,
    body: logBody || body,
    type,
    user: userId,
    claim: claimId,
  });

  if (!env.smsEnabled) {
    if (!env.isTest) console.log(`\n[SMS - Twilio not configured] To ${to}:\n${body}\n`);
    notification.status = 'logged';
    await notification.save();
    return notification;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    notification.attempts = attempt;
    try {
      const message = await getClient().messages.create({
        to,
        from: env.twilio.fromNumber,
        body,
      });
      notification.status = 'sent';
      notification.providerMessageId = message.sid;
      notification.error = undefined;
      break;
    } catch (err) {
      notification.status = 'failed';
      notification.error = err.message;
      if (isPermanentFailure(err) || attempt === MAX_ATTEMPTS) break;
      await wait(500 * 2 ** (attempt - 1)); // 0.5s, then 1s
    }
  }

  await notification.save();
  if (notification.status === 'failed') {
    console.error(`SMS to ${to} failed after ${notification.attempts} attempt(s): ${notification.error}`);
  }
  return notification;
}

module.exports = { sendSms };

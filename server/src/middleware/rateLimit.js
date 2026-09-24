const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

// Limits how often one IP address can hit sensitive endpoints,
// e.g. to stop someone from spamming OTP SMS (which cost money) or guessing claim numbers.
function limiter(max, windowMinutes) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
  });
}

module.exports = {
  otpLimiter: limiter(10, 15), // 10 OTP requests per 15 minutes
  loginLimiter: limiter(20, 15),
  publicLimiter: limiter(60, 15),
};

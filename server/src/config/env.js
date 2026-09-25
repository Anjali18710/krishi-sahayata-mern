// Loads environment variables from server/.env and exposes them in one place.
// Every other file imports settings from here instead of reading process.env directly,
// so it is easy to see which settings the app depends on.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/krishi-sahayata',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Comma-separated list of frontend URLs allowed to call this API (CORS)
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },

  ai: {
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  },

  // A claim that has not moved to a new status within this many days is "overdue"
  slaDays: Number(process.env.SLA_DAYS) || 7,

  // Daily weather-alert job (cron syntax, Indian time). Set to "off" to disable.
  weatherAlertCron: process.env.WEATHER_ALERT_CRON || '0 6 * * *',
};

env.isTest = env.nodeEnv === 'test';
env.isProduction = env.nodeEnv === 'production';
env.smsEnabled = Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.fromNumber);

// DEMO_MODE=true shows the OTP on screen, so recruiters can try the deployed app
// without receiving an SMS (a Twilio trial can only text numbers you have verified).
env.demoMode = process.env.DEMO_MODE === 'true';
// When the OTP may be returned in the API response: demo mode, or local development without Twilio.
env.exposeOtp = env.demoMode || (!env.isProduction && !env.smsEnabled);

if (!env.jwtSecret) {
  if (env.isProduction) {
    throw new Error('JWT_SECRET must be set in production');
  }
  env.jwtSecret = 'dev-only-secret-change-me';
}

module.exports = env;

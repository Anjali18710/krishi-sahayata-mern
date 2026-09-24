const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, LANGUAGES } = require('../constants');

// One collection for all three kinds of users.
// - Farmers log in with their phone number + OTP (no password).
// - Officers and admins log in with email + password.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.FARMER },

    // Stored as +91XXXXXXXXXX. "sparse" lets staff accounts have no phone.
    phone: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    // select: false = never returned by queries unless explicitly asked for
    passwordHash: { type: String, select: false },

    state: { type: String, trim: true },
    district: { type: String, trim: true },
    village: { type: String, trim: true },

    // Language for SMS and the default UI language
    language: { type: String, enum: LANGUAGES, default: 'en' },

    // Farm location used for weather forecasts and alerts
    farmLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      label: { type: String, trim: true },
    },

    isActive: { type: Boolean, default: true },
    // Accounts created by the seed script. Their phone numbers are made up,
    // so the app never sends them real SMS (messages are only logged).
    isDemo: { type: Boolean, default: false },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1, district: 1 });

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.checkPassword = function checkPassword(plain) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

// Remove secrets whenever a user is converted to JSON for an API response.
userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);

const mongoose = require('mongoose');

// A one-time password waiting to be verified.
// Only a bcrypt hash of the code is stored, never the code itself.
const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    purpose: { type: String, enum: ['login', 'register'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpSchema.index({ phone: 1, purpose: 1 });
// TTL index: MongoDB deletes the document automatically once expiresAt has passed.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);

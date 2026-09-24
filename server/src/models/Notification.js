const mongoose = require('mongoose');

// One document per SMS the app tries to send. This gives a delivery log:
// what was sent, to whom, whether Twilio accepted it, and why it failed if it did.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    claim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },
    type: {
      type: String,
      enum: ['otp', 'status_update', 'weather_alert'],
      required: true,
    },
    to: { type: String, required: true },
    // OTP messages are never stored in full - see sms.service.js
    body: { type: String, required: true },
    // pending -> sent | failed. "logged" = Twilio not configured, message printed to the terminal instead.
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'logged'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    providerMessageId: String, // Twilio's message SID
    error: String,
  },
  { timestamps: true }
);

notificationSchema.index({ claim: 1, createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

const mongoose = require('mongoose');

// Maximum payout per acre for a crop, used only to warn officers when a claim looks too high.
//
// Two-person rule: an admin can only PROPOSE a new value (or removal). It takes effect when a
// DIFFERENT admin approves it, so no single person can quietly raise a limit for a friend's claim.
// Every step is written to CropLimitHistory, which the app never edits or deletes.
const cropLimitSchema = new mongoose.Schema(
  {
    // Stored in lower case so "Paddy", "paddy" and " PADDY " all match the same limit
    crop: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 60 },
    // The limit in force right now; null until the first proposal is approved
    maxPerAcre: { type: Number, min: 1, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    // A change waiting for a second admin (at most one at a time)
    pending: {
      maxPerAcre: { type: Number, min: 1 }, // new value (not set when the proposal is to remove the limit)
      remove: Boolean,
      proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      proposedByName: String,
      proposedAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CropLimit', cropLimitSchema);

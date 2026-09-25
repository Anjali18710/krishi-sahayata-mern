const mongoose = require('mongoose');

// Maximum payout per acre for a crop, entered by an admin.
// Used only to warn officers when a claim looks too high - it never rejects a claim by itself.
const cropLimitSchema = new mongoose.Schema(
  {
    // Stored in lower case so "Paddy", "paddy" and " PADDY " all match the same limit
    crop: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 60 },
    maxPerAcre: { type: Number, required: true, min: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CropLimit', cropLimitSchema);

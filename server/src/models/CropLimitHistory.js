const mongoose = require('mongoose');

// Permanent record of every crop-limit proposal, approval, rejection and cancellation.
// There is no API to change or delete these entries.
const cropLimitHistorySchema = new mongoose.Schema({
  crop: { type: String, required: true },
  action: { type: String, enum: ['proposed', 'approved', 'rejected', 'cancelled'], required: true },
  oldValue: { type: Number, default: null }, // limit in force before (null = no limit)
  newValue: { type: Number, default: null }, // proposed / resulting limit (null = remove the limit)
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  byName: { type: String, required: true },
  at: { type: Date, default: Date.now },
});

cropLimitHistorySchema.index({ at: -1 });

module.exports = mongoose.model('CropLimitHistory', cropLimitHistorySchema);

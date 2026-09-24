const mongoose = require('mongoose');
const env = require('../config/env');
const { CAUSES_OF_LOSS, SEASONS, ROLES } = require('../constants');
const { ALL_STATUSES, OPEN_STATUSES, STATUS } = require('../services/claimWorkflow');

const { ObjectId } = mongoose.Schema.Types;

// One entry per status change - this is the claim's timeline / audit trail.
const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String, enum: [...ALL_STATUSES, null] },
    to: { type: String, enum: ALL_STATUSES, required: true },
    by: { type: ObjectId, ref: 'User' },
    byName: String,
    byRole: { type: String, enum: Object.values(ROLES) },
    remark: { type: String, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const photoSchema = new mongoose.Schema(
  {
    fileId: { type: ObjectId, required: true }, // id of the file in GridFS
    filename: String,
    contentType: String,
    size: Number,
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    claimNumber: { type: String, required: true, unique: true }, // e.g. KS-2026-000042

    farmer: { type: ObjectId, ref: 'User', required: true },
    // Copies of the farmer's name/phone so the dashboard can search and show them without extra lookups
    farmerName: { type: String, required: true },
    farmerPhone: { type: String, required: true },

    crop: {
      name: { type: String, required: true, trim: true, maxlength: 60 },
      season: { type: String, enum: SEASONS, required: true },
      areaAcres: { type: Number, required: true, min: 0.01, max: 1000 },
    },

    causeOfLoss: { type: String, enum: CAUSES_OF_LOSS, required: true },
    lossDate: { type: Date, required: true },
    description: { type: String, trim: true, maxlength: 1000 },

    amountClaimed: { type: Number, required: true, min: 1 },
    amountApproved: { type: Number, min: 0 },

    location: {
      state: { type: String, required: true, trim: true },
      district: { type: String, required: true, trim: true },
      village: { type: String, trim: true },
      latitude: { type: Number, required: true, min: -90, max: 90 },
      longitude: { type: Number, required: true, min: -180, max: 180 },
    },

    bank: {
      accountHolderName: { type: String, required: true, trim: true },
      bankName: { type: String, required: true, trim: true },
      ifsc: { type: String, required: true, uppercase: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
      // Full account number is never sent to the browser (select: false);
      // the UI only shows the last 4 digits.
      accountNumber: { type: String, required: true, select: false },
      accountLast4: { type: String, required: true },
    },

    photos: { type: [photoSchema], default: [] },

    status: { type: String, enum: ALL_STATUSES, default: STATUS.SUBMITTED },
    statusChangedAt: { type: Date, default: Date.now },
    statusHistory: { type: [statusHistorySchema], default: [] },
    assignedOfficer: { type: ObjectId, ref: 'User', default: null },

    submittedAt: { type: Date, default: Date.now },
    decidedAt: Date, // when approved or rejected
    disbursedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Indexes for the queries the dashboards run most often
claimSchema.index({ farmer: 1, createdAt: -1 });
claimSchema.index({ assignedOfficer: 1, status: 1 });
claimSchema.index({ 'location.district': 1, status: 1 });
claimSchema.index({ status: 1, statusChangedAt: 1 });

// "Overdue" = still open and no status change for more than SLA_DAYS days.
// A virtual is computed on the fly and not stored in the database.
claimSchema.virtual('isOverdue').get(function isOverdue() {
  if (!OPEN_STATUSES.includes(this.status) || !this.statusChangedAt) return false;
  const ageMs = Date.now() - this.statusChangedAt.getTime();
  return ageMs > env.slaDays * 24 * 60 * 60 * 1000;
});

claimSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    if (ret.bank) delete ret.bank.accountNumber;
    delete ret.__v;
    delete ret.id; // duplicate of _id added by virtuals
    return ret;
  },
});

module.exports = mongoose.model('Claim', claimSchema);

const mongoose = require('mongoose');
const Claim = require('../models/Claim');
const User = require('../models/User');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { nextSequence } = require('../models/Counter');
const { ROLES } = require('../constants');
const { STATUS, OPEN_STATUSES, applyTransition } = require('../services/claimWorkflow');
const { notifyStatusChange } = require('../services/claimNotifications');
const { pickOfficerForDistrict } = require('../services/assignment.service');
const { deleteFile } = require('../services/storage.service');
const { runWeatherCheck, runWeatherCheckInBackground } = require('../services/weatherCheck.service');

// ---------- helpers ----------

// Which claims a user is allowed to see, as a MongoDB filter.
function scopeFilter(user) {
  if (user.role === ROLES.ADMIN) return {};
  if (user.role === ROLES.FARMER) return { farmer: user._id };
  // Officers: claims assigned to them + unassigned claims in their district
  return {
    $or: [{ assignedOfficer: user._id }, { 'location.district': user.district, assignedOfficer: null }],
  };
}

function canView(user, claim) {
  if (user.role === ROLES.ADMIN) return true;
  if (user.role === ROLES.FARMER) return claim.farmer.equals(user._id);
  const assignedId = claim.assignedOfficer?._id || claim.assignedOfficer;
  if (assignedId) return assignedId.equals(user._id);
  return claim.location.district === user.district;
}

async function findClaimForUser(id, user) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Claim not found');
  const claim = await Claim.findById(id);
  // 404 (not 403) so users can't discover which claim ids exist
  if (!claim || !canView(user, claim)) throw ApiError.notFound('Claim not found');
  return claim;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- controllers ----------

// POST /api/claims  (farmer)
async function createClaim(req, res) {
  const b = req.body;
  const farmer = req.user;

  const year = new Date().getFullYear();
  const seq = await nextSequence(`claim-${year}`);
  const claimNumber = `KS-${year}-${String(seq).padStart(6, '0')}`;

  const officer = await pickOfficerForDistrict(b.district);

  const claim = new Claim({
    claimNumber,
    farmer: farmer._id,
    farmerName: farmer.name,
    farmerPhone: farmer.phone,
    crop: { name: b.cropName, season: b.season, areaAcres: b.areaAcres },
    causeOfLoss: b.causeOfLoss,
    lossDate: b.lossDate,
    description: b.description,
    amountClaimed: b.amountClaimed,
    location: {
      state: b.state,
      district: b.district,
      village: b.village,
      latitude: b.latitude,
      longitude: b.longitude,
    },
    bank: {
      accountHolderName: b.accountHolderName,
      bankName: b.bankName,
      ifsc: b.ifsc,
      accountNumber: b.accountNumber,
      accountLast4: String(b.accountNumber).slice(-4),
    },
    photos: req.uploadedPhotos || [],
    assignedOfficer: officer?._id || null,
    statusHistory: [
      {
        from: null,
        to: STATUS.SUBMITTED,
        by: farmer._id,
        byName: farmer.name,
        byRole: farmer.role,
        remark: officer ? `Auto-assigned to ${officer.name}` : 'No officer in this district yet',
      },
    ],
  });
  try {
    await claim.save();
  } catch (err) {
    // Don't leave orphaned photos in GridFS if the claim could not be saved
    await Promise.all(claim.photos.map((p) => deleteFile(p.fileId)));
    throw err;
  }

  // Remember the farm location on the farmer's profile for weather forecasts and alerts
  if (farmer.farmLocation?.latitude == null) {
    farmer.farmLocation = {
      latitude: b.latitude,
      longitude: b.longitude,
      label: [b.village, b.district, b.state].filter(Boolean).join(', '),
    };
    await farmer.save();
  }

  await notifyStatusChange(claim, farmer);
  if (!env.isTest) runWeatherCheckInBackground(claim._id);

  res.status(201).json({ claim });
}

// GET /api/claims?status=&district=&causeOfLoss=&verdict=&overdue=true&q=&page=1&limit=20&sort=newest
async function listClaims(req, res) {
  const q = req.query;
  const filter = { ...scopeFilter(req.user) };
  const and = [];

  if (q.status) filter.status = q.status;
  if (q.district) filter['location.district'] = q.district;
  if (q.causeOfLoss) filter.causeOfLoss = q.causeOfLoss;
  if (q.verdict) filter['weatherCheck.verdict'] = q.verdict;
  if (q.assigned === 'none') filter.assignedOfficer = null;
  if (q.overdue === 'true') {
    and.push({
      status: { $in: OPEN_STATUSES },
      statusChangedAt: { $lt: new Date(Date.now() - env.slaDays * 24 * 60 * 60 * 1000) },
    });
  }
  if (q.q) {
    const pattern = new RegExp(escapeRegex(String(q.q).trim()), 'i');
    and.push({ $or: [{ claimNumber: pattern }, { farmerName: pattern }, { 'crop.name': pattern }] });
  }
  if (and.length) filter.$and = and;

  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const sorts = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amount: { amountClaimed: -1 },
    stale: { statusChangedAt: 1 },
  };

  const [claims, total] = await Promise.all([
    Claim.find(filter)
      .sort(sorts[q.sort] || sorts.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-statusHistory')
      .populate('assignedOfficer', 'name district'),
    Claim.countDocuments(filter),
  ]);

  res.json({ claims, page, limit, total, pages: Math.ceil(total / limit) });
}

// GET /api/claims/:id
async function getClaim(req, res) {
  const claim = await findClaimForUser(req.params.id, req.user);
  await claim.populate('assignedOfficer', 'name district phone email');

  const response = { claim };
  if (req.user.role !== ROLES.FARMER) {
    response.notifications = await Notification.find({ claim: claim._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('type status to body attempts error createdAt');
  }
  res.json(response);
}

async function changeStatus(claim, user, { to, remark, amountApproved }) {
  applyTransition(claim, to, user, { remark, amountApproved });
  await claim.save();
  const farmer = await User.findById(claim.farmer).select('language');
  await notifyStatusChange(claim, farmer, remark);
  return claim;
}

// PATCH /api/claims/:id/status   { to, remark?, amountApproved? }  (officer/admin)
async function updateStatus(req, res) {
  const claim = await findClaimForUser(req.params.id, req.user);
  await changeStatus(claim, req.user, req.body);
  await claim.populate('assignedOfficer', 'name district');
  res.json({ claim });
}

// POST /api/claims/bulk/status   { ids: [...], to, remark? }  (officer/admin)
// Each claim is processed separately; the response says which ones succeeded.
async function bulkUpdateStatus(req, res) {
  const { ids, to, remark } = req.body;
  if (to === STATUS.APPROVED) {
    throw ApiError.badRequest('Approve claims one at a time so you can enter each approved amount');
  }

  const results = [];
  for (const id of ids) {
    try {
      const claim = await findClaimForUser(id, req.user);
      await changeStatus(claim, req.user, { to, remark });
      results.push({ id, claimNumber: claim.claimNumber, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  res.json({ updated: results.filter((r) => r.ok).length, results });
}

// PATCH /api/claims/:id/assign   { officerId }  (admin)
async function assignOfficer(req, res) {
  const claim = await findClaimForUser(req.params.id, req.user);
  const officer = await User.findOne({ _id: req.body.officerId, role: ROLES.OFFICER, isActive: true });
  if (!officer) throw ApiError.badRequest('Officer not found or inactive');

  claim.assignedOfficer = officer._id;
  claim.statusHistory.push({
    from: claim.status,
    to: claim.status,
    by: req.user._id,
    byName: req.user.name,
    byRole: req.user.role,
    remark: `Assigned to ${officer.name}`,
  });
  await claim.save();
  await claim.populate('assignedOfficer', 'name district');
  res.json({ claim });
}

// POST /api/claims/:id/weather-check   (officer/admin) - run or re-run the weather check now
async function rerunWeatherCheck(req, res) {
  const claim = await findClaimForUser(req.params.id, req.user);
  const updated = await runWeatherCheck(claim._id);
  res.json({ weatherCheck: updated.weatherCheck });
}

// GET /api/public/track?claimNumber=KS-2026-000001&phoneLast4=3210   (no login)
// Needs the last 4 digits of the farmer's phone so strangers can't look up claims by number alone.
async function trackPublic(req, res) {
  const claim = await Claim.findOne({ claimNumber: String(req.query.claimNumber).trim().toUpperCase() });
  if (!claim || claim.farmerPhone.slice(-4) !== String(req.query.phoneLast4)) {
    throw ApiError.notFound('No claim found with this claim number and phone number', 'CLAIM_NOT_FOUND');
  }
  res.json({
    claimNumber: claim.claimNumber,
    status: claim.status,
    cropName: claim.crop.name,
    causeOfLoss: claim.causeOfLoss,
    submittedAt: claim.submittedAt,
    amountApproved: claim.amountApproved,
    timeline: claim.statusHistory
      .filter((h) => h.from !== h.to)
      .map((h) => ({ status: h.to, at: h.at })),
  });
}

module.exports = {
  createClaim,
  listClaims,
  getClaim,
  updateStatus,
  bulkUpdateStatus,
  assignOfficer,
  rerunWeatherCheck,
  trackPublic,
  findClaimForUser,
};

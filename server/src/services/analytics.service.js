// Numbers for the analytics dashboard, computed inside MongoDB with aggregation pipelines.
// Each pipeline is a list of steps: $match (filter) -> $group (count/sum per group) -> $sort.
const Claim = require('../models/Claim');
const User = require('../models/User');
const env = require('../config/env');
const { ROLES } = require('../constants');
const { STATUS, OPEN_STATUSES } = require('./claimWorkflow');

const DAY_MS = 24 * 60 * 60 * 1000;

// Admins see everything, officers only the claims assigned to them
function baseMatch(user) {
  return user.role === ROLES.ADMIN ? {} : { assignedOfficer: user._id };
}

async function getSummary(user) {
  const match = baseMatch(user);
  // First day of the month, 11 months ago (UTC, same as MongoDB's $dateToString)
  const now = new Date();
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [byStatus, byCause, byState, monthly, verdicts, processing, overdue] = await Promise.all([
    Claim.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amountClaimed: { $sum: '$amountClaimed' },
          amountApproved: { $sum: '$amountApproved' }, // $sum skips claims with no amountApproved
        },
      },
    ]),
    Claim.aggregate([{ $match: match }, { $group: { _id: '$causeOfLoss', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Claim.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$location.state',
          count: { $sum: 1 },
          amountApproved: { $sum: '$amountApproved' }, // $sum skips claims with no amountApproved
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Claim.aggregate([
      { $match: { ...match, submittedAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$submittedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Claim.aggregate([{ $match: match }, { $group: { _id: '$weatherCheck.verdict', count: { $sum: 1 } } }]),
    // Average days from submission to decision (approved or rejected)
    Claim.aggregate([
      { $match: { ...match, decidedAt: { $ne: null } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ['$decidedAt', '$submittedAt'] } }, decided: { $sum: 1 } } },
    ]),
    Claim.countDocuments({
      ...match,
      status: { $in: OPEN_STATUSES },
      statusChangedAt: { $lt: new Date(Date.now() - env.slaDays * DAY_MS) },
    }),
  ]);

  const statusCount = (s) => byStatus.find((b) => b._id === s)?.count || 0;
  const approved = statusCount(STATUS.APPROVED) + statusCount(STATUS.DISBURSED);
  const rejected = statusCount(STATUS.REJECTED);
  const disbursedRow = byStatus.find((b) => b._id === STATUS.DISBURSED);

  return {
    totals: {
      claims: byStatus.reduce((a, b) => a + b.count, 0),
      open: OPEN_STATUSES.reduce((a, s) => a + statusCount(s), 0),
      overdue,
      amountClaimed: byStatus.reduce((a, b) => a + b.amountClaimed, 0),
      amountApproved: byStatus.reduce((a, b) => a + b.amountApproved, 0),
      amountDisbursed: disbursedRow?.amountApproved || 0,
      // Of the claims that have been decided, what percentage were approved
      approvalRate: approved + rejected ? Math.round((approved / (approved + rejected)) * 100) : null,
      avgDaysToDecision: processing[0] ? Math.round((processing[0].avgMs / DAY_MS) * 10) / 10 : null,
    },
    byStatus: byStatus.map((b) => ({ status: b._id, count: b.count })),
    byCause: byCause.map((b) => ({ cause: b._id, count: b.count })),
    byState: byState.map((b) => ({ state: b._id, count: b.count, amountApproved: b.amountApproved })),
    monthly: fillMonths(monthly, twelveMonthsAgo),
    weatherVerdicts: verdicts.map((v) => ({ verdict: v._id || 'pending', count: v.count })),
    slaDays: env.slaDays,
  };
}

// Make sure all 12 months appear, even months with zero claims
function fillMonths(rows, from) {
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  const months = [];
  const d = new Date(from);
  for (let i = 0; i < 12; i += 1) {
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    months.push({ month: key, count: counts.get(key) || 0 });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
}

// Admin only: open and overdue claims per officer
async function getOfficerWorkload() {
  const cutoff = new Date(Date.now() - env.slaDays * DAY_MS);
  const rows = await Claim.aggregate([
    { $match: { status: { $in: OPEN_STATUSES }, assignedOfficer: { $ne: null } } },
    {
      $group: {
        _id: '$assignedOfficer',
        open: { $sum: 1 },
        overdue: { $sum: { $cond: [{ $lt: ['$statusChangedAt', cutoff] }, 1, 0] } },
      },
    },
  ]);
  const officers = await User.find({ role: ROLES.OFFICER }).select('name district isActive');
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  return officers
    .map((o) => ({
      officerId: o._id,
      name: o.name,
      district: o.district,
      isActive: o.isActive,
      open: byId.get(String(o._id))?.open || 0,
      overdue: byId.get(String(o._id))?.overdue || 0,
    }))
    .sort((a, b) => b.open - a.open);
}

module.exports = { getSummary, getOfficerWorkload };

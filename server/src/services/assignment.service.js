// Automatically assigns a new claim to a field officer from the same district.
// If the district has several officers, the one with the fewest open claims gets it,
// so work is spread evenly.
const User = require('../models/User');
const Claim = require('../models/Claim');
const { ROLES } = require('../constants');
const { OPEN_STATUSES } = require('./claimWorkflow');

async function pickOfficerForDistrict(district) {
  const officers = await User.find({ role: ROLES.OFFICER, district, isActive: true }).select('_id name');
  if (officers.length === 0) return null;
  if (officers.length === 1) return officers[0];

  // Count open claims per officer in one database round trip
  const workload = await Claim.aggregate([
    { $match: { assignedOfficer: { $in: officers.map((o) => o._id) }, status: { $in: OPEN_STATUSES } } },
    { $group: { _id: '$assignedOfficer', open: { $sum: 1 } } },
  ]);
  const openCount = new Map(workload.map((w) => [String(w._id), w.open]));

  return officers.reduce((best, officer) =>
    (openCount.get(String(officer._id)) || 0) < (openCount.get(String(best._id)) || 0) ? officer : best
  );
}

module.exports = { pickOfficerForDistrict };

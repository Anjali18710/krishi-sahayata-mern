// Automatically assigns a new claim to a field officer from the same district.
// If the district has several officers, the one with the fewest open claims gets it,
// so work is spread evenly.
const User = require('../models/User');
const Claim = require('../models/Claim');
const { ROLES } = require('../constants');
const { OPEN_STATUSES } = require('./claimWorkflow');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches a district name ignoring upper/lower case and extra spaces ("bastar" = "Bastar ")
const districtMatch = (district) => new RegExp(`^${escapeRegex(String(district).trim())}$`, 'i');

async function pickOfficerForDistrict(district) {
  const officers = await User.find({ role: ROLES.OFFICER, district: districtMatch(district), isActive: true }).select('_id name');
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

/**
 * When a new officer is added (or moved/re-activated), hand them the open claims in their district
 * that nobody was assigned to yet. Each claim's timeline records the assignment.
 * Returns the number of claims assigned.
 */
async function assignWaitingClaims(officer, byUser) {
  if (officer.role !== ROLES.OFFICER || !officer.isActive || !officer.district) return 0;
  const waiting = await Claim.find({
    assignedOfficer: null,
    'location.district': districtMatch(officer.district),
    status: { $in: OPEN_STATUSES },
  });
  for (const claim of waiting) {
    claim.assignedOfficer = officer._id;
    claim.statusHistory.push({
      from: claim.status,
      to: claim.status,
      by: byUser._id,
      byName: byUser.name,
      byRole: byUser.role,
      remark: `Assigned to ${officer.name} (new officer for ${officer.district})`,
    });
    await claim.save();
  }
  return waiting.length;
}

module.exports = { pickOfficerForDistrict, assignWaitingClaims, districtMatch };

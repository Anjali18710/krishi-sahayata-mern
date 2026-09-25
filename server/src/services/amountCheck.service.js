// Compares a claim's amount with the admin-set limit for its crop.
// Gives the officer a hint like "₹20,000 per acre claimed, limit ₹10,000" - the officer still decides.
const CropLimit = require('../models/CropLimit');

const round = (n) => Math.round(n);

/**
 * Returns { perAcre, limit, maxAllowed, ratio, overLimit } or
 * { perAcre, limit: null } when the admin has not set a limit for this crop.
 */
async function checkClaimAmount(claim) {
  const perAcre = round(claim.amountClaimed / claim.crop.areaAcres);
  const limitDoc = await CropLimit.findOne({ crop: claim.crop.name.trim().toLowerCase() }).lean();
  if (!limitDoc) return { crop: claim.crop.name, perAcre, limit: null };

  const maxAllowed = round(limitDoc.maxPerAcre * claim.crop.areaAcres);
  return {
    crop: claim.crop.name,
    perAcre,
    limit: limitDoc.maxPerAcre,
    maxAllowed,
    ratio: Number((perAcre / limitDoc.maxPerAcre).toFixed(2)),
    overLimit: claim.amountClaimed > maxAllowed,
  };
}

module.exports = { checkClaimAmount };

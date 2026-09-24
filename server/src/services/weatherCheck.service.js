// Runs the weather check for one claim: fetch weather -> score it -> save on the claim.
const Claim = require('../models/Claim');
const { getDailyHistory } = require('./weather.service');
const { scoreClaimWeather, requiredRange, WEATHER_CAUSES } = require('./weatherScoring');

async function runWeatherCheck(claimId) {
  const claim = await Claim.findById(claimId);
  if (!claim) return null;

  if (!WEATHER_CAUSES.includes(claim.causeOfLoss)) {
    claim.weatherCheck = { status: 'done', ...scoreClaimWeather(claim.causeOfLoss, []), checkedAt: new Date() };
    await claim.save();
    return claim;
  }

  try {
    const range = requiredRange(claim.causeOfLoss, claim.lossDate);
    const { source, days } = await getDailyHistory(claim.location.latitude, claim.location.longitude, range.start, range.end);
    const result = scoreClaimWeather(claim.causeOfLoss, days);
    claim.weatherCheck = {
      status: 'done',
      ...result,
      metrics: { ...result.metrics, from: range.start, to: range.end },
      source,
      checkedAt: new Date(),
    };
  } catch (err) {
    // e.g. Open-Meteo is down. Staff can re-run the check later from the claim page.
    claim.weatherCheck = {
      status: 'failed',
      verdict: 'inconclusive',
      reasons: ['Weather service could not be reached. Try running the check again.'],
      error: err.message,
      checkedAt: new Date(),
    };
  }

  await claim.save();
  return claim;
}

// Used right after a claim is created: the farmer gets a response immediately and
// the check finishes a moment later in the background.
function runWeatherCheckInBackground(claimId) {
  setImmediate(() => {
    runWeatherCheck(claimId).catch((err) => console.error(`Weather check failed for ${claimId}:`, err.message));
  });
}

module.exports = { runWeatherCheck, runWeatherCheckInBackground };

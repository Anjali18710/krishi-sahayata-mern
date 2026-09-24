// Fixed lists used across the backend. Keeping them in one file avoids typos like
// "Approved" in one place and "approved" in another.

const ROLES = Object.freeze({
  FARMER: 'farmer',
  OFFICER: 'officer', // field officer who reviews and verifies claims in a district
  ADMIN: 'admin',
});

const LANGUAGES = ['en', 'hi'];

// Causes of crop loss a farmer can pick when filing a claim.
// The weather check only applies to the weather-related ones.
const CAUSES_OF_LOSS = [
  'drought',
  'flood',
  'excess_rain',
  'hailstorm',
  'cyclone',
  'heatwave',
  'frost',
  'pest_attack',
  'fire',
  'other',
];

const SEASONS = ['kharif', 'rabi', 'zaid'];

module.exports = { ROLES, LANGUAGES, CAUSES_OF_LOSS, SEASONS };

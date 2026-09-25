// Looks up an IFSC code with Razorpay's free public IFSC API (no API key needed).
// Docs: https://github.com/razorpay/ifsc  ->  GET https://ifsc.razorpay.com/SBIN0001234
// It tells us the real bank and branch for the code. It does NOT prove the account number is real.
const axios = require('axios');

const IFSC_URL = 'https://ifsc.razorpay.com';
const http = axios.create({ timeout: 8000 });

// Bank branches rarely change, so results are kept in memory for a day.
const cache = new Map();
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 1000;

/**
 * Returns { ifsc, bank, branch, city, district, state } for a known code,
 * null if the code does not exist (HTTP 404),
 * and throws if the IFSC service itself could not be reached.
 */
async function lookupIfsc(code) {
  const ifsc = String(code).trim().toUpperCase();
  const hit = cache.get(ifsc);
  if (hit && hit.expires > Date.now()) return hit.value;

  let value;
  try {
    const { data } = await http.get(`${IFSC_URL}/${encodeURIComponent(ifsc)}`);
    value = {
      ifsc: data.IFSC,
      bank: data.BANK,
      branch: data.BRANCH,
      city: data.CITY,
      district: data.DISTRICT,
      state: data.STATE,
    };
  } catch (err) {
    if (err.response?.status === 404) value = null;
    else throw err;
  }

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value); // drop the oldest entry
  cache.set(ifsc, { value, expires: Date.now() + CACHE_MS });
  return value;
}

module.exports = { lookupIfsc };

// Converts the many ways people type an Indian mobile number into one format: +91XXXXXXXXXX.
// Examples that all become +919876543210:
//   "9876543210", "+91 98765 43210", "091-9876543210", "919876543210"
// Returns null if the input is not a valid Indian mobile number
// (10 digits starting with 6, 7, 8 or 9).
function normalizeIndianPhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let digits = String(input).replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);

  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

// "+919876543210" -> "+91 ******3210" (for showing a number without revealing it fully)
function maskPhone(phone) {
  if (!phone) return '';
  return `${phone.slice(0, 3)} ******${phone.slice(-4)}`;
}

module.exports = { normalizeIndianPhone, maskPhone };

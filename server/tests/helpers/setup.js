// Runs before every test file.
// Replaces the real IFSC lookup (an internet call to Razorpay) with fake data, so tests work offline.
// Codes starting with "XXXX" behave like codes that don't exist.
jest.mock('../../src/services/ifsc.service', () => ({
  lookupIfsc: jest.fn(async (code) =>
    code.startsWith('XXXX')
      ? null
      : { ifsc: code, bank: 'State Bank of India', branch: 'Main Branch', city: 'Puri', district: 'Puri', state: 'Odisha' }
  ),
}));

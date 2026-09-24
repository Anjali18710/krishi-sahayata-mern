// Small helpers to create test users and claims quickly.
const User = require('../../src/models/User');
const { signToken } = require('../../src/middleware/auth');

let phoneCounter = 0;

async function createFarmer(overrides = {}) {
  phoneCounter += 1;
  return User.create({
    name: 'Test Farmer',
    phone: `+9198${String(76500000 + phoneCounter).padStart(8, '0')}`,
    state: 'Odisha',
    district: 'Puri',
    ...overrides,
  });
}

async function createStaff(role, overrides = {}) {
  const user = new User({
    name: role === 'admin' ? 'Test Admin' : 'Test Officer',
    email: `${role}${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.in`,
    role,
    state: 'Odisha',
    district: 'Puri',
    ...overrides,
  });
  await user.setPassword('Password@123');
  return user.save();
}

const authHeader = (user) => ({ Authorization: `Bearer ${signToken(user)}` });

// Form fields for a valid claim (loss 3 days ago)
function claimFields(overrides = {}) {
  return {
    cropName: 'Paddy',
    season: 'kharif',
    areaAcres: 2.5,
    causeOfLoss: 'flood',
    lossDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    description: 'Field under water for 3 days',
    amountClaimed: 25000,
    state: 'Odisha',
    district: 'Puri',
    village: 'Satapada',
    latitude: 19.67,
    longitude: 85.45,
    accountHolderName: 'Test Farmer',
    bankName: 'State Bank of India',
    ifsc: 'SBIN0001234',
    accountNumber: '123456789012',
    ...overrides,
  };
}

module.exports = { createFarmer, createStaff, authHeader, claimFields };

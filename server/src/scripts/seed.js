// Fills the database with demo data: 1 admin, 5 officers, 12 farmers and about 40 claims
// in different statuses, so the dashboards have something to show.
//
//   npm run seed                 -> seed and run weather checks (needs internet)
//   npm run seed -- --no-weather -> seed without weather checks
//
// WARNING: this deletes all existing users, claims, photos and notifications first.
const mongoose = require('mongoose');
const env = require('../config/env');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Claim = require('../models/Claim');
const Notification = require('../models/Notification');
const Otp = require('../models/Otp');
const { Counter } = require('../models/Counter');
const { ROLES } = require('../constants');
const { STATUS, TRANSITIONS } = require('../services/claimWorkflow');
const { runWeatherCheck } = require('../services/weatherCheck.service');

const DAY = 24 * 60 * 60 * 1000;

// Demo login details - also shown in the README
const ADMIN = { name: 'Priya Nair', email: 'admin@krishisahayata.in', password: 'Admin@12345' };
const OFFICER_PASSWORD = 'Officer@12345';

// Approximate district headquarters coordinates
const DISTRICTS = [
  { state: 'Odisha', district: 'Puri', lat: 19.81, lon: 85.83, officer: 'Suresh Mohanty' },
  { state: 'Odisha', district: 'Khordha', lat: 20.18, lon: 85.62, officer: 'Anita Das' },
  { state: 'Bihar', district: 'Nalanda', lat: 25.2, lon: 85.52, officer: 'Rakesh Kumar' },
  { state: 'Jharkhand', district: 'Bokaro', lat: 23.67, lon: 86.15, officer: 'Meena Kumari' },
  { state: 'Maharashtra', district: 'Nashik', lat: 20.0, lon: 73.79, officer: 'Vikas Patil' },
];

const FARMERS = [
  ['Ramesh Sahu', 'Puri', 'Satapada', 'hi'],
  ['Sukanti Behera', 'Puri', 'Brahmagiri', 'en'],
  ['Bijay Pradhan', 'Khordha', 'Balipatna', 'en'],
  ['Gita Swain', 'Khordha', 'Jatni', 'hi'],
  ['Mahesh Yadav', 'Nalanda', 'Rajgir', 'hi'],
  ['Sunita Devi', 'Nalanda', 'Hilsa', 'hi'],
  ['Arjun Mahto', 'Bokaro', 'Chas', 'hi'],
  ['Kavita Kumari', 'Bokaro', 'Jaridih', 'hi'],
  ['Santosh Jadhav', 'Nashik', 'Niphad', 'en'],
  ['Lata Shinde', 'Nashik', 'Sinnar', 'en'],
  ['Prakash Nayak', 'Puri', 'Pipili', 'en'],
  ['Rekha Kumari', 'Nalanda', 'Islampur', 'hi'],
];

const CROPS = {
  kharif: ['Paddy', 'Maize', 'Arhar (Tur)', 'Soybean', 'Groundnut'],
  rabi: ['Wheat', 'Mustard', 'Gram', 'Potato'],
  zaid: ['Moong', 'Watermelon', 'Vegetables'],
};
const CAUSES = [
  'flood',
  'excess_rain',
  'drought',
  'hailstorm',
  'cyclone',
  'heatwave',
  'pest_attack',
  'flood',
  'excess_rain',
  'drought',
];
const BANKS = [
  ['State Bank of India', 'SBIN0001234'],
  ['Punjab National Bank', 'PUNB0123400'],
  ['Bank of Baroda', 'BARB0PURIXX'],
  ['Odisha Gramya Bank', 'IOBA0OGB001'],
];

// Simple repeatable random numbers so every seed run creates the same data
let randomState = 42;
function random() {
  randomState = (randomState * 1103515245 + 12345) % 2147483648;
  return randomState / 2147483648;
}
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const between = (min, max) => min + random() * (max - min);

// Walk the state machine from "submitted" to the target status, e.g. submitted -> under_review -> approved
function pathTo(target) {
  const paths = {
    [STATUS.SUBMITTED]: [STATUS.SUBMITTED],
    [STATUS.UNDER_REVIEW]: [STATUS.SUBMITTED, STATUS.UNDER_REVIEW],
    [STATUS.FIELD_VERIFICATION]: [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.FIELD_VERIFICATION],
    [STATUS.APPROVED]: [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.FIELD_VERIFICATION, STATUS.APPROVED],
    [STATUS.REJECTED]: [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.REJECTED],
    [STATUS.DISBURSED]: [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.FIELD_VERIFICATION, STATUS.APPROVED, STATUS.DISBURSED],
  };
  const path = paths[target];
  // Safety check: every step must be allowed by the real state machine
  for (let i = 1; i < path.length; i += 1) {
    if (!TRANSITIONS[path[i - 1]].includes(path[i])) throw new Error(`Invalid seed path ${path[i - 1]} -> ${path[i]}`);
  }
  return path;
}

const REMARKS = {
  [STATUS.UNDER_REVIEW]: 'Documents received, review started',
  [STATUS.FIELD_VERIFICATION]: 'Field visit scheduled',
  [STATUS.APPROVED]: 'Loss verified in field visit',
  [STATUS.REJECTED]: 'Crop loss could not be verified at the field visit',
  [STATUS.DISBURSED]: 'Amount transferred by NEFT',
};

async function seed() {
  if (env.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to seed a production database. Add --force if you are sure.');
  }
  await connectDB(env.mongoUri);

  console.log('Clearing old data...');
  await Promise.all([
    User.deleteMany({}),
    Claim.deleteMany({}),
    Notification.deleteMany({}),
    Otp.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  const db = mongoose.connection.db;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of ['photos.files', 'photos.chunks']) {
    if (existing.includes(name)) await db.collection(name).deleteMany({});
  }

  // --- staff ---
  const admin = new User({ ...ADMIN, role: ROLES.ADMIN, state: 'Odisha', district: 'Khordha', isDemo: true });
  await admin.setPassword(ADMIN.password);
  await admin.save();

  const officers = {};
  for (const d of DISTRICTS) {
    const email = `${d.district.toLowerCase()}.officer@krishisahayata.in`;
    const officer = new User({ name: d.officer, email, role: ROLES.OFFICER, state: d.state, district: d.district, isDemo: true });
    await officer.setPassword(OFFICER_PASSWORD);
    officers[d.district] = await officer.save();
  }

  // --- farmers (made-up phone numbers; isDemo stops real SMS being sent to them) ---
  const farmers = [];
  for (let i = 0; i < FARMERS.length; i += 1) {
    const [name, districtName, village, language] = FARMERS[i];
    const d = DISTRICTS.find((x) => x.district === districtName);
    const lat = Number((d.lat + between(-0.08, 0.08)).toFixed(4));
    const lon = Number((d.lon + between(-0.08, 0.08)).toFixed(4));
    farmers.push(
      await User.create({
        name,
        phone: `+9199999000${String(i + 1).padStart(2, '0')}`,
        role: ROLES.FARMER,
        state: d.state,
        district: d.district,
        village,
        language,
        farmLocation: { latitude: lat, longitude: lon, label: `${village}, ${d.district}, ${d.state}` },
        isDemo: true,
      })
    );
  }

  // --- claims ---
  const targetStatuses = [
    ...Array(8).fill(STATUS.SUBMITTED),
    ...Array(7).fill(STATUS.UNDER_REVIEW),
    ...Array(5).fill(STATUS.FIELD_VERIFICATION),
    ...Array(6).fill(STATUS.APPROVED),
    ...Array(6).fill(STATUS.REJECTED),
    ...Array(8).fill(STATUS.DISBURSED),
  ];
  const now = Date.now();
  const perYear = {};
  const claims = [];

  for (let i = 0; i < targetStatuses.length; i += 1) {
    const target = targetStatuses[i];
    const farmer = farmers[i % farmers.length];
    const officer = officers[farmer.district];
    const season = pick(Object.keys(CROPS));
    const cause = pick(CAUSES);
    const [bankName, ifsc] = pick(BANKS);
    const accountNumber = String(Math.floor(between(100000000000, 999999999999)));
    const areaAcres = Number(between(0.5, 6).toFixed(1));
    const amountClaimed = Math.round((areaAcres * between(8000, 18000)) / 100) * 100;

    // Finished claims are spread over ~6 months; open claims are recent, and a few are "overdue"
    const finished = [STATUS.REJECTED, STATUS.DISBURSED].includes(target);
    const daysAgo = target === STATUS.SUBMITTED ? between(0, 8) : finished ? between(15, 170) : between(3, 14);
    const submittedAt = new Date(now - daysAgo * DAY);
    const lossDate = new Date(submittedAt.getTime() - between(1, 12) * DAY);
    const year = submittedAt.getFullYear();
    perYear[year] = (perYear[year] || 0) + 1;

    const history = [];
    let at = submittedAt.getTime();
    const path = pathTo(target);
    for (let step = 0; step < path.length; step += 1) {
      if (step > 0) at = Math.min(now - DAY / 2, at + between(1, finished ? 9 : 4) * DAY);
      history.push({
        from: step === 0 ? null : path[step - 1],
        to: path[step],
        by: step === 0 ? farmer._id : path[step] === STATUS.DISBURSED ? admin._id : officer._id,
        byName: step === 0 ? farmer.name : path[step] === STATUS.DISBURSED ? admin.name : officer.name,
        byRole: step === 0 ? ROLES.FARMER : path[step] === STATUS.DISBURSED ? ROLES.ADMIN : ROLES.OFFICER,
        remark: step === 0 ? `Auto-assigned to ${officer.name}` : REMARKS[path[step]],
        at: new Date(at),
      });
    }
    const last = history[history.length - 1];
    const decided = history.find((h) => h.to === STATUS.APPROVED || h.to === STATUS.REJECTED);
    const approved = [STATUS.APPROVED, STATUS.DISBURSED].includes(target);

    claims.push({
      claimNumber: `KS-${year}-${String(perYear[year]).padStart(6, '0')}`,
      farmer: farmer._id,
      farmerName: farmer.name,
      farmerPhone: farmer.phone,
      crop: { name: pick(CROPS[season]), season, areaAcres },
      causeOfLoss: cause,
      lossDate,
      description: 'Demo claim created by the seed script.',
      amountClaimed,
      amountApproved: approved ? Math.round((amountClaimed * between(0.6, 1)) / 100) * 100 : undefined,
      location: {
        state: farmer.state,
        district: farmer.district,
        village: farmer.village,
        latitude: farmer.farmLocation.latitude,
        longitude: farmer.farmLocation.longitude,
      },
      bank: { accountHolderName: farmer.name, bankName, ifsc, accountNumber, accountLast4: accountNumber.slice(-4) },
      status: target,
      statusChangedAt: last.at,
      statusHistory: history,
      assignedOfficer: officer._id,
      submittedAt,
      createdAt: submittedAt,
      decidedAt: decided?.at,
      disbursedAt: target === STATUS.DISBURSED ? last.at : undefined,
    });
  }

  const inserted = await Claim.insertMany(claims);
  for (const [year, seq] of Object.entries(perYear)) {
    await Counter.create({ _id: `claim-${year}`, seq });
  }

  console.log(`Created 1 admin, ${DISTRICTS.length} officers, ${farmers.length} farmers, ${inserted.length} claims.`);

  if (!process.argv.includes('--no-weather')) {
    console.log('Running weather checks against Open-Meteo (use --no-weather to skip)...');
    let failed = 0;
    for (const claim of inserted) {
      const result = await runWeatherCheck(claim._id);
      if (result.weatherCheck.status === 'failed') failed += 1;
    }
    console.log(failed ? `Weather checks done (${failed} could not reach Open-Meteo).` : 'Weather checks done.');
  }

  console.log('\nDemo logins:');
  console.log(`  Admin:   ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`  Officer: puri.officer@krishisahayata.in / ${OFFICER_PASSWORD} (also khordha, nalanda, bokaro, nashik)`);
  console.log(`  Farmer:  phone 9999900001 (OTP is shown on screen for demo accounts)`);

  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});

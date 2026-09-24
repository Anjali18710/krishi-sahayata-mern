// Admin-only management of staff accounts (officers and admins).
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { normalizeIndianPhone } = require('../utils/phone');
const { ROLES } = require('../constants');

// GET /api/users?role=officer&district=Khordha
async function listUsers(req, res) {
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  if (req.query.district) filter.district = String(req.query.district);
  const users = await User.find(filter).sort({ role: 1, name: 1 }).limit(500);
  res.json({ users });
}

// POST /api/users/staff   { name, email, password, role, state, district, phone? }
async function createStaff(req, res) {
  const { name, email, password, role, state, district } = req.body;
  if (![ROLES.OFFICER, ROLES.ADMIN].includes(role)) {
    throw ApiError.badRequest('role must be officer or admin');
  }

  const user = new User({ name, email, role, state, district });
  if (req.body.phone) {
    user.phone = normalizeIndianPhone(req.body.phone);
    if (!user.phone) throw ApiError.badRequest('Invalid phone number', 'INVALID_PHONE');
  }
  await user.setPassword(password);
  await user.save();
  res.status(201).json({ user });
}

// PATCH /api/users/:id   { isActive?, district?, state? }
async function updateUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  if (user._id.equals(req.user._id) && req.body.isActive === false) {
    throw ApiError.badRequest('You cannot disable your own account');
  }

  for (const key of ['isActive', 'district', 'state']) {
    if (req.body[key] !== undefined) user[key] = req.body[key];
  }
  await user.save();
  res.json({ user });
}

module.exports = { listUsers, createStaff, updateUser };

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getSummary, getOfficerWorkload } = require('../services/analytics.service');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(requireAuth);

// GET /api/analytics/summary  (officer: own claims, admin: all claims)
router.get('/summary', requireRole(ROLES.OFFICER, ROLES.ADMIN), async (req, res) => {
  res.json(await getSummary(req.user));
});

// GET /api/analytics/officers  (admin)
router.get('/officers', requireRole(ROLES.ADMIN), async (req, res) => {
  res.json({ officers: await getOfficerWorkload() });
});

module.exports = router;

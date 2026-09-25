// Per-acre payout limits for each crop. Staff can read them; only admins can change them.
const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const CropLimit = require('../models/CropLimit');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(requireAuth, requireRole(ROLES.OFFICER, ROLES.ADMIN));

// GET /api/crop-limits
router.get('/', async (req, res) => {
  const limits = await CropLimit.find().sort({ crop: 1 }).lean();
  res.json({ limits });
});

// PUT /api/crop-limits   { crop, maxPerAcre }  (admin) - adds a crop, or updates it if it already exists
router.put(
  '/',
  requireRole(ROLES.ADMIN),
  [
    body('crop').trim().notEmpty().withMessage('Crop name is required').isLength({ max: 60 }),
    body('maxPerAcre').isFloat({ min: 1, max: 1000000 }).withMessage('Enter an amount between 1 and 10,00,000').toFloat(),
  ],
  validate,
  async (req, res) => {
    const limit = await CropLimit.findOneAndUpdate(
      { crop: req.body.crop.toLowerCase() },
      { $set: { maxPerAcre: req.body.maxPerAcre, updatedBy: req.user._id } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ limit });
  }
);

// DELETE /api/crop-limits/:id  (admin)
router.delete('/:id', requireRole(ROLES.ADMIN), [param('id').isMongoId()], validate, async (req, res) => {
  const deleted = await CropLimit.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('Crop limit not found');
  res.json({ ok: true });
});

module.exports = router;

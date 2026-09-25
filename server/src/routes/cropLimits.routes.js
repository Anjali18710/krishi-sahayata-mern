// Per-acre payout limits for each crop. Staff can read them; admins propose and approve changes.
// A change only takes effect after a SECOND admin approves it (see models/CropLimit.js).
const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const CropLimit = require('../models/CropLimit');
const CropLimitHistory = require('../models/CropLimitHistory');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(requireAuth, requireRole(ROLES.OFFICER, ROLES.ADMIN));

const log = (limit, action, user, newValue) =>
  CropLimitHistory.create({
    crop: limit.crop,
    action,
    oldValue: limit.maxPerAcre,
    newValue,
    by: user._id,
    byName: user.name,
  });

// The value a pending proposal would set (null = remove the limit)
const proposedValue = (pending) => (pending.remove ? null : pending.maxPerAcre);

async function findWithPending(id) {
  const limit = await CropLimit.findById(id);
  if (!limit) throw ApiError.notFound('Crop limit not found');
  if (!limit.pending?.proposedBy) throw ApiError.badRequest('There is no pending change for this crop', 'NO_PENDING');
  return limit;
}

// GET /api/crop-limits  - current limits and any changes waiting for approval
router.get('/', async (req, res) => {
  const limits = await CropLimit.find().sort({ crop: 1 }).lean();
  res.json({ limits });
});

// GET /api/crop-limits/history  - latest 200 entries of the permanent change history
router.get('/history', async (req, res) => {
  const history = await CropLimitHistory.find().sort({ at: -1 }).limit(200).lean();
  res.json({ history });
});

// POST /api/crop-limits/proposals   { crop, maxPerAcre }  or  { crop, remove: true }   (admin)
router.post(
  '/proposals',
  requireRole(ROLES.ADMIN),
  [
    body('crop').trim().notEmpty().withMessage('Crop name is required').isLength({ max: 60 }),
    body('remove').optional().isBoolean().toBoolean(),
    body('maxPerAcre')
      .if(body('remove').not().equals('true'))
      .isFloat({ min: 1, max: 1000000 })
      .withMessage('Enter an amount between 1 and 10,00,000')
      .toFloat(),
  ],
  validate,
  async (req, res) => {
    const crop = req.body.crop.toLowerCase();
    const remove = req.body.remove === true;
    let limit = await CropLimit.findOne({ crop });

    if (limit?.pending?.proposedBy) {
      throw ApiError.conflict(
        `A change for ${crop} is already waiting for approval. Approve or reject it first.`,
        'PENDING_EXISTS'
      );
    }
    if (remove && limit?.maxPerAcre == null) throw ApiError.badRequest(`${crop} has no limit to remove`);
    if (!remove && limit?.maxPerAcre === req.body.maxPerAcre) {
      throw ApiError.badRequest(`The limit for ${crop} is already ${req.body.maxPerAcre}`);
    }

    if (!limit) limit = new CropLimit({ crop });
    limit.pending = {
      maxPerAcre: remove ? undefined : req.body.maxPerAcre,
      remove,
      proposedBy: req.user._id,
      proposedByName: req.user.name,
      proposedAt: new Date(),
    };
    await limit.save();
    await log(limit, 'proposed', req.user, proposedValue(limit.pending));
    res.status(201).json({ limit });
  }
);

// POST /api/crop-limits/:id/approve   (admin, must be a different admin from the one who proposed)
router.post('/:id/approve', requireRole(ROLES.ADMIN), [param('id').isMongoId()], validate, async (req, res) => {
  const limit = await findWithPending(req.params.id);
  if (limit.pending.proposedBy.equals(req.user._id)) {
    throw ApiError.forbidden('A different admin must approve your proposal');
  }

  const newValue = proposedValue(limit.pending);
  await log(limit, 'approved', req.user, newValue);

  if (newValue == null) {
    await limit.deleteOne(); // limit removed; the history keeps the record
    return res.json({ limit: null });
  }
  limit.maxPerAcre = newValue;
  limit.approvedBy = req.user._id;
  limit.approvedAt = new Date();
  limit.pending = undefined;
  await limit.save();
  res.json({ limit });
});

// POST /api/crop-limits/:id/reject   (admin) - the proposer can use this to cancel their own proposal
router.post('/:id/reject', requireRole(ROLES.ADMIN), [param('id').isMongoId()], validate, async (req, res) => {
  const limit = await findWithPending(req.params.id);
  const own = limit.pending.proposedBy.equals(req.user._id);
  await log(limit, own ? 'cancelled' : 'rejected', req.user, proposedValue(limit.pending));

  if (limit.maxPerAcre == null) {
    await limit.deleteOne(); // it was a proposal for a new crop; nothing left to keep
    return res.json({ limit: null });
  }
  limit.pending = undefined;
  await limit.save();
  res.json({ limit });
});

module.exports = router;

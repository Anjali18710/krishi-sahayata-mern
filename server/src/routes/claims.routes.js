const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/claims.controller');
const { ROLES, CAUSES_OF_LOSS, SEASONS } = require('../constants');
const { ALL_STATUSES } = require('../services/claimWorkflow');

const router = express.Router();
const STAFF = [ROLES.OFFICER, ROLES.ADMIN];

// A crop loss must be reported within this many days
const REPORTING_WINDOW_DAYS = 30;

router.use(requireAuth);

const createRules = [
  body('cropName').trim().notEmpty().withMessage('Crop name is required').isLength({ max: 60 }),
  body('season').isIn(SEASONS).withMessage('Choose a season'),
  body('areaAcres').isFloat({ min: 0.01, max: 1000 }).withMessage('Area must be between 0.01 and 1000 acres').toFloat(),
  body('causeOfLoss').isIn(CAUSES_OF_LOSS).withMessage('Choose a cause of loss'),
  body('lossDate')
    .isISO8601()
    .withMessage('Enter the date of loss')
    .toDate()
    .custom((date) => {
      const now = new Date();
      if (date > now) throw new Error('Date of loss cannot be in the future');
      if (now - date > REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        throw new Error(`Crop loss must be reported within ${REPORTING_WINDOW_DAYS} days`);
      }
      return true;
    }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('amountClaimed').isFloat({ min: 1, max: 1000000 }).withMessage('Amount must be between 1 and 10,00,000').toFloat(),
  body('state').trim().notEmpty().withMessage('State is required'),
  body('district').trim().notEmpty().withMessage('District is required'),
  body('village').optional().trim().isLength({ max: 80 }),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Farm location is required').toFloat(),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Farm location is required').toFloat(),
  body('accountHolderName').trim().notEmpty().withMessage('Account holder name is required'),
  body('bankName').trim().notEmpty().withMessage('Bank name is required'),
  body('ifsc')
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Enter a valid 11-character IFSC code, e.g. SBIN0001234'),
  body('accountNumber').trim().matches(/^\d{9,18}$/).withMessage('Account number must be 9 to 18 digits'),
];

router.post('/', requireRole(ROLES.FARMER), createRules, validate, ctrl.createClaim);

router.get(
  '/',
  [
    query('status').optional().isIn(ALL_STATUSES),
    query('causeOfLoss').optional().isIn(CAUSES_OF_LOSS),
    query('verdict').optional().isIn(['consistent', 'inconclusive', 'inconsistent', 'not_applicable']),
    query('district').optional().isString().trim(),
    query('overdue').optional().isIn(['true', 'false']),
    query('assigned').optional().isIn(['none']),
    query('q').optional().isString().isLength({ max: 60 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sort').optional().isIn(['newest', 'oldest', 'amount', 'stale']),
  ],
  validate,
  ctrl.listClaims
);

router.post(
  '/bulk/status',
  requireRole(...STAFF),
  [
    body('ids').isArray({ min: 1, max: 50 }).withMessage('Select between 1 and 50 claims'),
    body('ids.*').isMongoId(),
    body('to').isIn(ALL_STATUSES),
    body('remark').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  ctrl.bulkUpdateStatus
);

router.get('/:id', [param('id').isMongoId()], validate, ctrl.getClaim);

router.patch(
  '/:id/status',
  requireRole(...STAFF),
  [
    param('id').isMongoId(),
    body('to').isIn(ALL_STATUSES).withMessage('Unknown status'),
    body('remark').optional().trim().isLength({ max: 500 }),
    body('amountApproved').optional().isFloat({ min: 0 }).toFloat(),
  ],
  validate,
  ctrl.updateStatus
);

router.patch(
  '/:id/assign',
  requireRole(ROLES.ADMIN),
  [param('id').isMongoId(), body('officerId').isMongoId().withMessage('Choose an officer')],
  validate,
  ctrl.assignOfficer
);

module.exports = router;

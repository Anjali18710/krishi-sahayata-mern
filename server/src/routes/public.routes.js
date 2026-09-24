// Endpoints that work without logging in.
const express = require('express');
const { query } = require('express-validator');
const validate = require('../middleware/validate');
const { publicLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/claims.controller');

const router = express.Router();

router.get(
  '/track',
  publicLimiter,
  [
    query('claimNumber').trim().notEmpty().withMessage('Enter your claim number').isLength({ max: 20 }),
    query('phoneLast4').matches(/^\d{4}$/).withMessage('Enter the last 4 digits of your phone number'),
  ],
  validate,
  ctrl.trackPublic
);

module.exports = router;

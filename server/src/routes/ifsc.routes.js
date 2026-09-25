// GET /api/ifsc/SBIN0001234  - shows the farmer the real bank and branch while they fill the claim form
const express = require('express');
const { param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const { lookupIfsc } = require('../services/ifsc.service');

const router = express.Router();

router.get(
  '/:code',
  requireAuth,
  [
    param('code')
      .trim()
      .toUpperCase()
      .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
      .withMessage('Enter a valid 11-character IFSC code, e.g. SBIN0001234'),
  ],
  validate,
  async (req, res) => {
    let branch;
    try {
      branch = await lookupIfsc(req.params.code);
    } catch (err) {
      console.error(`IFSC lookup failed: ${err.response?.status || ''} ${err.message}`);
      throw new ApiError(502, 'Could not check the IFSC code right now.', 'IFSC_UNAVAILABLE');
    }
    if (!branch) throw ApiError.notFound('No bank branch found for this IFSC code', 'IFSC_NOT_FOUND');
    res.json({ branch });
  }
);

module.exports = router;

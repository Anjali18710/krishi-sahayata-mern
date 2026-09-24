const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { otpLimiter, loginLimiter } = require('../middleware/rateLimit');
const ctrl = require('../controllers/auth.controller');
const { LANGUAGES } = require('../constants');

const router = express.Router();

router.get('/config', ctrl.publicConfig);

router.post(
  '/otp/request',
  otpLimiter,
  [
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('purpose').isIn(['login', 'register']).withMessage('purpose must be login or register'),
    body('language').optional().isIn(LANGUAGES),
  ],
  validate,
  ctrl.requestOtp
);

router.post(
  '/otp/verify',
  loginLimiter,
  [
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('code').matches(/^\d{6}$/).withMessage('OTP must be 6 digits'),
    body('purpose').isIn(['login', 'register']),
    // Registration fields are only required when registering
    body('name').if(body('purpose').equals('register')).trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('state').if(body('purpose').equals('register')).trim().notEmpty().withMessage('State is required'),
    body('district').if(body('purpose').equals('register')).trim().notEmpty().withMessage('District is required'),
    body('village').optional().trim().isLength({ max: 80 }),
    body('language').optional().isIn(LANGUAGES),
  ],
  validate,
  ctrl.verifyOtpAndLogin
);

router.post(
  '/staff/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  ctrl.staffLogin
);

router.get('/me', requireAuth, ctrl.me);

router.patch(
  '/me',
  requireAuth,
  [
    body('name').optional().trim().notEmpty().isLength({ max: 80 }),
    body('village').optional().trim().isLength({ max: 80 }),
    body('language').optional().isIn(LANGUAGES),
    body('farmLocation.latitude').optional().isFloat({ min: -90, max: 90 }).toFloat(),
    body('farmLocation.longitude').optional().isFloat({ min: -180, max: 180 }).toFloat(),
    body('farmLocation.label').optional().trim().isLength({ max: 120 }),
  ],
  validate,
  ctrl.updateMe
);

module.exports = router;

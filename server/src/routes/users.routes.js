const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/users.controller');
const { ROLES } = require('../constants');

const router = express.Router();

// Every route in this file is admin-only
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get(
  '/',
  [query('role').optional().isIn(Object.values(ROLES)), query('district').optional().isString()],
  validate,
  ctrl.listUsers
);

router.post(
  '/staff',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail({ gmail_remove_dots: false }),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn([ROLES.OFFICER, ROLES.ADMIN]).withMessage('role must be officer or admin'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('district').trim().notEmpty().withMessage('District is required'),
    body('phone').optional({ values: 'falsy' }).isString(),
  ],
  validate,
  ctrl.createStaff
);

router.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('isActive').optional().isBoolean().toBoolean(),
    body('district').optional().trim().notEmpty(),
    body('state').optional().trim().notEmpty(),
  ],
  validate,
  ctrl.updateUser
);

module.exports = router;

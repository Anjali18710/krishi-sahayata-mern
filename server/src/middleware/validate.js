const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Put this after a list of express-validator rules in a route.
// If any rule failed, it responds with 400 and a list of { field, message }.
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  throw ApiError.badRequest(details[0].message, 'VALIDATION_ERROR', details);
}

module.exports = validate;

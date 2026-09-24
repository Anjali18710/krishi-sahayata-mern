const mongoose = require('mongoose');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// Runs when no route matched the request.
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

// Express 5 forwards errors from async route handlers here automatically,
// so controllers can simply `throw`.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let body = { error: err.message || 'Something went wrong', code: err.code || 'INTERNAL_ERROR' };
  if (err.details) body.details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { error: `Invalid value for ${err.path}`, code: 'INVALID_ID' };
  } else if (err instanceof multer.MulterError) {
    status = 400;
    const messages = {
      LIMIT_FILE_SIZE: 'Each photo must be 2 MB or smaller',
      LIMIT_FILE_COUNT: 'You can upload at most 3 photos',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
    };
    body = { error: messages[err.code] || err.message, code: err.code };
  } else if (err.code === 11000) {
    status = 409;
    body = { error: 'A record with this value already exists', code: 'DUPLICATE' };
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: 'Request body is not valid JSON', code: 'BAD_JSON' };
  }

  if (status >= 500) {
    console.error(err);
    if (env.isProduction) body = { error: 'Something went wrong', code: 'INTERNAL_ERROR' };
  }

  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };

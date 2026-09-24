// An error that carries an HTTP status code and a short machine-readable code.
// Throw it anywhere in a controller: the error middleware turns it into a JSON response.
class ApiError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code, details) {
    return new ApiError(400, message, code || 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Please log in to continue') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Not found', code) {
    return new ApiError(404, message, code || 'NOT_FOUND');
  }

  static conflict(message, code) {
    return new ApiError(409, message, code || 'CONFLICT');
  }
}

module.exports = ApiError;

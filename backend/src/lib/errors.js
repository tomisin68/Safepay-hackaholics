export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, 'invalid_request', msg, details);
export const unauthorized = (msg = 'Authentication required.') => new ApiError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have access to this resource.') => new ApiError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found.') => new ApiError(404, 'not_found', msg);
export const conflict = (msg, details) => new ApiError(409, 'conflict', msg, details);
export const tooMany = (msg = 'Rate limit exceeded.') => new ApiError(429, 'rate_limited', msg);

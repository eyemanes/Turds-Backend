/**
 * Centralized error handling
 * Provides consistent error responses and logging
 */

import logger from './logger.js';
import config from './config.js';

/**
 * Custom error classes
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Error response formatter
 */
function formatErrorResponse(error, includeStack = false) {
  const response = {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };

  // Add validation errors if present
  if (error.errors && Array.isArray(error.errors)) {
    response.error.errors = error.errors;
  }

  // Add retry-after header for rate limit errors
  if (error.retryAfter) {
    response.error.retryAfter = error.retryAfter;
  }

  // Include stack trace in development
  if (includeStack && config.isDevelopment()) {
    response.error.stack = error.stack;
  }

  return response;
}

/**
 * Express error handling middleware
 */
export function errorHandler(err, req, res, next) {
  // Log the error
  logger.logError(err, `${req.method} ${req.url}`);

  // Default to 500 server error
  let statusCode = err.statusCode || 500;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
  } else if (err.name === 'CastError' || err.name === 'TypeError') {
    statusCode = 400;
  }

  // Set status code
  res.status(statusCode);

  // Set retry-after header for rate limit errors
  if (err.retryAfter) {
    res.setHeader('Retry-After', err.retryAfter);
  }

  // Send error response
  const errorResponse = formatErrorResponse(err, !config.isProduction());
  res.json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Handle unhandled promise rejections
 */
export function handleUnhandledRejections() {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack
    });

    // In production, exit gracefully
    if (config.isProduction()) {
      // Give time to log the error
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      message: error.message,
      stack: error.stack
    });

    // In production, exit gracefully
    if (config.isProduction()) {
      // Give time to log the error
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });
}

/**
 * Firebase error handler
 */
export function handleFirebaseError(error) {
  // Map Firebase errors to app errors
  switch (error.code) {
    case 'auth/invalid-token':
    case 'auth/expired-token':
      return new AuthenticationError('Invalid or expired token');
    
    case 'auth/user-not-found':
      return new NotFoundError('User not found');
    
    case 'auth/insufficient-permission':
      return new AuthorizationError('Insufficient permissions');
    
    case 'resource-exhausted':
      return new RateLimitError('Firebase quota exceeded');
    
    case 'not-found':
      return new NotFoundError('Document not found');
    
    case 'already-exists':
      return new ConflictError('Resource already exists');
    
    case 'invalid-argument':
      return new ValidationError('Invalid input data');
    
    default:
      return new AppError(error.message || 'Firebase operation failed', 500, error.code);
  }
}

/**
 * Solana error handler
 */
export function handleSolanaError(error) {
  // Map Solana errors to app errors
  if (error.message?.includes('Invalid public key')) {
    return new ValidationError('Invalid Solana wallet address');
  }
  
  if (error.message?.includes('Transaction simulation failed')) {
    return new AppError('Transaction failed', 400, 'TRANSACTION_FAILED');
  }
  
  if (error.message?.includes('Blockhash not found')) {
    return new AppError('Network congestion, please retry', 503, 'NETWORK_CONGESTION');
  }
  
  if (error.message?.includes('insufficient funds')) {
    return new AppError('Insufficient SOL balance', 400, 'INSUFFICIENT_FUNDS');
  }

  return new AppError(error.message || 'Blockchain operation failed', 500, 'BLOCKCHAIN_ERROR');
}

/**
 * Input validation error formatter
 */
export function formatValidationErrors(errors) {
  if (!Array.isArray(errors)) {
    return [errors];
  }

  return errors.map(error => {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error.msg) {
      return `${error.param || 'field'}: ${error.msg}`;
    }
    
    return error.message || 'Validation error';
  });
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ConflictError,
  errorHandler,
  asyncHandler,
  handleUnhandledRejections,
  handleFirebaseError,
  handleSolanaError,
  formatValidationErrors
};

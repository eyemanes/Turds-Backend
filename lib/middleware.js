/**
 * Security middleware collection
 * Provides common security checks and validations
 */

import { rateLimit, sanitizeInput } from './cors.js';
import { verifyIdToken, isUserAdmin } from './firebase-init.js';
import logger from './logger.js';

/**
 * Authentication middleware
 * Verifies Firebase ID token
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Missing or invalid authorization header'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!idToken) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Invalid token format'
      });
    }

    // Verify the token
    const decodedToken = await verifyIdToken(idToken);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      claims: decodedToken
    };

    logger.debug('User authenticated', { uid: decodedToken.uid });
    
    if (next) next();
  } catch (error) {
    logger.logError(error, 'Authentication middleware');
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: process.env.NODE_ENV === 'production' ? 
        'Invalid authentication token' : 
        error.message
    });
  }
}

/**
 * Admin authorization middleware
 * Checks if authenticated user has admin privileges
 */
export async function requireAdmin(req, res, next) {
  try {
    // First ensure user is authenticated
    if (!req.user) {
      await requireAuth(req, res, () => {});
      if (!req.user) return; // Auth failed
    }

    // Check admin status
    const isAdmin = await isUserAdmin(req.user.uid);
    
    if (!isAdmin) {
      logger.logSecurityEvent('Unauthorized admin access attempt', {
        uid: req.user.uid,
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress
      });
      
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Admin privileges required'
      });
    }

    req.user.isAdmin = true;
    logger.info('Admin access granted', { uid: req.user.uid });
    
    if (next) next();
  } catch (error) {
    logger.logError(error, 'Admin authorization middleware');
    return res.status(500).json({ 
      error: 'Authorization failed',
      message: 'Unable to verify admin privileges'
    });
  }
}

/**
 * API key validation middleware
 */
export function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKey = process.env.API_KEY;

  if (!validApiKey) {
    logger.error('API_KEY not configured');
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'API key validation not configured'
    });
  }

  if (!apiKey || apiKey !== validApiKey) {
    logger.logSecurityEvent('Invalid API key attempt', {
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress
    });
    
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Valid API key required'
    });
  }

  if (next) next();
}

/**
 * Request validation middleware
 * Validates request body against schema
 */
export function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      
      // Check required fields
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip validation if field is optional and not provided
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }
      
      // Type validation
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
      }
      
      // Length validation
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }
      
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must not exceed ${rules.maxLength} characters`);
      }
      
      // Pattern validation
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} has invalid format`);
      }
      
      // Custom validation
      if (rules.validate && typeof rules.validate === 'function') {
        const validationResult = rules.validate(value);
        if (validationResult !== true) {
          errors.push(validationResult || `${field} validation failed`);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed',
        errors: errors
      });
    }
    
    if (next) next();
  };
}

/**
 * Error handling middleware
 */
export function errorHandler(err, req, res, next) {
  logger.logError(err, 'Unhandled error');
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred'
    });
  }
  
  // Development error response
  return res.status(err.status || 500).json({ 
    error: err.name || 'Error',
    message: err.message,
    stack: err.stack
  });
}

/**
 * Performance monitoring middleware
 */
export function performanceMonitor(req, res, next) {
  const start = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    logger.logPerformance(`${req.method} ${req.url}`, duration, {
      statusCode: res.statusCode,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress
    });
    
    originalEnd.apply(res, args);
  };
  
  if (next) next();
}

/**
 * Security headers middleware
 */
export function securityHeaders(req, res, next) {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://api.mainnet-beta.solana.com https://*.helius-rpc.com"
  );
  
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  if (next) next();
}

/**
 * Combine multiple middleware functions
 */
export function combineMiddleware(...middlewares) {
  return async (req, res, next) => {
    let index = 0;
    
    async function runNext() {
      if (index >= middlewares.length) {
        return next ? next() : undefined;
      }
      
      const middleware = middlewares[index++];
      await middleware(req, res, runNext);
    }
    
    await runNext();
  };
}

// Export commonly used middleware combinations
export const apiMiddleware = combineMiddleware(
  securityHeaders,
  performanceMonitor,
  rateLimit,
  sanitizeInput
);

export const authApiMiddleware = combineMiddleware(
  apiMiddleware,
  requireAuth
);

export const adminApiMiddleware = combineMiddleware(
  apiMiddleware,
  requireAuth,
  requireAdmin
);

export default {
  requireAuth,
  requireAdmin,
  requireApiKey,
  validateRequest,
  errorHandler,
  performanceMonitor,
  securityHeaders,
  combineMiddleware,
  apiMiddleware,
  authApiMiddleware,
  adminApiMiddleware
};

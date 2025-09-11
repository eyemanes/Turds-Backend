/**
 * Secure CORS configuration
 * Only allows specific trusted origins
 */

const ALLOWED_ORIGINS = [
  // Production domains
  'https://turds-nation.vercel.app',
  'https://turds-front-w625.vercel.app',
  'https://turds.nation',
  'https://www.turds.nation',
  
  // Development domains
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin) {
  if (!origin) return false;
  
  // Exact match for production domains
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }
  
  // Allow specific Vercel preview deployments for this project only
  // Pattern: https://turds-[branch]-[hash]-[user].vercel.app
  if (origin.match(/^https:\/\/turds-[a-zA-Z0-9-]+-git-[a-zA-Z0-9-]+-[a-zA-Z0-9-]+\.vercel\.app$/)) {
    return true;
  }
  
  // Allow specific Vercel deployment URLs for this project only
  // Pattern: https://turds-[hash].vercel.app
  if (origin.match(/^https:\/\/turds-[a-zA-Z0-9-]+\.vercel\.app$/)) {
    return true;
  }
  
  return false;
}

/**
 * Set secure CORS headers
 */
function setSecureCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  // Enhanced security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  
  // Strict CORS validation
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin && req.method === 'GET') {
    // Allow simple GET requests without origin (for health checks)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Reject unauthorized origins
    res.setHeader('Access-Control-Allow-Origin', 'null');
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked unauthorized origin: ${origin}`);
    }
  }
  
  // Restrict allowed methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '3600'); // 1 hour
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  
  return false;
}

/**
 * Rate limiting implementation
 */
const rateLimitMap = new Map();

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || 
              req.headers['x-real-ip'] || 
              req.connection?.remoteAddress || 
              'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100; // Max requests per window
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
  } else {
    const limit = rateLimitMap.get(ip);
    
    // Reset window if expired
    if (now - limit.firstRequest > windowMs) {
      rateLimitMap.set(ip, { count: 1, firstRequest: now });
    } else if (limit.count >= maxRequests) {
      res.status(429).json({ 
        error: 'Too many requests', 
        retryAfter: Math.ceil((limit.firstRequest + windowMs - now) / 1000)
      });
      return;
    } else {
      limit.count++;
    }
  }
  
  if (next) next();
}

/**
 * Input sanitization
 */
function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  };
  
  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  
  if (next) next();
}

/**
 * Middleware for Express.js
 */
function corsMiddleware(req, res, next) {
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }
  next();
}

// Clean old rate limit entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    for (const [key, value] of rateLimitMap.entries()) {
      if (now - value.firstRequest > windowMs * 2) {
        rateLimitMap.delete(key);
      }
    }
  }, 60000); // Clean every minute
}

export {
  setSecureCorsHeaders,
  corsMiddleware,
  isOriginAllowed,
  rateLimit,
  sanitizeInput,
  ALLOWED_ORIGINS
};

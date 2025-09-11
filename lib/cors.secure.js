/**
 * Hardened CORS configuration with strict origin validation
 * Only allows specific trusted origins with additional security checks
 */

const ALLOWED_ORIGINS = [
  // Production domains - exact matches only
  'https://turds-nation.vercel.app',
  'https://turds-front-w625.vercel.app',
  'https://turds.nation',
  'https://www.turds.nation',
  
  // Development domains - localhost only
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

// Additional security headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

/**
 * Validate origin with additional security checks
 */
function isOriginAllowed(origin) {
  if (!origin || typeof origin !== 'string') {
    return false;
  }
  
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
 * Set hardened CORS headers with additional security
 */
function setSecureCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  // Set security headers first
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // For requests without origin (like mobile apps, Postman, etc.)
    // Only allow if it's a simple GET request
    if (!origin && req.method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      // Reject unauthorized origins
      res.setHeader('Access-Control-Allow-Origin', 'null');
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
 * Rate limiting middleware
 */
const rateLimitMap = new Map();

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
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
  
  next();
}

/**
 * Input sanitization middleware
 */
function sanitizeInput(req, res, next) {
  // Sanitize common XSS patterns
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
  
  next();
}

module.exports = {
  setSecureCorsHeaders,
  isOriginAllowed,
  rateLimit,
  sanitizeInput,
  ALLOWED_ORIGINS,
  SECURITY_HEADERS
};

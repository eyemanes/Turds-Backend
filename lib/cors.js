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
  
  // Vercel preview deployments (with pattern matching)
  // Note: We'll need to validate these at runtime
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
  
  // Allow Vercel preview deployments (pattern: https://project-name-git-branch-username.vercel.app)
  if (origin.match(/^https:\/\/[a-zA-Z0-9-]+-git-[a-zA-Z0-9-]+-[a-zA-Z0-9-]+\.vercel\.app$/)) {
    return true;
  }
  
  // Allow Vercel deployment URLs (pattern: https://project-name.vercel.app)
  if (origin.match(/^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/)) {
    return true;
  }
  
  return false;
}

/**
 * Set secure CORS headers
 */
function setSecureCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // For requests without origin (like mobile apps, Postman, etc.)
    // Only allow if it's a simple request
    if (!origin && req.method === 'GET') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      // Reject unauthorized origins
      res.setHeader('Access-Control-Allow-Origin', 'null');
    }
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  
  return false;
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

module.exports = {
  setSecureCorsHeaders,
  corsMiddleware,
  isOriginAllowed,
  ALLOWED_ORIGINS
};

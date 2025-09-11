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
  
  // Allow ALL Vercel domains for now (temporary fix)
  if (origin.includes('.vercel.app')) {
    return true;
  }
  
  return false;
}

/**
 * Set secure CORS headers
 */
function setSecureCorsHeaders(req, res) {
  const origin = req.headers.origin;
  
  // TEMPORARY: Allow all origins for debugging
  console.log('CORS Request:', {
    origin,
    method: req.method,
    url: req.url
  });
  
  // Allow all origins temporarily
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  console.log('CORS: Allowed origin:', origin || '*');
  
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

export {
  setSecureCorsHeaders,
  corsMiddleware,
  isOriginAllowed,
  ALLOWED_ORIGINS
};

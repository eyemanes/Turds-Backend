// Simple CORS test endpoint
import { setSecureCorsHeaders } from '../lib/cors.js';

export default async function handler(req, res) {
  console.log('CORS Test - Request received:', {
    origin: req.headers.origin,
    method: req.method,
    url: req.url
  });

  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  res.status(200).json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
}

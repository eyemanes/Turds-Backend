import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setSecureCorsHeaders } from '../lib/cors.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  return res.status(200).json({
    success: true,
    message: 'TURDS Nation Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      test: '/api/test',
      tokenBalance: '/api/token-balance',
      verifyHolding: '/api/verify-holding',
      admin: {
        login: '/api/admin/login',
        announcements: '/api/admin/announcements'
      }
    },
    timestamp: new Date().toISOString()
  })
}

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
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

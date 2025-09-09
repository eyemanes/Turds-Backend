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
    message: 'TURDS Nation API Test Endpoint',
    timestamp: new Date().toISOString(),
    method: req.method,
    query: req.query,
    headers: {
      'user-agent': req.headers['user-agent'],
      'host': req.headers['host']
    }
  })
}

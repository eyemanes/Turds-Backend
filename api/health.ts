import type { VercelRequest, VercelResponse } from '@vercel/node'
import { solanaService } from '../lib/solana.js'
import { setSecureCorsHeaders } from '../lib/cors.js'


export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Test Solana connection
    const isConnected = await solanaService.testConnection()

    return res.status(200).json({
      success: true,
      status: 'TUR Nation Backend API',
      version: '1.0.0',
      solanaConnection: isConnected,
      timestamp: Date.now(),
      endpoints: {
        tokenBalance: '/api/token-balance',
        verifyHolding: '/api/verify-holding',
        health: '/api/health'
      }
    })

  } catch (error) {
    console.error('Health check error:', error)
    
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

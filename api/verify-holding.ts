import type { VercelRequest, VercelResponse } from '@vercel/node'
import { solanaService } from '../lib/solana.js'
import { firebaseService } from '../lib/firebase.js'
import { setSecureCorsHeaders } from '../lib/cors.js'


interface VerifyRequest {
  walletAddress: string
  mintAddress: string
  minimumAmount: number
  uid?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { walletAddress, mintAddress, minimumAmount, uid }: VerifyRequest = req.body

    if (!walletAddress || !mintAddress || minimumAmount === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters: walletAddress, mintAddress, and minimumAmount'
      })
    }

    // Verify token holding
    const isVerified = await solanaService.verifyTokenHolding(
      walletAddress,
      mintAddress,
      minimumAmount
    )

    // Get actual balance for logging
    const tokenBalance = await solanaService.getTokenBalance(walletAddress, mintAddress)
    const actualBalance = tokenBalance ? parseInt(tokenBalance.balance) : 0

    // Log verification attempt
    if (uid) {
      try {
        await firebaseService.logBalanceCheck(uid, walletAddress, actualBalance)
        await firebaseService.updateTokenBalance(uid, actualBalance)
      } catch (error) {
        console.error('Error logging verification:', error)
      }
    }

    return res.status(200).json({
      success: true,
      verified: isVerified,
      actualBalance,
      minimumRequired: minimumAmount,
      meetsRequirement: actualBalance >= minimumAmount,
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Token verification API error:', error)
    
    return res.status(500).json({
      error: 'Failed to verify token holding',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

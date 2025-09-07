import type { VercelRequest, VercelResponse } from '@vercel/node'
import { solanaService } from '../lib/solana'
import { firebaseService } from '../lib/firebase'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

interface TokenBalanceRequest {
  walletAddress: string
  mintAddress: string
  uid?: string // User ID for logging
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({}).end()
  }

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { walletAddress, mintAddress, uid }: TokenBalanceRequest = req.body

    if (!walletAddress || !mintAddress) {
      return res.status(400).json({
        error: 'Missing required parameters: walletAddress and mintAddress'
      })
    }

    // Get token balance from Solana
    const tokenBalance = await solanaService.getTokenBalance(walletAddress, mintAddress)

    if (!tokenBalance) {
      return res.status(404).json({
        error: 'Token balance not found',
        balance: '0',
        decimals: 0,
        uiAmount: 0
      })
    }

    // Log the balance check for audit (if uid provided)
    if (uid) {
      try {
        await firebaseService.logBalanceCheck(
          uid, 
          walletAddress, 
          parseInt(tokenBalance.balance)
        )
        
        // Update user profile with latest balance
        await firebaseService.updateTokenBalance(uid, parseInt(tokenBalance.balance))
      } catch (error) {
        console.error('Error logging balance check:', error)
        // Continue anyway - the balance fetch succeeded
      }
    }

    return res.status(200).json({
      success: true,
      ...tokenBalance,
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Token balance API error:', error)
    
    return res.status(500).json({
      error: 'Failed to fetch token balance',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

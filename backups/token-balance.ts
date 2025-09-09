import type { VercelRequest, VercelResponse } from '@vercel/node'

// CORS headers - must be set for ALL responses including OPTIONS
const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}

interface TokenBalanceRequest {
  walletAddress: string
  mintAddress: string
  uid?: string // User ID for logging
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for ALL requests
  setCorsHeaders(res)
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { walletAddress, mintAddress, uid }: TokenBalanceRequest = req.body

    if (!walletAddress || !mintAddress) {
      return res.status(400).json({
        error: 'Missing required parameters: walletAddress and mintAddress',
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: false
      })
    }

    console.log('Token balance request:', { walletAddress, mintAddress })

    // Check if the wallet address is a Solana address (base58 format)
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)
    
    if (!isSolanaAddress) {
      console.log('Invalid Solana address format:', walletAddress)
      return res.status(200).json({
        error: 'Not a valid Solana address',
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: false
      })
    }

    // Try to import solanaService
    let tokenBalance = null
    try {
      const { solanaService } = await import('../lib/solana')
      tokenBalance = await solanaService.getTokenBalance(walletAddress, mintAddress)
    } catch (importError) {
      console.error('Error importing solanaService:', importError)
      // Return mock data if service is not available
      return res.status(200).json({
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: true,
        mock: true,
        message: 'Solana service temporarily unavailable'
      })
    }

    if (!tokenBalance) {
      return res.status(200).json({
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: true,
        message: 'No tokens found for this wallet'
      })
    }

    // Log the balance check for audit (if uid provided)
    if (uid) {
      try {
        const { firebaseService } = await import('../lib/firebase')
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
    
    return res.status(200).json({
      error: 'Failed to fetch token balance',
      message: error instanceof Error ? error.message : 'Unknown error',
      balance: '0',
      decimals: 9,
      uiAmount: 0,
      success: false
    })
  }
}

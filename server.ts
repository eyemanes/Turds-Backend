import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { solanaService } from './lib/solana.js'
import { firebaseService } from './lib/firebase.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}))
app.use(express.json())

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test Solana connection
    const isConnected = await solanaService.testConnection()

    res.json({
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
    
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Token balance endpoint
app.post('/api/token-balance', async (req, res) => {
  try {
    const { walletAddress, mintAddress, uid } = req.body

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

    res.json({
      success: true,
      ...tokenBalance,
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Token balance API error:', error)
    
    res.status(500).json({
      error: 'Failed to fetch token balance',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Verify holding endpoint
app.post('/api/verify-holding', async (req, res) => {
  try {
    const { walletAddress, mintAddress, minimumAmount, uid } = req.body

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

    res.json({
      success: true,
      verified: isVerified,
      actualBalance,
      minimumRequired: minimumAmount,
      meetsRequirement: actualBalance >= minimumAmount,
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Token verification API error:', error)
    
    res.status(500).json({
      error: 'Failed to verify token holding',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'POST /api/token-balance', 
      'POST /api/verify-holding'
    ]
  })
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TUR Nation Backend running on http://localhost:${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`)
  console.log(`🔗 CORS enabled for: http://localhost:3000`)
})

export default app

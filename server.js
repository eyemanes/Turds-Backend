const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

// Helius API service
class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY || 'c7b0f426-1bdf-4e60-a379-401076cfcf8a';
    this.baseUrl = 'https://api.helius.xyz/v0';
  }

  async getTokenBalance(walletAddress, mintAddress) {
    try {
      console.log(`[Backend Helius] Checking balance for ${walletAddress}, mint: ${mintAddress}`);
      
      const response = await fetch(`${this.baseUrl}/addresses/${walletAddress}/balances?api-key=${this.apiKey}`);
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const tokenAccount = data.tokens?.find(token => token.mint === mintAddress);
      
      if (!tokenAccount) {
        return {
          balance: '0',
          decimals: 6,
          uiAmount: 0,
          mint: mintAddress
        };
      }

      return {
        balance: tokenAccount.amount || '0',
        decimals: tokenAccount.decimals || 6,
        uiAmount: parseFloat(tokenAccount.amount || '0') / Math.pow(10, tokenAccount.decimals || 6),
        mint: mintAddress
      };

    } catch (error) {
      console.error('[Backend Helius] Error:', error);
      throw error;
    }
  }

  async verifyTokenHolding(walletAddress, mintAddress, minimumAmount) {
    try {
      const tokenData = await this.getTokenBalance(walletAddress, mintAddress);
      const balance = parseInt(tokenData.balance || '0');
      return balance >= minimumAmount;
    } catch (error) {
      console.error('[Backend Helius] Verification error:', error);
      return false;
    }
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.baseUrl}/addresses/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/balances?api-key=${this.apiKey}`);
      return response.ok;
    } catch (error) {
      console.error('[Backend Helius] Connection test failed:', error);
      return false;
    }
  }
}

const heliusService = new HeliusService();

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const heliusConnected = await heliusService.testConnection();

    res.json({
      success: true,
      status: 'TURDS Nation Backend API',
      version: '2.0.0',
      heliusConnection: heliusConnected,
      timestamp: Date.now(),
      endpoints: {
        tokenBalance: '/api/token-balance',
        verifyHolding: '/api/verify-holding',
        holdings: '/api/holdings',
        health: '/api/health'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message || 'Unknown error'
    });
  }
});

// Token balance endpoint
app.post('/api/token-balance', async (req, res) => {
  try {
    const { walletAddress, mintAddress, uid } = req.body;

    if (!walletAddress || !mintAddress) {
      return res.status(400).json({
        error: 'Missing required parameters: walletAddress and mintAddress'
      });
    }

    console.log(`[API] Token balance request for ${walletAddress}`);

    const tokenBalance = await heliusService.getTokenBalance(walletAddress, mintAddress);

    res.json({
      success: true,
      ...tokenBalance,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Token balance API error:', error);
    
    res.status(500).json({
      error: 'Failed to fetch token balance',
      message: error.message || 'Unknown error'
    });
  }
});

// Holdings endpoint (new - matches your flow)
app.get('/api/holdings', async (req, res) => {
  try {
    const { owner, mint } = req.query;

    if (!owner || !mint) {
      return res.status(400).json({
        error: 'Missing required parameters: owner and mint'
      });
    }

    console.log(`[API] Holdings check for owner=${owner}, mint=${mint}`);

    const tokenData = await heliusService.getTokenBalance(owner, mint);
    const balance = parseInt(tokenData.balance || '0');
    
    // Define thresholds
    const voteThreshold = parseInt(process.env.VOTE_MIN_HOLD || '1000000');
    const electionThreshold = parseInt(process.env.ELECTION_MIN_HOLD || '5000000');
    const adminThreshold = parseInt(process.env.ADMIN_MIN_HOLD || '10000000');

    res.json({
      success: true,
      owner,
      mint,
      hasToken: balance > 0,
      balance: tokenData.balance,
      uiAmount: tokenData.uiAmount,
      decimals: tokenData.decimals,
      permissions: {
        canVote: balance >= voteThreshold,
        canRunForOffice: balance >= electionThreshold,
        canAdmin: balance >= adminThreshold
      },
      thresholds: {
        vote: voteThreshold,
        election: electionThreshold,
        admin: adminThreshold
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Holdings API error:', error);
    
    res.status(500).json({
      error: 'Failed to check holdings',
      message: error.message || 'Unknown error'
    });
  }
});

// Verify holding endpoint
app.post('/api/verify-holding', async (req, res) => {
  try {
    const { walletAddress, mintAddress, minimumAmount, uid } = req.body;

    if (!walletAddress || !mintAddress || minimumAmount === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters: walletAddress, mintAddress, and minimumAmount'
      });
    }

    console.log(`[API] Verify holding request for ${walletAddress}, minimum: ${minimumAmount}`);

    const isVerified = await heliusService.verifyTokenHolding(
      walletAddress,
      mintAddress,
      minimumAmount
    );

    const tokenBalance = await heliusService.getTokenBalance(walletAddress, mintAddress);
    const actualBalance = parseInt(tokenBalance.balance || '0');

    res.json({
      success: true,
      verified: isVerified,
      actualBalance,
      minimumRequired: minimumAmount,
      meetsRequirement: actualBalance >= minimumAmount,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Token verification API error:', error);
    
    res.status(500).json({
      error: 'Failed to verify token holding',
      message: error.message || 'Unknown error'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/holdings?owner=<address>&mint=<mint>',
      'POST /api/token-balance', 
      'POST /api/verify-holding'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TURDS Nation Backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 CORS enabled for: http://localhost:3000`);
  console.log(`🪙 Helius API integration enabled`);
  console.log(`💰 Holdings endpoint: GET /api/holdings?owner=<addr>&mint=<mint>`);
});

module.exports = app;

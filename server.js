// Simplified server for Vercel deployment
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Simple CORS - allow all Vercel deployments
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin
    if (!origin) return callback(null, true);
    
    // Allow all localhost
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow all Vercel deployments
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // Allow production domains
    if (origin.includes('turds.nation') || origin.includes('turds-nation')) {
      return callback(null, true);
    }
    
    // Log but allow for now to debug
    console.log(`CORS request from: ${origin} - allowing`);
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Validators
const isValidSolanaAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

// Helius Service with timeout handling
class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY;
    this.baseUrl = 'https://api.helius.xyz/v0';
    this.cache = new Map();
    this.cacheTimeout = 30000; // 30 seconds cache
  }

  getCacheKey(walletAddress, mintAddress) {
    return `${walletAddress}:${mintAddress}`;
  }

  async getTokenBalance(walletAddress, mintAddress) {
    if (!this.apiKey) {
      console.error('HELIUS_API_KEY not configured');
      // Return mock data if no API key
      return {
        balance: '0',
        decimals: 6,
        uiAmount: 0,
        mint: mintAddress
      };
    }

    if (!isValidSolanaAddress(walletAddress) || !isValidSolanaAddress(mintAddress)) {
      throw new Error('Invalid address format');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(walletAddress, mintAddress);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('Returning cached balance');
      return cached.data;
    }

    try {
      // Use shorter timeout for Vercel (8 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(
        `${this.baseUrl}/addresses/${walletAddress}/balances?api-key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TURDS-Backend/2.0'
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data = await response.json();
      const tokenAccount = data.tokens?.find(token => token.mint === mintAddress);
      
      const result = {
        balance: tokenAccount?.amount || '0',
        decimals: tokenAccount?.decimals || 6,
        uiAmount: parseFloat(tokenAccount?.amount || '0') / Math.pow(10, tokenAccount?.decimals || 6),
        mint: mintAddress
      };

      // Cache result
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      // Clean old cache entries
      if (this.cache.size > 100) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }

      return result;
    } catch (error) {
      console.error('[Helius] Error:', error.message);
      
      // If timeout, return cached data if available (even if expired)
      if (error.name === 'AbortError' && cached) {
        console.log('Timeout - returning stale cache');
        return cached.data;
      }
      
      // Return default data on error
      return {
        balance: '0',
        decimals: 6,
        uiAmount: 0,
        mint: mintAddress
      };
    }
  }
}

const heliusService = new HeliusService();

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'TURDS Backend API',
    version: '2.1.0',
    timestamp: Date.now()
  });
});

// Token balance endpoint - optimized for Vercel
app.post('/api/token-balance', async (req, res) => {
  try {
    const { walletAddress, mintAddress } = req.body;

    if (!walletAddress || !mintAddress) {
      return res.status(400).json({
        error: 'Missing required parameters'
      });
    }

    console.log(`Token balance request: ${walletAddress.substring(0, 8)}...`);

    const tokenBalance = await heliusService.getTokenBalance(walletAddress, mintAddress);

    res.json({
      success: true,
      ...tokenBalance,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Token balance error:', error);
    res.status(500).json({
      error: 'Failed to fetch token balance',
      success: false,
      balance: '0',
      decimals: 6,
      uiAmount: 0
    });
  }
});

// Holdings endpoint
app.get('/api/holdings', async (req, res) => {
  try {
    const { owner, mint } = req.query;

    if (!owner || !mint) {
      return res.status(400).json({
        error: 'Missing parameters'
      });
    }

    const tokenData = await heliusService.getTokenBalance(owner, mint);
    const balance = parseInt(tokenData.balance || '0');

    res.json({
      success: true,
      owner,
      mint,
      hasToken: balance > 0,
      balance: tokenData.balance,
      uiAmount: tokenData.uiAmount,
      decimals: tokenData.decimals,
      permissions: {
        canVote: balance >= 1000000,
        canRunForOffice: balance >= 5000000,
        canAdmin: balance >= 10000000
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Holdings error:', error);
    res.status(500).json({
      error: 'Failed to check holdings'
    });
  }
});

// Verify holding endpoint
app.post('/api/verify-holding', async (req, res) => {
  try {
    const { walletAddress, mintAddress, minimumAmount } = req.body;

    if (!walletAddress || !mintAddress || minimumAmount === undefined) {
      return res.status(400).json({
        error: 'Missing parameters'
      });
    }

    const tokenData = await heliusService.getTokenBalance(walletAddress, mintAddress);
    const balance = parseInt(tokenData.balance || '0');
    const verified = balance >= minimumAmount;

    res.json({
      success: true,
      verified,
      actualBalance: balance,
      minimumRequired: minimumAmount,
      meetsRequirement: verified,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Verify holding error:', error);
    res.status(500).json({
      error: 'Failed to verify holding'
    });
  }
});

// User endpoint placeholder
app.get('/api/user', (req, res) => {
  const { action, userId } = req.query;
  
  // Return mock data for now
  res.json({
    success: true,
    user: {
      id: userId,
      twitterFollowers: 1500, // Mock followers
      twitterVerified: true,
      walletAddress: null
    }
  });
});

// Candidates endpoint placeholder
app.get('/api/candidates', (req, res) => {
  res.json({
    success: true,
    candidates: [] // Empty array for now
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// For local testing only
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;

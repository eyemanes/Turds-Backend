const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { query, body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security Configuration
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Rate limit exceeded for this operation'
});

app.use('/api/', apiLimiter);
app.use('/api/verify-holding', strictLimiter);

// CORS Configuration for Vercel deployment
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://turds-nation.vercel.app',
  'https://turds-front.vercel.app',
  'https://turds.nation'
];

// Add dynamic origins from environment
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}
if (process.env.ALLOWED_ORIGINS) {
  const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  allowedOrigins.push(...envOrigins);
}

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input validation helper
const isValidSolanaAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

// Custom validation middleware
const validateSolanaAddress = (field) => {
  return body(field).custom((value) => {
    if (!isValidSolanaAddress(value)) {
      throw new Error(`Invalid Solana address for ${field}`);
    }
    return true;
  });
};

const validateQueryAddress = (field) => {
  return query(field).custom((value) => {
    if (!isValidSolanaAddress(value)) {
      throw new Error(`Invalid Solana address for ${field}`);
    }
    return true;
  });
};

// Helius API service
class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY;
    if (!this.apiKey) {
      console.error('CRITICAL: HELIUS_API_KEY not configured in environment variables');
      // Don't throw in constructor for Vercel, handle per request
    }
    this.baseUrl = 'https://api.helius.xyz/v0';
  }

  async getTokenBalance(walletAddress, mintAddress) {
    // Runtime check for API key
    if (!this.apiKey) {
      throw new Error('Helius API key not configured');
    }

    // Validate inputs
    if (!isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid wallet address format');
    }
    if (!isValidSolanaAddress(mintAddress)) {
      throw new Error('Invalid mint address format');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/addresses/${walletAddress}/balances?api-key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TURDS-Backend/2.0'
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        }
      );
      
      if (!response.ok) {
        console.error(`Helius API error: ${response.status} ${response.statusText}`);
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data = await response.json();
      const tokenAccount = data.tokens?.find(token => token.mint === mintAddress);
      
      if (!tokenAccount) {
        return {
          balance: '0',
          decimals: 9,
          uiAmount: 0,
          mint: mintAddress
        };
      }

      return {
        balance: tokenAccount.amount || '0',
        decimals: tokenAccount.decimals || 9,
        uiAmount: parseFloat(tokenAccount.amount || '0') / Math.pow(10, tokenAccount.decimals || 9),
        mint: mintAddress
      };

    } catch (error) {
      console.error('[Helius] Error:', error.message);
      throw error;
    }
  }

  async verifyTokenHolding(walletAddress, mintAddress, minimumAmount) {
    try {
      const tokenData = await this.getTokenBalance(walletAddress, mintAddress);
      const balance = parseInt(tokenData.balance || '0');
      return balance >= minimumAmount;
    } catch (error) {
      console.error('[Helius] Verification error:', error);
      return false;
    }
  }

  async testConnection() {
    if (!this.apiKey) return false;
    
    try {
      // Test with USDC mint address
      const response = await fetch(
        `${this.baseUrl}/addresses/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/balances?api-key=${this.apiKey}`,
        {
          signal: AbortSignal.timeout(5000)
        }
      );
      return response.ok;
    } catch (error) {
      console.error('[Helius] Connection test failed:', error);
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
      environment: process.env.NODE_ENV || 'development',
      heliusConnection: heliusConnected,
      timestamp: Date.now(),
      endpoints: {
        tokenBalance: 'POST /api/token-balance',
        verifyHolding: 'POST /api/verify-holding',
        holdings: 'GET /api/holdings',
        health: 'GET /api/health'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      timestamp: Date.now()
    });
  }
});

// Token balance endpoint with validation
app.post('/api/token-balance',
  [
    validateSolanaAddress('walletAddress'),
    validateSolanaAddress('mintAddress')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { walletAddress, mintAddress } = req.body;

      console.log(`[API] Token balance request for ${walletAddress.substring(0, 8)}...`);

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
        message: process.env.NODE_ENV === 'development' ? error.message : 'Service temporarily unavailable'
      });
    }
  }
);

// Holdings endpoint with validation
app.get('/api/holdings',
  [
    validateQueryAddress('owner'),
    validateQueryAddress('mint')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { owner, mint } = req.query;

      console.log(`[API] Holdings check for owner=${owner.substring(0, 8)}...`);

      const tokenData = await heliusService.getTokenBalance(owner, mint);
      const balance = parseInt(tokenData.balance || '0');
      
      // Define thresholds (use environment variables or defaults)
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
        message: process.env.NODE_ENV === 'development' ? error.message : 'Service temporarily unavailable'
      });
    }
  }
);

// Verify holding endpoint with validation
app.post('/api/verify-holding',
  [
    validateSolanaAddress('walletAddress'),
    validateSolanaAddress('mintAddress'),
    body('minimumAmount').isNumeric().withMessage('minimumAmount must be a number')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { walletAddress, mintAddress, minimumAmount } = req.body;

      console.log(`[API] Verify holding for ${walletAddress.substring(0, 8)}...`);

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
        message: process.env.NODE_ENV === 'development' ? error.message : 'Service temporarily unavailable'
      });
    }
  }
);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/holdings?owner=<address>&mint=<mint>',
      'POST /api/token-balance', 
      'POST /api/verify-holding'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      error: 'Internal server error',
      timestamp: Date.now()
    });
  } else {
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack,
      timestamp: Date.now()
    });
  }
});

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 TURDS Nation Backend running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 Security: Helmet + Rate Limiting + CORS enabled`);
    console.log(`✅ Input validation: Enabled`);
    console.log(`🪙 Helius API: ${process.env.HELIUS_API_KEY ? 'Configured' : 'NOT CONFIGURED'}`);
  });
}

module.exports = app;

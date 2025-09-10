// Consolidated and optimized server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { query, body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ===========================================
// CONFIGURATION & CONSTANTS
// ===========================================
const CONFIG = {
  cors: {
    origins: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'https://turds-nation.vercel.app',
      'https://turds-front.vercel.app',
      'https://turds-front-w625.vercel.app',
      'https://turds.nation',
      process.env.FRONTEND_URL,
      ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || [])
    ].filter(Boolean)
  },
  rateLimits: {
    general: { windowMs: 15 * 60 * 1000, max: 100 },
    strict: { windowMs: 15 * 60 * 1000, max: 20 },
    auth: { windowMs: 15 * 60 * 1000, max: 5 }
  },
  thresholds: {
    vote: parseInt(process.env.VOTE_MIN_HOLD || '1000000'),
    election: parseInt(process.env.ELECTION_MIN_HOLD || '5000000'),
    admin: parseInt(process.env.ADMIN_MIN_HOLD || '10000000')
  }
};

// ===========================================
// UTILITIES & VALIDATORS
// ===========================================
const validators = {
  isValidSolanaAddress: (address) => {
    if (!address || typeof address !== 'string') return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  },
  
  solanaAddressBody: (field) => 
    body(field).custom((value) => {
      if (!validators.isValidSolanaAddress(value)) {
        throw new Error(`Invalid Solana address for ${field}`);
      }
      return true;
    }),
  
  solanaAddressQuery: (field) => 
    query(field).custom((value) => {
      if (!validators.isValidSolanaAddress(value)) {
        throw new Error(`Invalid Solana address for ${field}`);
      }
      return true;
    })
};

// ===========================================
// SECURITY MIDDLEWARE
// ===========================================
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CONFIG.cors.origins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate Limiting
const createRateLimiter = (config) => rateLimit({
  ...config,
  message: config.message || 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const rateLimiters = {
  general: createRateLimiter(CONFIG.rateLimits.general),
  strict: createRateLimiter(CONFIG.rateLimits.strict),
  auth: createRateLimiter({ ...CONFIG.rateLimits.auth, skipSuccessfulRequests: true })
};

app.use('/api/', rateLimiters.general);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================
// HELIUS SERVICE (with caching)
// ===========================================
class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY;
    this.baseUrl = 'https://api.helius.xyz/v0';
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 60000; // 1 minute cache
  }

  getCacheKey(walletAddress, mintAddress) {
    return `${walletAddress}:${mintAddress}`;
  }

  async getTokenBalance(walletAddress, mintAddress) {
    if (!this.apiKey) {
      throw new Error('Helius API key not configured');
    }

    if (!validators.isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid wallet address format');
    }
    if (!validators.isValidSolanaAddress(mintAddress)) {
      throw new Error('Invalid mint address format');
    }

    // Check cache
    const cacheKey = this.getCacheKey(walletAddress, mintAddress);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
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
          signal: AbortSignal.timeout(10000)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data = await response.json();
      const tokenAccount = data.tokens?.find(token => token.mint === mintAddress);
      
      const result = {
        balance: tokenAccount?.amount || '0',
        decimals: tokenAccount?.decimals || 9,
        uiAmount: parseFloat(tokenAccount?.amount || '0') / Math.pow(10, tokenAccount?.decimals || 9),
        mint: mintAddress
      };

      // Cache result
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      // Clean old cache entries
      if (this.cache.size > 1000) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }

      return result;
    } catch (error) {
      console.error('[Helius] Error:', error.message);
      throw error;
    }
  }

  async verifyTokenHolding(walletAddress, mintAddress, minimumAmount) {
    try {
      const tokenData = await this.getTokenBalance(walletAddress, mintAddress);
      const balance = parseInt(tokenData.balance || '0');
      return { verified: balance >= minimumAmount, tokenData };
    } catch (error) {
      console.error('[Helius] Verification error:', error);
      return { verified: false, tokenData: null };
    }
  }

  async testConnection() {
    if (!this.apiKey) return false;
    
    try {
      const response = await fetch(
        `${this.baseUrl}/addresses/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/balances?api-key=${this.apiKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      return response.ok;
    } catch (error) {
      console.error('[Helius] Connection test failed:', error);
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

const heliusService = new HeliusService();

// ===========================================
// ERROR HANDLING UTILITIES
// ===========================================
const handleError = (res, error, customMessage = null) => {
  console.error(error);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  const message = customMessage || 'Service temporarily unavailable';
  
  res.status(500).json({
    error: message,
    ...(isDevelopment && { details: error.message, stack: error.stack }),
    timestamp: Date.now()
  });
};

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      errors: errors.array() 
    });
  }
  return null;
};

// ===========================================
// API ROUTES
// ===========================================

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    const heliusConnected = await heliusService.testConnection();

    res.json({
      success: true,
      status: 'TURDS Nation Backend API',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      heliusConnection: heliusConnected,
      cacheSize: heliusService.cache.size,
      timestamp: Date.now(),
      endpoints: {
        tokenBalance: 'POST /api/token-balance',
        verifyHolding: 'POST /api/verify-holding',
        holdings: 'GET /api/holdings',
        health: 'GET /api/health'
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      timestamp: Date.now()
    });
  }
});

// Token Balance Endpoint
app.post('/api/token-balance',
  [
    validators.solanaAddressBody('walletAddress'),
    validators.solanaAddressBody('mintAddress')
  ],
  async (req, res) => {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    try {
      const { walletAddress, mintAddress } = req.body;
      const tokenBalance = await heliusService.getTokenBalance(walletAddress, mintAddress);

      res.json({
        success: true,
        ...tokenBalance,
        timestamp: Date.now()
      });
    } catch (error) {
      handleError(res, error, 'Failed to fetch token balance');
    }
  }
);

// Holdings Endpoint
app.get('/api/holdings',
  [
    validators.solanaAddressQuery('owner'),
    validators.solanaAddressQuery('mint')
  ],
  async (req, res) => {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    try {
      const { owner, mint } = req.query;
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
          canVote: balance >= CONFIG.thresholds.vote,
          canRunForOffice: balance >= CONFIG.thresholds.election,
          canAdmin: balance >= CONFIG.thresholds.admin
        },
        thresholds: CONFIG.thresholds,
        timestamp: Date.now()
      });
    } catch (error) {
      handleError(res, error, 'Failed to check holdings');
    }
  }
);

// Verify Holding Endpoint (Optimized)
app.post('/api/verify-holding',
  rateLimiters.strict,
  [
    validators.solanaAddressBody('walletAddress'),
    validators.solanaAddressBody('mintAddress'),
    body('minimumAmount').isNumeric().withMessage('minimumAmount must be a number')
  ],
  async (req, res) => {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    try {
      const { walletAddress, mintAddress, minimumAmount } = req.body;
      
      // Single call to verify and get balance
      const { verified, tokenData } = await heliusService.verifyTokenHolding(
        walletAddress,
        mintAddress,
        minimumAmount
      );

      if (!tokenData) {
        throw new Error('Unable to fetch token data');
      }

      const actualBalance = parseInt(tokenData.balance || '0');

      res.json({
        success: true,
        verified,
        actualBalance,
        minimumRequired: minimumAmount,
        meetsRequirement: actualBalance >= minimumAmount,
        timestamp: Date.now()
      });
    } catch (error) {
      handleError(res, error, 'Failed to verify token holding');
    }
  }
);

// Admin Cache Clear Endpoint
app.post('/api/admin/clear-cache',
  rateLimiters.auth,
  (req, res) => {
    // Add proper authentication here
    heliusService.clearCache();
    res.json({ 
      success: true, 
      message: 'Cache cleared',
      timestamp: Date.now()
    });
  }
);

// 404 Handler
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

// Global Error Handler
app.use((err, req, res, next) => {
  handleError(res, err, 'Internal server error');
});

// ===========================================
// SERVER STARTUP
// ===========================================
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`
🚀 TURDS Nation Backend
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔒 Security: Helmet + Rate Limiting + CORS
✅ Validation: Enabled
💾 Caching: Enabled (1 min TTL)
🪙 Helius: ${process.env.HELIUS_API_KEY ? 'Connected' : 'NOT CONFIGURED'}
    `.trim());
  });
}

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing HTTP server');
  heliusService.clearCache();
  process.exit(0);
});

module.exports = app;

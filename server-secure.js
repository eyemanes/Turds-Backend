import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body, validationResult, param, query } from 'express-validator';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security: Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'SESSION_SECRET',
  'ADMIN_PASSWORD',
  'HELIUS_API_KEY',
  'ALLOWED_ORIGINS'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`CRITICAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS Configuration - No wildcards
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true
});

app.use('/api/', limiter);
app.use('/api/admin/login', authLimiter);

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000, // 1 hour
    sameSite: 'strict'
  }
}));

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input Sanitization Middleware
const sanitizeInput = (req, res, next) => {
  // Recursively clean all string inputs
  const clean = (obj) => {
    if (typeof obj === 'string') {
      // Remove any script tags or dangerous patterns
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      for (let key in obj) {
        obj[key] = clean(obj[key]);
      }
    }
    return obj;
  };
  
  req.body = clean(req.body);
  req.query = clean(req.query);
  req.params = clean(req.params);
  next();
};

app.use(sanitizeInput);

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// Admin Authentication Middleware
const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Admin access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access denied. Insufficient privileges.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired admin token.' });
  }
};

// Secure Helius Service
class HeliusService {
  constructor() {
    this.apiKey = process.env.HELIUS_API_KEY;
    if (!this.apiKey) {
      throw new Error('HELIUS_API_KEY is not configured');
    }
    this.baseUrl = 'https://api.helius.xyz/v0';
  }

  async getTokenBalance(walletAddress, mintAddress) {
    // Validate inputs
    if (!this.isValidSolanaAddress(walletAddress)) {
      throw new Error('Invalid wallet address format');
    }
    if (!this.isValidSolanaAddress(mintAddress)) {
      throw new Error('Invalid mint address format');
    }

    try {
      console.log(`[Helius] Checking balance for wallet: ${walletAddress.substring(0, 8)}...`);
      
      const response = await fetch(
        `${this.baseUrl}/addresses/${walletAddress}/balances?api-key=${this.apiKey}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'TURDS-Backend/1.0'
          },
          timeout: 10000
        }
      );
      
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data = await response.json();
      const tokenAccount = data.tokens?.find(token => token.mint === mintAddress);
      
      return {
        balance: tokenAccount?.amount || '0',
        decimals: tokenAccount?.decimals || 9,
        uiAmount: parseFloat(tokenAccount?.amount || '0') / Math.pow(10, tokenAccount?.decimals || 9),
        mint: mintAddress
      };
    } catch (error) {
      console.error('[Helius] Error:', error.message);
      throw error;
    }
  }

  isValidSolanaAddress(address) {
    // Solana addresses are base58 encoded and typically 32-44 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
  }
}

const heliusService = new HeliusService();

// API Routes with Validation

// Admin Login with proper security
app.post('/api/admin/login', 
  authLimiter,
  [
    body('username').isString().trim().isLength({ min: 3, max: 50 }),
    body('password').isString().isLength({ min: 8, max: 100 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;
    
    try {
      // In production, store hashed passwords in database
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      
      if (username !== adminUsername) {
        // Don't reveal if username exists
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // For now, comparing with env variable - in production use database
      const isValidPassword = password === process.env.ADMIN_PASSWORD;
      
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { 
          username: adminUsername, 
          role: 'admin',
          loginTime: new Date().toISOString()
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      // Log successful admin login
      console.log(`[SECURITY] Admin login successful for user: ${username} at ${new Date().toISOString()}`);
      
      res.json({ 
        success: true,
        token,
        expiresIn: 3600
      });
    } catch (error) {
      console.error('[SECURITY] Admin login error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
);

// Token Balance Endpoint with validation
app.get('/api/token-balance/:walletAddress',
  [
    param('walletAddress').matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    query('mintAddress').optional().matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { walletAddress } = req.params;
      const mintAddress = req.query.mintAddress || process.env.DEFAULT_TOKEN_MINT;
      
      const balance = await heliusService.getTokenBalance(walletAddress, mintAddress);
      res.json(balance);
    } catch (error) {
      console.error('[API] Token balance error:', error);
      res.status(500).json({ error: 'Failed to fetch token balance' });
    }
  }
);

// Protected Admin Routes
app.use('/api/admin/*', authenticateAdmin);

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  
  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'An error occurred processing your request' });
  } else {
    res.status(500).json({ 
      error: err.message,
      stack: err.stack 
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
  console.log(`[SECURITY] Environment: ${process.env.NODE_ENV}`);
  console.log(`[SECURITY] CORS Origins: ${allowedOrigins.join(', ')}`);
});

export default app;

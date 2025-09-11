/**
 * Environment configuration and validation
 * Centralizes all environment variable access with validation
 */

import logger from './logger.js';

// Required environment variables
const REQUIRED_ENV_VARS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'ADMIN_PASSWORD',
  'JWT_SECRET'
];

// Optional environment variables with defaults
const OPTIONAL_ENV_VARS = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'INFO',
  PORT: '3000',
  TURDS_MINT_ADDRESS: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
  API_KEY: null,
  MAX_REQUEST_SIZE: '10mb',
  CORS_MAX_AGE: '3600',
  RATE_LIMIT_WINDOW_MS: '900000', // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: '100'
};

/**
 * Configuration object
 */
class Config {
  constructor() {
    this.env = {};
    this.validated = false;
    this.errors = [];
  }

  /**
   * Validate and load environment variables
   */
  validate() {
    this.errors = [];

    // Check required variables
    for (const varName of REQUIRED_ENV_VARS) {
      const value = process.env[varName];
      
      if (!value || value.trim() === '') {
        this.errors.push(`Missing required environment variable: ${varName}`);
      } else {
        this.env[varName] = value;
      }
    }

    // Load optional variables with defaults
    for (const [varName, defaultValue] of Object.entries(OPTIONAL_ENV_VARS)) {
      this.env[varName] = process.env[varName] || defaultValue;
    }

    // Validate specific formats
    this.validateFormats();

    if (this.errors.length > 0) {
      logger.error('Environment validation failed', { errors: this.errors });
      
      // In production, fail fast
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Environment validation failed: ${this.errors.join(', ')}`);
      }
    }

    this.validated = true;
    logger.info('Environment configuration validated successfully');
    
    return this.errors.length === 0;
  }

  /**
   * Validate specific environment variable formats
   */
  validateFormats() {
    // Validate Firebase private key format
    if (this.env.FIREBASE_PRIVATE_KEY) {
      const privateKey = this.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        this.errors.push('FIREBASE_PRIVATE_KEY appears to be invalid');
      }
    }

    // Validate email format
    if (this.env.FIREBASE_CLIENT_EMAIL) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.env.FIREBASE_CLIENT_EMAIL)) {
        this.errors.push('FIREBASE_CLIENT_EMAIL is not a valid email');
      }
    }

    // Validate Solana addresses
    if (this.env.TURDS_MINT_ADDRESS) {
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(this.env.TURDS_MINT_ADDRESS)) {
        this.errors.push('TURDS_MINT_ADDRESS is not a valid Solana address');
      }
    }

    // Validate URLs
    if (this.env.SOLANA_RPC_URL) {
      try {
        new URL(this.env.SOLANA_RPC_URL);
      } catch {
        this.errors.push('SOLANA_RPC_URL is not a valid URL');
      }
    }

    // Validate numeric values
    const numericVars = ['PORT', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS'];
    for (const varName of numericVars) {
      if (this.env[varName] && isNaN(parseInt(this.env[varName]))) {
        this.errors.push(`${varName} must be a number`);
      }
    }

    // Validate NODE_ENV
    const validNodeEnvs = ['development', 'test', 'staging', 'production'];
    if (!validNodeEnvs.includes(this.env.NODE_ENV)) {
      this.errors.push(`NODE_ENV must be one of: ${validNodeEnvs.join(', ')}`);
    }

    // Validate LOG_LEVEL
    const validLogLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    if (!validLogLevels.includes(this.env.LOG_LEVEL)) {
      this.errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
    }
  }

  /**
   * Get environment variable with type conversion
   */
  get(key, defaultValue = null) {
    if (!this.validated) {
      this.validate();
    }

    const value = this.env[key] || defaultValue;

    // Type conversions
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value !== '') return Number(value);

    return value;
  }

  /**
   * Get required environment variable
   */
  getRequired(key) {
    const value = this.get(key);
    
    if (value === null || value === undefined || value === '') {
      throw new Error(`Required environment variable ${key} is not set`);
    }

    return value;
  }

  /**
   * Check if running in production
   */
  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }

  /**
   * Get all configuration as object
   */
  getAll() {
    if (!this.validated) {
      this.validate();
    }
    
    // Don't expose sensitive values in non-production
    if (!this.isProduction()) {
      const safeConfig = { ...this.env };
      
      // Redact sensitive values
      if (safeConfig.FIREBASE_PRIVATE_KEY) {
        safeConfig.FIREBASE_PRIVATE_KEY = '[REDACTED]';
      }
      if (safeConfig.ADMIN_PASSWORD) {
        safeConfig.ADMIN_PASSWORD = '[REDACTED]';
      }
      if (safeConfig.JWT_SECRET) {
        safeConfig.JWT_SECRET = '[REDACTED]';
      }
      if (safeConfig.API_KEY) {
        safeConfig.API_KEY = '[REDACTED]';
      }

      return safeConfig;
    }

    return this.env;
  }

  /**
   * Reload configuration (useful for testing)
   */
  reload() {
    this.env = {};
    this.validated = false;
    this.errors = [];
    return this.validate();
  }
}

// Create singleton instance
const config = new Config();

// Validate on module load
config.validate();

export default config;

// Export helper functions for backward compatibility
export function getRequiredEnvVar(key) {
  return config.getRequired(key);
}

export function getEnvVar(key, defaultValue) {
  return config.get(key, defaultValue);
}

export function isProduction() {
  return config.isProduction();
}

export function isDevelopment() {
  return config.isDevelopment();
}

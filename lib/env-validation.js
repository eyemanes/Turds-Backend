/**
 * Environment variable validation utility
 * Ensures all required environment variables are properly configured
 */

// Required environment variables for security
const REQUIRED_ENV_VARS = [
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL', 
  'FIREBASE_PROJECT_ID',
  'ADMIN_PASSWORD',
  'JWT_SECRET'
];

// Optional but recommended environment variables
const RECOMMENDED_ENV_VARS = [
  'HELIUS_API_KEY',
  'TURDS_MINT_ADDRESS',
  'SOLANA_RPC_URL'
];

/**
 * Validate that all required environment variables are set
 */
export function validateRequiredEnvVars() {
  const missing = [];
  const warnings = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check recommended variables
  for (const varName of RECOMMENDED_ENV_VARS) {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
    errorMessage: missing.length > 0 
      ? `Missing required environment variables: ${missing.join(', ')}`
      : null
  };
}

/**
 * Validate environment variables and throw error if invalid
 */
export function requireEnvVars() {
  const validation = validateRequiredEnvVars();
  
  if (!validation.isValid) {
    console.error('❌ Environment validation failed:', validation.errorMessage);
    console.error('Please set the following environment variables in Vercel:');
    validation.missing.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    throw new Error(validation.errorMessage);
  }

  if (validation.warnings.length > 0) {
    console.warn('⚠️  Missing recommended environment variables:');
    validation.warnings.forEach(varName => {
      console.warn(`  - ${varName}`);
    });
  }

  console.log('✅ Environment variables validated successfully');
  return true;
}

/**
 * Get environment variable with validation
 */
export function getRequiredEnvVar(varName) {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`Required environment variable ${varName} is not set`);
  }
  return value;
}

/**
 * Get environment variable with fallback (for non-sensitive values only)
 */
export function getEnvVar(varName, fallback = null) {
  return process.env[varName] || fallback;
}

export default {
  validateRequiredEnvVars,
  requireEnvVars,
  getRequiredEnvVar,
  getEnvVar
};

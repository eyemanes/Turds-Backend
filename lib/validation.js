/**
 * Input validation and sanitization utilities
 * No external dependencies - works directly on Vercel
 */

// Sanitize string input
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  // Remove dangerous characters
  let cleaned = input
    .trim()
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/[<>\"']/g, '') // Remove dangerous characters
    .slice(0, 5000); // Limit length
  
  return cleaned;
}

// Validate email
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  const sanitized = sanitizeInput(email).toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(sanitized)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true, value: sanitized };
}

// Validate username
export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  
  const sanitized = sanitizeInput(username);
  
  // Username rules: 3-20 characters, alphanumeric + underscore
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(sanitized)) {
    return { 
      valid: false, 
      error: 'Username must be 3-20 characters, alphanumeric and underscore only' 
    };
  }
  
  return { valid: true, value: sanitized };
}

// Validate Solana wallet address
export function validateWalletAddress(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Wallet address is required' };
  }
  
  // Solana address validation (base58, 32-44 characters)
  const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  
  if (!solanaAddressRegex.test(address)) {
    return { valid: false, error: 'Invalid Solana wallet address' };
  }
  
  return { valid: true, value: address };
}

// Validate numeric input
export function validateNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Must be a valid number' };
  }
  
  if (num < min || num > max) {
    return { valid: false, error: `Must be between ${min} and ${max}` };
  }
  
  return { valid: true, value: num };
}

// Validate MongoDB-style ID
export function validateObjectId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'ID is required' };
  }
  
  // Basic ID validation - alphanumeric
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return { valid: false, error: 'Invalid ID format' };
  }
  
  return { valid: true, value: id };
}

// Validate Firebase UID
export function validateFirebaseUid(uid) {
  if (!uid || typeof uid !== 'string') {
    return { valid: false, error: 'User ID is required' };
  }
  
  // Firebase UIDs are typically 20-128 characters
  if (uid.length < 20 || uid.length > 128) {
    return { valid: false, error: 'Invalid user ID format' };
  }
  
  // Basic alphanumeric check
  if (!/^[a-zA-Z0-9]{20,128}$/.test(uid)) {
    return { valid: false, error: 'Invalid user ID characters' };
  }
  
  return { valid: true, value: uid };
}

// Validate and sanitize text content
export function validateContent(content, maxLength = 5000) {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Content is required' };
  }
  
  const sanitized = sanitizeInput(content);
  
  if (sanitized.length > maxLength) {
    return { valid: false, error: `Content must be less than ${maxLength} characters` };
  }
  
  if (sanitized.length < 1) {
    return { valid: false, error: 'Content cannot be empty' };
  }
  
  return { valid: true, value: sanitized };
}

// Validate election type
export function validateElectionType(type) {
  const validTypes = ['general', 'primary', 'special'];
  
  if (!validTypes.includes(type)) {
    return { valid: false, error: 'Invalid election type' };
  }
  
  return { valid: true, value: type };
}

// Validate vote choice
export function validateVoteChoice(choice) {
  const validChoices = ['for', 'against', 'abstain'];
  
  if (!validChoices.includes(choice)) {
    return { valid: false, error: 'Invalid vote choice' };
  }
  
  return { valid: true, value: choice };
}

// Rate limiting helper
const rateLimitMap = new Map();

export function checkRateLimit(identifier, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const userLimits = rateLimitMap.get(identifier) || { count: 0, resetTime: now + windowMs };
  
  // Reset if window has passed
  if (now > userLimits.resetTime) {
    userLimits.count = 0;
    userLimits.resetTime = now + windowMs;
  }
  
  userLimits.count++;
  rateLimitMap.set(identifier, userLimits);
  
  if (userLimits.count > limit) {
    const remainingTime = Math.ceil((userLimits.resetTime - now) / 1000);
    return { 
      allowed: false, 
      error: `Rate limit exceeded. Try again in ${remainingTime} seconds.`,
      remainingTime 
    };
  }
  
  return { allowed: true, remaining: limit - userLimits.count };
}

// Clean old rate limit entries periodically (every 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime + 3600000) { // Clean entries older than 1 hour
        rateLimitMap.delete(key);
      }
    }
  }, 600000);
}

export default {
  sanitizeInput,
  validateEmail,
  validateUsername,
  validateWalletAddress,
  validateNumber,
  validateObjectId,
  validateFirebaseUid,
  validateContent,
  validateElectionType,
  validateVoteChoice,
  checkRateLimit
};

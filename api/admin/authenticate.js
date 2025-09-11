import crypto from 'crypto';
import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../../lib/cors.js';
import { getRequiredEnvVar } from '../../lib/env-validation.js';
import logger from '../../lib/logger.js';

// Rate limiting storage
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Initialize Firebase Admin
let db = null;

function initializeFirebase() {
  if (db) return db;
  
  try {
    const privateKey = getRequiredEnvVar('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
    const clientEmail = getRequiredEnvVar('FIREBASE_CLIENT_EMAIL');
    const projectId = getRequiredEnvVar('FIREBASE_PROJECT_ID');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey,
        })
      });
    }
    
    db = admin.firestore();
    return db;
  } catch (error) {
    logger.logError(error, 'Firebase initialization');
    return null;
  }
}

// Clean old login attempts
function cleanLoginAttempts() {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (now - data.lastAttempt > LOCKOUT_TIME) {
      loginAttempts.delete(ip);
    }
  }
}

// Check rate limiting
function checkRateLimit(ip) {
  cleanLoginAttempts();
  
  const attempts = loginAttempts.get(ip);
  if (!attempts) return { allowed: true };
  
  const now = Date.now();
  const timeSinceLastAttempt = now - attempts.lastAttempt;
  
  if (attempts.count >= MAX_ATTEMPTS && timeSinceLastAttempt < LOCKOUT_TIME) {
    const remainingTime = Math.ceil((LOCKOUT_TIME - timeSinceLastAttempt) / 1000 / 60);
    return { 
      allowed: false, 
      message: `Too many failed attempts. Please try again in ${remainingTime} minutes.` 
    };
  }
  
  return { allowed: true };
}

// Update login attempts
function updateLoginAttempts(ip, success = false) {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(ip, attempts);
}

// Simple password hashing for Vercel (no bcrypt needed)
function hashPassword(password) {
  const jwtSecret = getRequiredEnvVar('JWT_SECRET');
  
  return crypto
    .createHash('sha256')
    .update(password + jwtSecret)
    .digest('hex');
}

// Generate secure token
function generateToken(userId, role = 'admin') {
  const payload = {
    userId,
    role,
    timestamp: Date.now(),
    random: crypto.randomBytes(16).toString('hex')
  };
  
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export default async function handler(req, res) {
  // Log request for audit trail
  logger.logRequest(req, 'Admin authentication attempt');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get client IP for rate limiting
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     'unknown';
    
    // Check rate limiting
    const rateLimit = checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      logger.logSecurityEvent('Rate limit exceeded', { ip: clientIp });
      return res.status(429).json({ 
        success: false, 
        message: rateLimit.message 
      });
    }
    
    const { password } = req.body;
    
    if (!password) {
      updateLoginAttempts(clientIp, false);
      return res.status(400).json({ 
        success: false, 
        message: 'Password is required' 
      });
    }
    
    // Get configured admin password - REQUIRED
    const configuredPassword = getRequiredEnvVar('ADMIN_PASSWORD');
    
    const hashedConfigured = hashPassword(configuredPassword);
    const hashedInput = hashPassword(password);
    
    // Verify password
    const isValid = hashedInput === hashedConfigured;
    
    if (!isValid) {
      updateLoginAttempts(clientIp, false);
      
      // Log failed attempt
      logger.logSecurityEvent('Admin login failed', { ip: clientIp });
      
      // Log failed attempt if Firebase is available
      const firestore = initializeFirebase();
      if (firestore) {
        await firestore.collection('audit_logs').add({
          type: 'admin_login_failed',
          ip: clientIp,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          userAgent: req.headers['user-agent']
        }).catch(error => logger.logError(error, 'Firebase audit log'));
      }
      
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    // Success - clear rate limiting
    updateLoginAttempts(clientIp, true);
    
    // Generate secure token
    const token = generateToken('admin', 'super_admin');
    
    // Log successful login
    logger.logSecurityEvent('Admin login successful', { ip: clientIp });
    
    // Log successful login if Firebase is available
    const firestore = initializeFirebase();
    if (firestore) {
      await firestore.collection('audit_logs').add({
        type: 'admin_login_success',
        ip: clientIp,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userAgent: req.headers['user-agent']
      }).catch(error => logger.logError(error, 'Firebase audit log'));
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Authentication successful',
      token
    });
    
  } catch (error) {
    logger.logError(error, 'Admin authentication');
    return res.status(500).json({ 
      success: false,
      message: 'Authentication service error'
    });
  }
}

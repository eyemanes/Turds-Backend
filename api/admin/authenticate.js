import crypto from 'crypto';
import admin from 'firebase-admin';

// Rate limiting storage
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Initialize Firebase Admin
let db = null;

function initializeFirebase() {
  if (db) return db;
  
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.error('Missing Firebase credentials');
      return null;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
    }
    
    db = admin.firestore();
    return db;
  } catch (error) {
    console.error('Firebase initialization error:', error);
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
  return crypto
    .createHash('sha256')
    .update(password + (process.env.JWT_SECRET || 'turds-secret-2024'))
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
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // CORS with specific origin
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://turds-nation.vercel.app',
    'https://turds-front.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    
    // Get configured admin password or use default
    const configuredPassword = process.env.ADMIN_PASSWORD || 'Turdsonamission@25';
    const hashedConfigured = hashPassword(configuredPassword);
    const hashedInput = hashPassword(password);
    
    // Verify password
    const isValid = hashedInput === hashedConfigured;
    
    if (!isValid) {
      updateLoginAttempts(clientIp, false);
      
      // Log failed attempt if Firebase is available
      const firestore = initializeFirebase();
      if (firestore) {
        await firestore.collection('audit_logs').add({
          type: 'admin_login_failed',
          ip: clientIp,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          userAgent: req.headers['user-agent']
        }).catch(console.error);
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
    
    // Log successful login if Firebase is available
    const firestore = initializeFirebase();
    if (firestore) {
      await firestore.collection('audit_logs').add({
        type: 'admin_login_success',
        ip: clientIp,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userAgent: req.headers['user-agent']
      }).catch(console.error);
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Authentication successful',
      token
    });
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Authentication service error'
    });
  }
}

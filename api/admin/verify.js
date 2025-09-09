import admin from 'firebase-admin';

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
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    let token = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token) {
      return res.status(401).json({ 
        valid: false, 
        message: 'No token provided' 
      });
    }
    
    // Decode and verify token
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      
      // Check if token is expired (24 hours)
      const tokenAge = Date.now() - decoded.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (tokenAge > maxAge) {
        return res.status(401).json({ 
          valid: false, 
          message: 'Token expired' 
        });
      }
      
      // Optional: Check if token exists in blacklist (for logout)
      const firestore = initializeFirebase();
      if (firestore) {
        const blacklistDoc = await firestore
          .collection('token_blacklist')
          .doc(token.substring(0, 20)) // Use first 20 chars as ID
          .get();
        
        if (blacklistDoc.exists) {
          return res.status(401).json({ 
            valid: false, 
            message: 'Token has been revoked' 
          });
        }
      }
      
      return res.status(200).json({ 
        valid: true,
        role: decoded.role,
        userId: decoded.userId
      });
      
    } catch (decodeError) {
      return res.status(401).json({ 
        valid: false, 
        message: 'Invalid token format' 
      });
    }
    
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ 
      valid: false,
      message: 'Verification failed'
    });
  }
}

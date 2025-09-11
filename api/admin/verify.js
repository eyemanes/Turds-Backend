import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../../lib/cors.js';
import { getRequiredEnvVar } from '../../lib/env-validation.js';

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
    console.error('Firebase initialization error:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
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

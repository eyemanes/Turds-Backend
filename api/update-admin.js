import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';

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
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, isAdmin } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Initialize Firebase
    const firestore = initializeFirebase();
    if (!firestore) {
      return res.status(500).json({ error: 'Database connection failed' });
    }

    // Update user admin status
    await firestore.collection('users').doc(userId).update({
      isAdmin: isAdmin,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`User ${userId} isAdmin updated to ${isAdmin}`);

    return res.status(200).json({ 
      success: true,
      message: `User admin status updated to ${isAdmin}`,
      userId: userId
    });

  } catch (error) {
    console.error('Error updating admin status:', error);
    return res.status(500).json({ 
      error: 'Failed to update admin status',
      message: error.message 
    });
  }
}


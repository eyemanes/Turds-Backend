import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (privateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  try {
    if (req.method === 'POST') {
      const { uid, username, walletAddress, profilePicture } = req.body;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Create or update citizen record
      const citizenData = {
        uid,
        username: username || 'Anonymous',
        walletAddress: walletAddress || null,
        profilePicture: profilePicture || null,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isActive: true,
        role: 'citizen'
      };

      // Save to Firestore
      await db.collection('citizens').doc(uid).set(citizenData, { merge: true });
      
      return res.status(201).json({ 
        success: true, 
        message: 'Citizen registered successfully',
        data: citizenData
      });
    }

    if (req.method === 'GET') {
      const { uid } = req.query;
      
      if (uid) {
        // Get specific citizen
        const doc = await db.collection('citizens').doc(uid).get();
        if (doc.exists) {
          return res.status(200).json({ 
            success: true, 
            citizen: { id: doc.id, ...doc.data() }
          });
        } else {
          return res.status(404).json({ error: 'Citizen not found' });
        }
      }
      
      // Get all citizens
      const snapshot = await db.collection('citizens').get();
      const citizens = [];
      snapshot.forEach(doc => {
        citizens.push({ id: doc.id, ...doc.data() });
      });
      
      return res.status(200).json({ 
        success: true, 
        citizens,
        total: citizens.length
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Citizens API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
}

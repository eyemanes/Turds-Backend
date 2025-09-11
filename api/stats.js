import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';

// Initialize Firebase Admin only once
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

  try {
    // Initialize Firebase
    const firestore = initializeFirebase();
    
    if (!firestore) {
      return res.status(200).json({
        success: true,
        stats: {
          totalCitizens: 0,
          totalCandidates: 0,
          totalVotes: 0,
          activeElection: false
        }
      });
    }

    if (req.method === 'GET') {
      // Get counts from collections
      const [citizensSnapshot, candidatesSnapshot, votesSnapshot, usersSnapshot] = await Promise.all([
        firestore.collection('citizens').get(),
        firestore.collection('candidates').where('isActive', '==', true).get(),
        firestore.collection('votes').get(),
        firestore.collection('users').get()
      ]);

      return res.status(200).json({
        success: true,
        stats: {
          totalCitizens: citizensSnapshot.size,
          totalUsers: usersSnapshot.size,
          totalCandidates: candidatesSnapshot.size,
          totalVotes: votesSnapshot.size,
          activeElection: true,
          timestamp: new Date().toISOString()
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

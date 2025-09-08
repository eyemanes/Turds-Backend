import admin from 'firebase-admin';

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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Initialize Firebase
    const firestore = initializeFirebase();
    
    if (!firestore) {
      // Return success even without database for now
      return res.status(200).json({
        success: true,
        message: 'User operation completed (database not configured)',
        user: req.body
      });
    }
    
    // Register/update user
    if (req.method === 'POST') {
      const { uid, username, email, profilePicture, walletAddress } = req.body;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      const userData = {
        uid,
        username: username || 'Anonymous',
        email: email || null,
        profilePicture: profilePicture || null,
        walletAddress: walletAddress || null,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        role: 'citizen',
        tokenBalance: 0,
        verifiedHolder: false
      };

      // Save to users collection
      await firestore.collection('users').doc(uid).set(userData, { merge: true });
      
      // Also save to citizens collection
      await firestore.collection('citizens').doc(uid).set({
        ...userData,
        citizenNumber: Date.now()
      }, { merge: true });
      
      return res.status(200).json({ 
        success: true, 
        user: userData,
        message: 'User registered successfully'
      });
    }

    // Get user profile
    if (req.method === 'GET') {
      const { uid } = req.query;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      const userDoc = await firestore.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      return res.status(200).json({ 
        success: true, 
        user: { id: userDoc.id, ...userDoc.data() }
      });
    }

    // Update user profile
    if (req.method === 'PUT') {
      const { uid, ...updates } = req.body;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      updates.lastActive = admin.firestore.FieldValue.serverTimestamp();
      
      await firestore.collection('users').doc(uid).update(updates);
      await firestore.collection('citizens').doc(uid).update(updates);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Profile updated'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

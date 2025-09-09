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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const firestore = initializeFirebase();
  if (!firestore) {
    return res.status(500).json({ error: 'Database initialization failed' });
  }

  try {
    const action = req.query.action || req.body.action;

    // REGISTER USER (existing logic)
    if (action === 'register') {
      const userData = req.body;
      
      if (!userData.uid) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const userRecord = {
        uid: userData.uid,
        username: userData.username || 'Anonymous',
        email: userData.email || null,
        profilePicture: userData.profilePicture || null,
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('users').doc(userData.uid).set(userRecord, { merge: true });

      return res.status(200).json({ 
        success: true, 
        user: userRecord
      });
    }

    // UPDATE WALLET ADDRESS
    if (action === 'update-wallet') {
      const { userId, walletAddress } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }
      
      try {
        // Update user document with wallet address
        await firestore.collection('users').doc(userId).update({
          walletAddress: walletAddress || null,
          walletUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Wallet updated for user ${userId}: ${walletAddress || 'removed'}`);
        
        return res.status(200).json({ 
          success: true, 
          walletAddress: walletAddress,
          message: walletAddress ? 'Wallet connected' : 'Wallet removed'
        });
      } catch (error) {
        console.error('Error updating wallet:', error);
        return res.status(500).json({ error: 'Failed to update wallet' });
      }
    }
    
    // GET USER DATA
    if (action === 'get-user') {
      const userId = req.query.userId || req.body.userId;
      
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }
      
      try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        return res.status(200).json({
          success: true,
          uid: userId,
          walletAddress: userData.walletAddress || null,
          username: userData.username,
          email: userData.email,
          profilePicture: userData.profilePicture,
          twitter: userData.twitter,
          isAdmin: userData.isAdmin || false,
          tokenBalance: userData.tokenBalance || 0
        });
      } catch (error) {
        console.error('Error fetching user:', error);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
    }

    // REFRESH TWITTER DATA (simplified for now)
    if (action === 'refresh-twitter') {
      const { userId, username } = req.body;
      
      if (!userId || !username) {
        return res.status(400).json({ error: 'Missing userId or username' });
      }

      // For now, just return success
      // You can add actual Twitter API call here if needed
      return res.status(200).json({ 
        success: true,
        message: 'Twitter data refresh not implemented yet'
      });
    }

    // GET USER (original endpoint support)
    if (req.method === 'GET') {
      const { uid } = req.query;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const userDoc = await firestore.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      const userData = userDoc.data();
      
      return res.status(200).json({ 
        success: true, 
        user: {
          id: userDoc.id,
          ...userData,
          lastLogin: userData.lastLogin?.toDate?.()?.toISOString() || null,
          lastActive: userData.lastActive?.toDate?.()?.toISOString() || null
        }
      });
    }

    // UPDATE USER (original endpoint support)
    if (req.method === 'PUT') {
      const { uid, ...updates } = req.body;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }

      await firestore.collection('users').doc(uid).update({
        ...updates,
        lastActive: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ 
        success: true, 
        message: 'User updated successfully' 
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('User API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

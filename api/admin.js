import admin from 'firebase-admin';

/**
 * SECURITY NOTE: Admin status can ONLY be set directly in the Firebase database.
 * 
 * To grant admin access:
 * 1. Go to Firebase Console
 * 2. Navigate to Firestore Database
 * 3. Find the 'users' collection
 * 4. Find the user document by their ID
 * 5. Add/Update field: isAdmin = true
 * 
 * Never expose an API endpoint for setting admin status as it could be exploited.
 */

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
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // CORS with specific origins
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'https://turds-nation.vercel.app',
    'http://localhost:5173'
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const firestore = initializeFirebase();
  
  if (!firestore) {
    return res.status(200).json({
      success: false,
      message: 'Database not configured'
    });
  }

  try {
    const { action } = req.query;

    // ADMIN LOGIN (support both old and new endpoints)
    if ((action === 'login' || action === 'authenticate') && req.method === 'POST') {
      const { username, password } = req.body;

      // Check environment variables for admin credentials
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminUsername || !adminPassword) {
        console.error('Admin credentials not configured');
        return res.status(503).json({ 
          success: false, 
          message: 'Admin authentication not configured' 
        });
      }

      if (username === adminUsername && password === adminPassword) {
        return res.status(200).json({ 
          success: true, 
          message: 'Admin authenticated',
          isAdmin: true 
        });
      }

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // ANNOUNCEMENTS
    if (action === 'announcements') {
      // Create announcement
      if (req.method === 'POST') {
        const { title, content, type, priority } = req.body;
        
        if (!title || !content) {
          return res.status(400).json({ error: 'Title and content required' });
        }

        const announcement = {
          title,
          content,
          type: type || 'general',
          priority: priority || 'normal',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isActive: true
        };

        const docRef = await firestore.collection('announcements').add(announcement);
        
        return res.status(201).json({ 
          success: true, 
          id: docRef.id,
          message: 'Announcement created successfully'
        });
      }

      // Get announcements
      if (req.method === 'GET') {
        const snapshot = await firestore.collection('announcements')
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();
        
        const announcements = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          announcements.push({ 
            id: doc.id, 
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null
          });
        });
        
        return res.status(200).json({ 
          success: true, 
          announcements 
        });
      }

      // Delete announcement
      if (req.method === 'DELETE') {
        const { id } = req.query;
        
        if (!id) {
          return res.status(400).json({ error: 'Announcement ID required' });
        }

        await firestore.collection('announcements').doc(id).update({
          isActive: false,
          deletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({ 
          success: true, 
          message: 'Announcement deleted successfully'
        });
      }
    }

    // REMOVED set-admin endpoint for security - admin status should only be set directly in database

    // GET ALL USERS (for admin panel)
    if (action === 'users' && req.method === 'GET') {
      const usersSnapshot = await firestore.collection('users').get();
      const users = [];
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        users.push({
          id: doc.id,
          username: data.username || 'Anonymous',
          email: data.email,
          isAdmin: data.isAdmin || false,
          twitterFollowers: data.twitterFollowers || 0,
          walletAddress: data.walletAddress,
          lastLogin: data.lastLogin?.toDate?.()?.toISOString() || null
        });
      });
      
      return res.status(200).json({ 
        success: true, 
        users 
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

import admin from 'firebase-admin';
import fetch from 'node-fetch';

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

// Fetch Twitter data from RapidAPI
async function fetchTwitterData(username) {
  try {
    const cleanUsername = username.replace('@', '');
    
    const response = await fetch(`https://twitter241.p.rapidapi.com/user?username=${cleanUsername}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY || '20fd5100f3msh8ad5102149a060ep18b8adjsn04eed04ad53d',
        'x-rapidapi-host': 'twitter241.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      console.error('Twitter API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    // Extract follower data from the response
    // The API response structure may vary, adjust as needed
    if (data && data.result && data.result.data && data.result.data.user) {
      const userData = data.result.data.user.result;
      return {
        followers: userData.legacy?.followers_count || 0,
        following: userData.legacy?.friends_count || 0,
        tweets: userData.legacy?.statuses_count || 0,
        verified: userData.legacy?.verified || false,
        profileImageUrl: userData.legacy?.profile_image_url_https?.replace('_normal', '_400x400'),
        description: userData.legacy?.description || ''
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching Twitter data:', error);
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
      
      // Fetch Twitter data if username provided
      let twitterData = null;
      if (username) {
        console.log('Fetching Twitter data for:', username);
        twitterData = await fetchTwitterData(username);
        console.log('Twitter data received:', twitterData);
      }
      
      const userData = {
        uid,
        username: username || 'Anonymous',
        email: email || null,
        profilePicture: profilePicture || twitterData?.profileImageUrl || null,
        walletAddress: walletAddress || null,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        role: 'citizen',
        tokenBalance: 0,
        verifiedHolder: false,
        // Add Twitter metrics
        twitterFollowers: twitterData?.followers || 0,
        twitterFollowing: twitterData?.following || 0,
        twitterTweets: twitterData?.tweets || 0,
        twitterVerified: twitterData?.verified || false,
        twitterBio: twitterData?.description || '',
        twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Check if eligible to be candidate (min 1000 followers)
        eligibleForCandidacy: (twitterData?.followers || 0) >= 1000
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
        message: 'User registered successfully',
        twitterData: {
          followers: userData.twitterFollowers,
          eligible: userData.eligibleForCandidacy
        }
      });
    }

    // Get user profile
    if (req.method === 'GET') {
      const { uid, refreshTwitter } = req.query;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      const userDoc = await firestore.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        // User doesn't exist yet, return empty user data
        console.log('User not found in database:', uid);
        return res.status(200).json({ 
          success: true, 
          user: null,
          message: 'User not registered yet'
        });
      }
      
      const userData = userDoc.data();
      
      // Optionally refresh Twitter data
      if (refreshTwitter === 'true' && userData.username) {
        const twitterData = await fetchTwitterData(userData.username);
        if (twitterData) {
          const updates = {
            twitterFollowers: twitterData.followers,
            twitterFollowing: twitterData.following,
            twitterTweets: twitterData.tweets,
            twitterVerified: twitterData.verified,
            twitterBio: twitterData.description,
            twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
            eligibleForCandidacy: twitterData.followers >= 1000
          };
          
          await firestore.collection('users').doc(uid).update(updates);
          Object.assign(userData, updates);
        }
      }
      
      return res.status(200).json({ 
        success: true, 
        user: { id: userDoc.id, ...userData }
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

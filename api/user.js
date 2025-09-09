import admin from 'firebase-admin';
import fetch from 'node-fetch';

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

// Fetch Twitter data from RapidAPI
async function fetchTwitterData(username) {
  try {
    const cleanUsername = username.replace('@', '');
    console.log('Fetching Twitter data for username:', cleanUsername);
    
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
    
    // Navigate to the correct location in the response
    if (data && data.result && data.result.data && data.result.data.user && data.result.data.user.result) {
      const userData = data.result.data.user.result;
      const legacy = userData.legacy || {};
      const core = userData.core || {};
      const verificationInfo = userData.verification_info || {};
      
      // Parse account creation date
      let accountAgeMonths = 0;
      let accountCreatedAt = null;
      
      if (core.created_at) {
        accountCreatedAt = new Date(core.created_at);
        const now = new Date();
        const diffTime = Math.abs(now - accountCreatedAt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        accountAgeMonths = Math.floor(diffDays / 30);
      }
      
      // Check verification status
      const isVerified = userData.is_blue_verified || 
                        legacy.verified || 
                        verificationInfo.is_identity_verified || 
                        false;
      
      const result = {
        followers: legacy.followers_count || 0,
        following: legacy.friends_count || 0,
        tweets: legacy.statuses_count || 0,
        verified: isVerified,
        profileImageUrl: userData.avatar?.image_url || legacy.profile_image_url_https?.replace('_normal', '_400x400') || null,
        description: legacy.description || '',
        accountCreatedAt: accountCreatedAt ? accountCreatedAt.toISOString() : null,
        accountAgeMonths: accountAgeMonths,
        eligibleToVote: accountAgeMonths >= 6,
        screenName: core.screen_name || cleanUsername,
        name: core.name || ''
      };
      
      console.log('Processed Twitter data:', result);
      return result;
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

  const firestore = initializeFirebase();
  
  if (!firestore) {
    return res.status(200).json({
      success: false,
      message: 'Database not configured'
    });
  }

  try {
    // Handle different actions based on query parameter
    const { action } = req.query;

    // REFRESH TWITTER DATA
    if (action === 'refresh-twitter' && req.method === 'POST') {
      const { userId, username } = req.body;
      
      if (!userId || !username) {
        return res.status(400).json({ error: 'User ID and username required' });
      }
      
      console.log('Refreshing Twitter data for:', username);
      
      const twitterData = await fetchTwitterData(username);
      
      if (!twitterData) {
        return res.status(500).json({ error: 'Failed to fetch Twitter data' });
      }
      
      // Update user in database
      const updates = {
        twitterFollowers: twitterData.followers,
        twitterFollowing: twitterData.following,
        twitterTweets: twitterData.tweets,
        twitterVerified: twitterData.verified,
        twitterBio: twitterData.description,
        twitterAccountCreatedAt: twitterData.accountCreatedAt,
        twitterAccountAgeMonths: twitterData.accountAgeMonths,
        eligibleToVote: twitterData.eligibleToVote,
        eligibleForCandidacy: twitterData.followers >= 500,
        twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await firestore.collection('users').doc(userId).set(updates, { merge: true });
      
      // Also update citizens collection
      const citizenQuery = await firestore.collection('citizens').where('uid', '==', userId).get();
      if (!citizenQuery.empty) {
        const citizenDoc = citizenQuery.docs[0];
        await firestore.collection('citizens').doc(citizenDoc.id).update(updates);
      }
      
      return res.status(200).json({
        success: true,
        message: 'Twitter data refreshed',
        data: {
          followers: twitterData.followers,
          verified: twitterData.verified,
          accountAge: twitterData.accountAgeMonths,
          eligible: twitterData.followers >= 500
        }
      });
    }

    // REGISTER/UPDATE USER (from auth.js)
    if (req.method === 'POST' && !action) {
      const userData = req.body;
      
      if (!userData.uid) {
        return res.status(400).json({ error: 'User ID required' });
      }

      // Fetch Twitter data if username provided
      let twitterData = null;
      if (userData.username) {
        twitterData = await fetchTwitterData(userData.username);
      }

      const userRecord = {
        uid: userData.uid,
        username: userData.username || null,
        email: userData.email || null,
        profilePicture: userData.profilePicture || null,
        walletAddress: userData.walletAddress || null,
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
        ...(twitterData ? {
          twitterFollowers: twitterData.followers,
          twitterFollowing: twitterData.following,
          twitterTweets: twitterData.tweets,
          twitterVerified: twitterData.verified,
          twitterBio: twitterData.description,
          twitterAccountCreatedAt: twitterData.accountCreatedAt,
          twitterAccountAgeMonths: twitterData.accountAgeMonths,
          eligibleToVote: twitterData.eligibleToVote,
          eligibleForCandidacy: twitterData.followers >= 500,
          twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp()
        } : {})
      };

      // Create or update user
      await firestore.collection('users').doc(userData.uid).set(userRecord, { merge: true });

      // Also add to citizens collection if new
      const citizenQuery = await firestore.collection('citizens').where('uid', '==', userData.uid).get();
      
      if (citizenQuery.empty) {
        await firestore.collection('citizens').add({
          ...userRecord,
          role: 'citizen',
          joinedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        // Update existing citizen record
        const citizenDoc = citizenQuery.docs[0];
        await firestore.collection('citizens').doc(citizenDoc.id).update({
          ...userRecord,
          lastActive: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return res.status(200).json({ 
        success: true, 
        user: userRecord,
        twitterData: twitterData
      });
    }

    // GET USER
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

    // UPDATE USER
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

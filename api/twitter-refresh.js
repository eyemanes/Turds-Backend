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
      
      // Parse account creation date from core.created_at
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Initialize Firebase
    const firestore = initializeFirebase();
    
    if (!firestore) {
      return res.status(200).json({
        success: false,
        message: 'Database not configured'
      });
    }

    // Refresh Twitter data endpoint
    if (req.method === 'POST' && req.query.action === 'refresh') {
      const { userId, username } = req.body;
      
      if (!userId || !username) {
        return res.status(400).json({ error: 'User ID and username required' });
      }
      
      console.log('Manually refreshing Twitter data for:', username);
      
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

    return res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    console.error('Twitter refresh error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

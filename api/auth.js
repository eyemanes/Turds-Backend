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
    console.log('Twitter API response:', data);
    
    // Extract data from the API response structure
    if (data && data.result && data.result.data && data.result.data.user && data.result.data.user.result) {
      const userData = data.result.data.user.result;
      const legacy = userData.legacy || {};
      
      console.log('Legacy data:', legacy);
      
      // Parse account creation date properly
      let accountAgeMonths = 0;
      let accountCreatedAt = null;
      
      if (legacy.created_at) {
        // Twitter date format: "Wed Oct 10 20:19:24 +0000 2007"
        accountCreatedAt = new Date(legacy.created_at);
        const now = new Date();
        const diffTime = Math.abs(now - accountCreatedAt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        accountAgeMonths = Math.floor(diffDays / 30);
        
        console.log('Account created:', accountCreatedAt);
        console.log('Account age in months:', accountAgeMonths);
      }
      
      const result = {
        followers: legacy.followers_count || 0,
        following: legacy.friends_count || 0,
        tweets: legacy.statuses_count || 0,
        verified: legacy.verified || false,
        profileImageUrl: legacy.profile_image_url_https?.replace('_normal', '_400x400') || null,
        description: legacy.description || '',
        accountCreatedAt: accountCreatedAt ? accountCreatedAt.toISOString() : null,
        accountAgeMonths: accountAgeMonths,
        eligibleToVote: accountAgeMonths >= 6
      };
      
      console.log('Processed Twitter data:', result);
      return result;
    }

    console.error('Unexpected API response structure');
    return null;
  } catch (error) {
    console.error('Error fetching Twitter data:', error);
    return null;
  }
}

// Generate unique citizen ID
function generateCitizenId(firestore) {
  return new Promise(async (resolve) => {
    try {
      // Get the current count of citizens
      const snapshot = await firestore.collection('citizens').get();
      const count = snapshot.size + 1;
      
      // Generate ID in format: TU0900RD001S (incrementing number)
      const citizenId = `TU0900RD${String(count).padStart(3, '0')}S`;
      
      // Check if this ID already exists (just in case)
      const existing = await firestore.collection('citizens').doc(citizenId).get();
      if (existing.exists) {
        // If it exists, add timestamp to make it unique
        resolve(`TU0900RD${String(count).padStart(3, '0')}S${Date.now().toString().slice(-4)}`);
      } else {
        resolve(citizenId);
      }
    } catch (error) {
      // Fallback to timestamp-based ID
      const timestamp = Date.now().toString().slice(-6);
      resolve(`TU0900RD${timestamp}S`);
    }
  });
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
      const { uid, username, email, profilePicture } = req.body;
      // Do NOT use random wallet address - only use if actually provided by Privy
      
      console.log('Registering user:', { uid, username });
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      // Generate citizen ID
      const citizenId = await generateCitizenId(firestore);
      
      // Fetch Twitter data if username provided
      let twitterData = null;
      if (username) {
        console.log('Fetching Twitter data for:', username);
        twitterData = await fetchTwitterData(username);
        console.log('Twitter data received:', twitterData);
      }
      
      const userData = {
        uid,
        citizenId, // Custom citizen ID like TU0900RD001S
        username: username || 'Anonymous',
        email: email || null,
        profilePicture: profilePicture || twitterData?.profileImageUrl || null,
        walletAddress: null, // Only set when user actually connects wallet
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
        twitterAccountCreatedAt: twitterData?.accountCreatedAt || null,
        twitterAccountAgeMonths: twitterData?.accountAgeMonths || 0,
        eligibleToVote: twitterData?.eligibleToVote || false,
        twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Check if eligible to be candidate (min 500 followers)
        eligibleForCandidacy: (twitterData?.followers || 0) >= 500
      };

      // Save to users collection
      await firestore.collection('users').doc(uid).set(userData, { merge: true });
      
      // Save to citizens collection with citizenId as document ID
      await firestore.collection('citizens').doc(citizenId).set({
        ...userData,
        citizenNumber: citizenId
      });
      
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
            eligibleForCandidacy: twitterData.followers >= 500
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
      
      // Add last active timestamp
      updates.lastActive = admin.firestore.FieldValue.serverTimestamp();
      
      // If updating wallet address, also update wallet type
      if ('walletAddress' in updates) {
        console.log('Updating wallet address:', updates.walletAddress);
      }
      
      await firestore.collection('users').doc(uid).update(updates);
      
      // Also update citizens collection if it exists
      const citizenDoc = await firestore.collection('citizens').where('uid', '==', uid).get();
      if (!citizenDoc.empty) {
        const citizenId = citizenDoc.docs[0].id;
        await firestore.collection('citizens').doc(citizenId).update(updates);
      }
      
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

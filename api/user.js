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

    // REGISTER USER - Complete user registration with all fields
    if (action === 'register') {
      const userData = req.body;
      
      if (!userData.uid) {
        return res.status(400).json({ error: 'User ID required' });
      }

      // Check if user exists first
      const existingUser = await firestore.collection('users').doc(userData.uid).get();
      const existingData = existingUser.exists ? existingUser.data() : {};

      // Build complete user record
      const userRecord = {
        // Basic Info
        uid: userData.uid,
        username: userData.username || userData.twitterUsername || existingData.username || 'Anonymous',
        email: userData.email || existingData.email || null,
        profilePicture: userData.profilePicture || existingData.profilePicture || null,
        
        // Twitter Data
        twitterUsername: userData.twitterUsername || existingData.twitterUsername || null,
        twitterFollowers: existingData.twitterFollowers || 0,
        twitterFollowing: existingData.twitterFollowing || 0,
        twitterTweets: existingData.twitterTweets || 0,
        twitterVerified: existingData.twitterVerified || false,
        twitterBio: existingData.twitterBio || null,
        twitterAccountCreatedAt: existingData.twitterAccountCreatedAt || null,
        twitterAccountAgeMonths: existingData.twitterAccountAgeMonths || 0,
        twitterDataFetchedAt: existingData.twitterDataFetchedAt || null,
        
        // Wallet & Tokens
        walletAddress: existingData.walletAddress || null,
        tokenBalance: existingData.tokenBalance || 0,
        
        // Eligibility & Roles
        eligibleToVote: existingData.eligibleToVote !== false, // Default true
        eligibleForCandidacy: existingData.eligibleForCandidacy || false,
        role: existingData.role || 'citizen',
        isAdmin: existingData.isAdmin || false,
        
        // Timestamps
        joinedAt: existingData.joinedAt || admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('users').doc(userData.uid).set(userRecord, { merge: true });

      // If Twitter username provided and no followers data, fetch it
      if (userData.twitterUsername && !existingData.twitterFollowers) {
        try {
          console.log('Fetching Twitter data for:', userData.twitterUsername);
          const twitterResponse = await fetch(`https://twitter241.p.rapidapi.com/user?username=${userData.twitterUsername}`, {
            method: 'GET',
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY || '20fd5100f3msh8ad5102149a060ep18b8adjsn04eed04ad53d',
              'x-rapidapi-host': 'twitter241.p.rapidapi.com'
            }
          });

          if (twitterResponse.ok) {
            const twitterData = await twitterResponse.json();
            console.log('Twitter API response received');
            
            let followerCount = 0;
            let followingCount = 0;
            let tweetsCount = 0;
            let verified = false;
            let bio = '';
            let accountCreatedAt = null;
            
            // Extract data from Twitter API response
            if (twitterData.result) {
              const userResult = twitterData.result.result || twitterData.result;
              if (userResult.legacy) {
                followerCount = userResult.legacy.followers_count || 0;
                followingCount = userResult.legacy.friends_count || 0;
                tweetsCount = userResult.legacy.statuses_count || 0;
                verified = userResult.legacy.verified || false;
                bio = userResult.legacy.description || '';
                accountCreatedAt = userResult.legacy.created_at || null;
              }
            }

            // Calculate account age in months
            let accountAgeMonths = 0;
            if (accountCreatedAt) {
              const createdDate = new Date(accountCreatedAt);
              const now = new Date();
              accountAgeMonths = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24 * 30));
            }

            // Check candidacy eligibility (500+ followers OR 1M+ tokens)
            const eligibleForCandidacy = followerCount >= 500 || userRecord.tokenBalance >= 1000000;

            // Update user with Twitter data
            const twitterUpdate = {
              twitterFollowers: followerCount,
              twitterFollowing: followingCount,
              twitterTweets: tweetsCount,
              twitterVerified: verified,
              twitterBio: bio,
              twitterAccountCreatedAt: accountCreatedAt,
              twitterAccountAgeMonths: accountAgeMonths,
              twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
              eligibleForCandidacy: eligibleForCandidacy
            };

            await firestore.collection('users').doc(userData.uid).update(twitterUpdate);
            
            // Update the userRecord for response
            Object.assign(userRecord, twitterUpdate);
            console.log(`Twitter data updated: ${followerCount} followers, eligible: ${eligibleForCandidacy}`);
          }
        } catch (error) {
          console.error('Error fetching Twitter data during registration:', error);
        }
      }

      return res.status(200).json({ 
        success: true, 
        user: userRecord,
        message: 'User registered successfully'
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
        const updateData = {
          walletAddress: walletAddress || null,
          walletUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // If wallet address provided, fetch token balance
        if (walletAddress) {
          try {
            const tokenResponse = await fetch(`https://turds-backend.vercel.app/api/token-balance?wallet=${walletAddress}`);
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              updateData.tokenBalance = tokenData.uiAmount || 0;
            }
          } catch (error) {
            console.error('Error fetching token balance:', error);
          }
        } else {
          updateData.tokenBalance = 0;
        }
        
        await firestore.collection('users').doc(userId).update(updateData);
        
        console.log(`Wallet updated for user ${userId}: ${walletAddress || 'removed'}`);
        
        return res.status(200).json({ 
          success: true, 
          walletAddress: walletAddress,
          tokenBalance: updateData.tokenBalance,
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
          user: {
            // Basic Info
            uid: userId,
            username: userData.username || 'Anonymous',
            email: userData.email || null,
            profilePicture: userData.profilePicture || null,
            
            // Twitter Data
            twitterUsername: userData.twitterUsername || null,
            twitterFollowers: userData.twitterFollowers || 0,
            twitterFollowing: userData.twitterFollowing || 0,
            twitterTweets: userData.twitterTweets || 0,
            twitterVerified: userData.twitterVerified || false,
            twitterBio: userData.twitterBio || null,
            twitterAccountCreatedAt: userData.twitterAccountCreatedAt || null,
            twitterAccountAgeMonths: userData.twitterAccountAgeMonths || 0,
            twitterDataFetchedAt: userData.twitterDataFetchedAt || null,
            
            // Wallet & Tokens
            walletAddress: userData.walletAddress || null,
            tokenBalance: userData.tokenBalance || 0,
            
            // Eligibility & Roles
            eligibleToVote: userData.eligibleToVote !== false,
            eligibleForCandidacy: userData.eligibleForCandidacy || false,
            role: userData.role || 'citizen',
            isAdmin: userData.isAdmin || false,
            
            // Timestamps
            joinedAt: userData.joinedAt || null,
            lastLogin: userData.lastLogin || null,
            lastActive: userData.lastActive || null
          }
        });
      } catch (error) {
        console.error('Error fetching user:', error);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
    }

    // REFRESH TWITTER DATA
    if (action === 'refresh-twitter') {
      const { userId, username } = req.body;
      
      if (!userId || !username) {
        return res.status(400).json({ error: 'Missing userId or username' });
      }

      try {
        // Call Twitter API to get user data
        const twitterResponse = await fetch(`https://twitter241.p.rapidapi.com/user?username=${username}`, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY || '20fd5100f3msh8ad5102149a060ep18b8adjsn04eed04ad53d',
            'x-rapidapi-host': 'twitter241.p.rapidapi.com'
          }
        });

        if (!twitterResponse.ok) {
          console.error('Twitter API error:', twitterResponse.status);
          return res.status(500).json({ 
            success: false,
            message: 'Failed to fetch Twitter data'
          });
        }

        const twitterData = await twitterResponse.json();
        console.log('Twitter API response:', twitterData);

        // Extract follower count from the response
        let followerCount = 0;
        let verified = false;
        
        // Handle different response structures
        if (twitterData.result) {
          const userResult = twitterData.result.result || twitterData.result;
          if (userResult.legacy) {
            followerCount = userResult.legacy.followers_count || 0;
            verified = userResult.legacy.verified || false;
          } else if (userResult.followers_count !== undefined) {
            followerCount = userResult.followers_count;
            verified = userResult.verified || false;
          }
        } else if (twitterData.followers_count !== undefined) {
          followerCount = twitterData.followers_count;
          verified = twitterData.verified || false;
        } else if (twitterData.data) {
          followerCount = twitterData.data.public_metrics?.followers_count || 0;
          verified = twitterData.data.verified || false;
        }

        console.log(`Twitter data for @${username}: ${followerCount} followers, verified: ${verified}`);

        // Update user in database with Twitter data
        await firestore.collection('users').doc(userId).update({
          twitterUsername: username,
          twitterFollowers: followerCount,
          twitterVerified: verified,
          twitterLastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ 
          success: true,
          message: 'Twitter data refreshed successfully',
          followers: followerCount,
          verified: verified
        });
      } catch (error) {
        console.error('Error refreshing Twitter data:', error);
        return res.status(500).json({ 
          success: false,
          message: 'Failed to refresh Twitter data',
          error: error.message
        });
      }
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

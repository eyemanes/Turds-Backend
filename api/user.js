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

      // Check if user exists first
      const existingUser = await firestore.collection('users').doc(userData.uid).get();
      const existingData = existingUser.exists ? existingUser.data() : {};

      const userRecord = {
        uid: userData.uid,
        username: userData.username || existingData.username || 'Anonymous',
        email: userData.email || existingData.email || null,
        profilePicture: userData.profilePicture || existingData.profilePicture || null,
        twitterUsername: userData.twitterUsername || existingData.twitterUsername || null,
        twitterFollowers: existingData.twitterFollowers || 0,
        twitterVerified: existingData.twitterVerified || false,
        walletAddress: existingData.walletAddress || null,
        isAdmin: existingData.isAdmin || false,
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('users').doc(userData.uid).set(userRecord, { merge: true });

      // If Twitter username provided, fetch Twitter data
      if (userData.twitterUsername && !existingData.twitterFollowers) {
        try {
          const twitterResponse = await fetch(`https://twitter241.p.rapidapi.com/user?username=${userData.twitterUsername}`, {
            method: 'GET',
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY || '20fd5100f3msh8ad5102149a060ep18b8adjsn04eed04ad53d',
              'x-rapidapi-host': 'twitter241.p.rapidapi.com'
            }
          });

          if (twitterResponse.ok) {
            const twitterData = await twitterResponse.json();
            let followerCount = 0;
            let verified = false;
            
            if (twitterData.result) {
              const userResult = twitterData.result.result || twitterData.result;
              if (userResult.legacy) {
                followerCount = userResult.legacy.followers_count || 0;
                verified = userResult.legacy.verified || false;
              }
            }

            await firestore.collection('users').doc(userData.uid).update({
              twitterFollowers: followerCount,
              twitterVerified: verified
            });

            userRecord.twitterFollowers = followerCount;
            userRecord.twitterVerified = verified;
          }
        } catch (error) {
          console.error('Error fetching Twitter data during registration:', error);
        }
      }

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
          user: {
            uid: userId,
            walletAddress: userData.walletAddress || null,
            username: userData.username,
            email: userData.email,
            profilePicture: userData.profilePicture,
            twitter: userData.twitter,
            twitterUsername: userData.twitterUsername || null,
            twitterFollowers: userData.twitterFollowers || 0,
            twitterVerified: userData.twitterVerified || false,
            isAdmin: userData.isAdmin || false,
            tokenBalance: userData.tokenBalance || 0
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

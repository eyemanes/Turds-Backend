import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';
import { 
  validateFirebaseUid, 
  validateEmail, 
  validateUsername, 
  validateWalletAddress,
  sanitizeInput 
} from '../lib/validation.js';
import logger from '../lib/logger.js';

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
    logger.logError(error, 'Firebase initialization');
    return null;
  }
}

export default async function handler(req, res) {
  // Log request for audit trail
  logger.logRequest(req, 'User API request');
  
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  const firestore = initializeFirebase();
  if (!firestore) {
    logger.logError(new Error('Firebase initialization failed'), 'User API');
    return res.status(500).json({ error: 'Database initialization failed' });
  }

  try {
    const action = req.query.action || req.body.action;

    // REGISTER USER - Complete user registration with all fields
    if (action === 'register') {
      const userData = req.body;
      
      logger.debug('User registration attempt', { uid: userData.uid });
      
      // Validate required fields
      if (!userData.uid) {
        return res.status(400).json({ error: 'User ID required' });
      }

      // Validate user ID format
      const uidValidation = validateFirebaseUid(userData.uid);
      if (!uidValidation.valid) {
        logger.logSecurityEvent('Invalid user ID format', { uid: userData.uid });
        return res.status(400).json({ error: uidValidation.error });
      }

      // Check if user exists first
      const existingUser = await firestore.collection('users').doc(userData.uid).get();
      const existingData = existingUser.exists ? existingUser.data() : {};

      // Validate and sanitize user data
      const username = userData.username || userData.twitterUsername || existingData.username || 'Anonymous';
      const email = userData.email || existingData.email || null;
      const profilePicture = userData.profilePicture || existingData.profilePicture || null;
      
      // Validate email if provided
      if (email) {
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
          logger.logSecurityEvent('Invalid email format', { email, uid: userData.uid });
          return res.status(400).json({ error: emailValidation.error });
        }
      }

      // Validate username
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        logger.logSecurityEvent('Invalid username format', { username, uid: userData.uid });
        return res.status(400).json({ error: usernameValidation.error });
      }

      // Build complete user record
      const userRecord = {
        // Basic Info
        uid: userData.uid,
        username: usernameValidation.value,
        email: email ? emailValidation.value : null,
        profilePicture: profilePicture ? sanitizeInput(profilePicture) : null,
        
        // Twitter Data
        twitterUsername: userData.twitterUsername ? sanitizeInput(userData.twitterUsername) : existingData.twitterUsername || null,
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

      // ALWAYS fetch Twitter data on registration if username provided
      const twitterUsername = userData.twitterUsername || userData.username;
      console.log('Twitter fetch check - twitterUsername:', userData.twitterUsername, 'username:', userData.username, 'final:', twitterUsername);
      console.log('All userData fields:', Object.keys(userData));
      
      if (twitterUsername && twitterUsername !== 'Anonymous' && twitterUsername !== 'null' && twitterUsername !== 'undefined') {
        console.log('Starting Twitter fetch for:', twitterUsername);
        try {
          // Use AbortController for proper timeout handling
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
          
          // Validate required environment variables
          if (!process.env.RAPIDAPI_KEY) {
            throw new Error('RAPIDAPI_KEY environment variable is not configured');
          }

          const twitterResponse = await fetch(`https://twitter241.p.rapidapi.com/user?username=${twitterUsername}`, {
            method: 'GET',
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
              'x-rapidapi-host': 'twitter241.p.rapidapi.com'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          console.log('Twitter API response status:', twitterResponse.status);

          if (twitterResponse.ok) {
            const twitterData = await twitterResponse.json();
            console.log('Twitter API response received for', twitterUsername);
            
            let followerCount = 0;
            let followingCount = 0;
            let tweetsCount = 0;
            let verified = false;
            let bio = '';
            let accountCreatedAt = null;
            
            // Extract data from Twitter API response
            console.log('Twitter API response structure:', JSON.stringify(twitterData, null, 2));
            
            if (twitterData.result && twitterData.result.data && twitterData.result.data.user) {
              const userResult = twitterData.result.data.user.result;
              console.log('Extracted user result:', JSON.stringify(userResult, null, 2));
              
              if (userResult && userResult.legacy) {
                followerCount = userResult.legacy.followers_count || 0;
                followingCount = userResult.legacy.friends_count || 0;
                tweetsCount = userResult.legacy.statuses_count || 0;
                verified = userResult.verification?.verified || userResult.legacy.verified || false;
                bio = userResult.legacy.description || '';
                accountCreatedAt = userResult.core?.created_at || userResult.legacy.created_at || null;
                
                console.log('Extracted data:', {
                  followerCount,
                  followingCount,
                  tweetsCount,
                  verified,
                  bio,
                  accountCreatedAt
                });
              }
            } else {
              console.log('Twitter API response structure not as expected:', Object.keys(twitterData));
            }

            // Calculate account age in months
            let accountAgeMonths = 0;
            if (accountCreatedAt) {
              const createdDate = new Date(accountCreatedAt);
              const now = new Date();
              accountAgeMonths = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24 * 30));
            }

            // Check candidacy eligibility (500+ followers AND 1M+ tokens)
            const eligibleForCandidacy = followerCount >= 500 && userRecord.tokenBalance >= 1000000;

            // Store Twitter data in separate collection
            const twitterDataToStore = {
              userId: userData.uid,
              username: twitterUsername,
              followers: followerCount,
              following: followingCount,
              tweets: tweetsCount,
              verified: verified,
              bio: bio,
              accountCreatedAt: accountCreatedAt,
              accountAgeMonths: accountAgeMonths,
              dataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
              eligibleForCandidacy: eligibleForCandidacy,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Store in twitter_data collection
            await firestore.collection('twitter_data').doc(userData.uid).set(twitterDataToStore, { merge: true });

            // Update user with basic Twitter info
            const userUpdate = {
              twitterFollowers: followerCount,
              twitterVerified: verified,
              eligibleForCandidacy: eligibleForCandidacy,
              twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            await firestore.collection('users').doc(userData.uid).update(userUpdate);
            
            // Update the userRecord for response to include Twitter data
            Object.assign(userRecord, userUpdate);
            console.log(`Twitter data stored for ${twitterUsername}: ${followerCount} followers, eligible: ${eligibleForCandidacy}`);
          } else {
            console.error('Twitter API error - Status:', twitterResponse.status);
            const errorText = await twitterResponse.text();
            console.error('Twitter API error response:', errorText);
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            console.error('Twitter API timeout for', twitterUsername, 'after 15 seconds');
          } else {
            console.error('Error fetching Twitter data during registration:', error);
          }
          
          // Store user with Twitter data pending flag
          await firestore.collection('users').doc(userData.uid).update({
            twitterUsername: twitterUsername,
            twitterDataPending: true,
            twitterDataFetchedAt: null
          });
          
          console.log('User registered with Twitter data pending fetch');
        }
      } else {
        console.log('SKIPPING Twitter fetch - Reason:', {
          twitterUsername: userData.twitterUsername,
          username: userData.username,
          final: twitterUsername,
          isAnonymous: twitterUsername === 'Anonymous',
          isNull: twitterUsername === 'null',
          isUndefined: twitterUsername === 'undefined'
        });
      }
      
      // Re-fetch the complete user record after all updates
      const finalUserDoc = await firestore.collection('users').doc(userData.uid).get();
      const finalUserData = finalUserDoc.data();

      return res.status(200).json({ 
        success: true, 
        user: {
          uid: userData.uid,
          ...finalUserData,
          // Ensure Twitter data is included
          twitterFollowers: finalUserData.twitterFollowers || 0,
          eligibleForCandidacy: finalUserData.eligibleForCandidacy || false
        },
        message: 'User registered successfully'
      });
    }

    // GET USER BY ID
    if (action === 'get-user') {
      const userId = req.query.userId || req.query.uid;
      
      console.log('=== GET USER DEBUG ===');
      console.log('Requested userId:', userId);
      console.log('Query params:', req.query);
      console.log('Request method:', req.method);
      console.log('Request URL:', req.url);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        
        console.log('User document exists:', userDoc.exists);
        console.log('User document data:', userDoc.data());
        
        if (!userDoc.exists) {
          console.log('User not found in database for ID:', userId);
          // Return empty user data instead of 404 to prevent frontend errors
          return res.status(200).json({
            success: true,
            user: {
              uid: userId,
              username: 'Unknown',
              twitterFollowers: 0,
              twitterVerified: false,
              tokenBalance: 0,
              eligibleForCandidacy: false,
              walletAddress: null
            },
            message: 'User not found, returning default data'
          });
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
            isAdmin: userData.isAdmin || false, // Return actual admin status from database
            
            // Timestamps
            joinedAt: userData.joinedAt || null,
            lastLogin: userData.lastLogin || null,
            lastActive: userData.lastActive || null
          }
        });
      } catch (error) {
        logger.logError(error, 'User fetch');
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
    }

    // UPDATE WALLET ADDRESS
    if (action === 'update-wallet') {
      const { userId, walletAddress } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      // Validate user ID
      const uidValidation = validateFirebaseUid(userId);
      if (!uidValidation.valid) {
        logger.logSecurityEvent('Invalid user ID in wallet update', { userId });
        return res.status(400).json({ error: uidValidation.error });
      }

      // Validate wallet address if provided
      if (walletAddress) {
        const walletValidation = validateWalletAddress(walletAddress);
        if (!walletValidation.valid) {
          logger.logSecurityEvent('Invalid wallet address', { walletAddress, userId });
          return res.status(400).json({ error: walletValidation.error });
        }
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
            // Validate required environment variables
            if (!process.env.TURDS_MINT_ADDRESS) {
              console.error('TURDS_MINT_ADDRESS environment variable is not configured');
              return res.status(500).json({ 
                success: false, 
                error: 'Token configuration error' 
              });
            }

            const tokenResponse = await fetch(`https://turds-backend.vercel.app/api/token-balance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                walletAddress: walletAddress,
                mintAddress: process.env.TURDS_MINT_ADDRESS
              })
            });
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              updateData.tokenBalance = tokenData.uiAmount || 0;
              
              // Also update eligibility based on new token balance
              const userDoc = await firestore.collection('users').doc(userId).get();
              const currentFollowers = userDoc.data()?.twitterFollowers || 0;
              updateData.eligibleForCandidacy = currentFollowers >= 500 && updateData.tokenBalance >= 1000000;
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
        logger.logError(error, 'Wallet update');
        return res.status(500).json({ error: 'Failed to update wallet' });
      }
    }
    
    // GET USER DATA (removed duplicate - using the one above)

    // UPDATE STEALTH MODE
    if (action === 'update-stealth') {
      const { userId, stealthMode } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      try {
        await firestore.collection('users').doc(userId).update({
          stealthMode: stealthMode === true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({
          success: true,
          message: 'Stealth mode updated successfully'
        });
      } catch (error) {
        logger.logError(error, 'Stealth mode update');
        return res.status(500).json({ error: 'Failed to update stealth mode' });
      }
    }

    // REFRESH TWITTER DATA
    if (action === 'refresh-twitter') {
      const { userId, username } = req.body;
      
      if (!userId || !username) {
        return res.status(400).json({ error: 'Missing userId or username' });
      }

      // Rate limiting: 1 refresh per day
      try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        if (userData?.twitterDataFetchedAt) {
          const lastRefresh = userData.twitterDataFetchedAt.toDate();
          const now = new Date();
          const hoursSinceLastRefresh = (now - lastRefresh) / (1000 * 60 * 60);
          
          if (hoursSinceLastRefresh < 24) {
            const hoursRemaining = Math.ceil(24 - hoursSinceLastRefresh);
            return res.status(429).json({ 
              error: 'Rate limit exceeded',
              message: `Twitter data can only be refreshed once per day. Try again in ${hoursRemaining} hours.`,
              nextRefreshAvailable: new Date(lastRefresh.getTime() + 24 * 60 * 60 * 1000).toISOString()
            });
          }
        }
      } catch (error) {
        console.error('Rate limit check error:', error);
        // Continue with refresh if rate limit check fails
      }

      try {
        // Validate required environment variables
        if (!process.env.RAPIDAPI_KEY) {
          throw new Error('RAPIDAPI_KEY environment variable is not configured');
        }

        // Call Twitter API to get user data
        const twitterResponse = await fetch(`https://twitter241.p.rapidapi.com/user?username=${username}`, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
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
        let followingCount = 0;
        let tweetsCount = 0;
        let bio = '';
        let accountCreatedAt = null;
        
        console.log('Refresh Twitter API response structure:', JSON.stringify(twitterData, null, 2));
        
        // Handle the correct response structure
        if (twitterData.result && twitterData.result.data && twitterData.result.data.user) {
          const userResult = twitterData.result.data.user.result;
          console.log('Refresh extracted user result:', JSON.stringify(userResult, null, 2));
          
          if (userResult && userResult.legacy) {
            followerCount = userResult.legacy.followers_count || 0;
            followingCount = userResult.legacy.friends_count || 0;
            tweetsCount = userResult.legacy.statuses_count || 0;
            verified = userResult.verification?.verified || userResult.legacy.verified || false;
            bio = userResult.legacy.description || '';
            accountCreatedAt = userResult.core?.created_at || userResult.legacy.created_at || null;
            
            console.log('Refresh extracted data:', {
              followerCount,
              followingCount,
              tweetsCount,
              verified,
              bio,
              accountCreatedAt
            });
          }
        } else {
          console.log('Refresh Twitter API response structure not as expected:', Object.keys(twitterData));
        }

        console.log(`Twitter data for @${username}: ${followerCount} followers, verified: ${verified}`);

        // Get current token balance to check eligibility
        const userDoc = await firestore.collection('users').doc(userId).get();
        const currentTokenBalance = userDoc.data()?.tokenBalance || 0;
        const eligibleForCandidacy = followerCount >= 500 && currentTokenBalance >= 1000000;

        // Calculate account age in months
        let accountAgeMonths = 0;
        if (accountCreatedAt) {
          const createdDate = new Date(accountCreatedAt);
          const now = new Date();
          accountAgeMonths = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24 * 30));
        }

        // Store detailed Twitter data in separate collection
        const twitterDataToStore = {
          userId: userId,
          username: username,
          followers: followerCount,
          following: followingCount,
          tweets: tweetsCount,
          verified: verified,
          bio: bio,
          accountCreatedAt: accountCreatedAt,
          accountAgeMonths: accountAgeMonths,
          dataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
          eligibleForCandidacy: eligibleForCandidacy,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Store in twitter_data collection
        await firestore.collection('twitter_data').doc(userId).set(twitterDataToStore, { merge: true });

        // Update user in database with basic Twitter data
        await firestore.collection('users').doc(userId).update({
          twitterUsername: username,
          twitterFollowers: followerCount,
          twitterVerified: verified,
          twitterDataFetchedAt: admin.firestore.FieldValue.serverTimestamp(),
          eligibleForCandidacy: eligibleForCandidacy
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

    // Fallback for direct GET requests without action parameter
    if (req.method === 'GET' && !action) {
      const userId = req.query.userId || req.query.uid;
      
      console.log('=== FALLBACK GET USER ===');
      console.log('Requested userId:', userId);
      
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      try {
        const userDoc = await firestore.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
          return res.status(200).json({
            success: true,
            user: {
              uid: userId,
              username: 'Unknown',
              twitterFollowers: 0,
              twitterVerified: false,
              tokenBalance: 0,
              eligibleForCandidacy: false,
              walletAddress: null
            },
            message: 'User not found, returning default data'
          });
        }
        
        const userData = userDoc.data();
        return res.status(200).json({
          success: true,
          user: {
            uid: userId,
            username: userData.username || 'Anonymous',
            email: userData.email || null,
            profilePicture: userData.profilePicture || null,
            twitterUsername: userData.twitterUsername || null,
            twitterFollowers: userData.twitterFollowers || 0,
            twitterVerified: userData.twitterVerified || false,
            walletAddress: userData.walletAddress || null,
            tokenBalance: userData.tokenBalance || 0,
            eligibleForCandidacy: userData.eligibleForCandidacy || false,
            isAdmin: false // Only set by server-side admin functions
          }
        });
      } catch (error) {
        console.error('Fallback user fetch error:', error);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    logger.logError(error, 'User API');
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

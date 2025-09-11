import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';

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
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  const firestore = initializeFirebase();
  if (!firestore) {
    return res.status(500).json({ 
      error: 'Database connection failed',
      success: false
    });
  }

  const { action } = req.query;

  try {
    // GET ALL ACTIVE POLLS (for Vote page)
    if (action === 'get-active-polls') {
      try {
        const pollsSnapshot = await firestore
          .collection('government_polls')
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .get();
        
        const polls = [];
        if (!pollsSnapshot.empty) {
          pollsSnapshot.forEach(doc => {
            const data = doc.data();
            polls.push({
              id: doc.id,
              question: data.question,
              options: data.options || [],
              createdBy: data.createdBy,
              createdByRole: data.createdByRole || 'government',
              createdAt: data.createdAt?.toDate() || new Date(),
              totalVotes: data.totalVotes || 0,
              voters: data.voters || []
            });
          });
        }

        return res.status(200).json({
          success: true,
          polls
        });
      } catch (error) {
        return res.status(200).json({
          success: true,
          polls: []
        });
      }
    }

    // CAST VOTE
    if (action === 'cast-vote') {
      const { pollId, optionIndex, userId, userWallet } = req.body;

      if (!pollId || optionIndex === undefined || !userId) {
        return res.status(400).json({ 
          error: 'Poll ID, option index, and user ID are required',
          success: false 
        });
      }

      const pollRef = firestore.collection('government_polls').doc(pollId);
      const pollDoc = await pollRef.get();

      if (!pollDoc.exists) {
        return res.status(404).json({ 
          error: 'Poll not found',
          success: false 
        });
      }

      const pollData = pollDoc.data();

      // Check if user already voted
      if (pollData.voters && pollData.voters.includes(userId)) {
        return res.status(400).json({ 
          error: 'You have already voted on this poll',
          success: false 
        });
      }

      // Update vote count
      const options = [...pollData.options];
      if (optionIndex >= 0 && optionIndex < options.length) {
        options[optionIndex].votes = (options[optionIndex].votes || 0) + 1;
      } else {
        return res.status(400).json({ 
          error: 'Invalid option selected',
          success: false 
        });
      }

      // Update poll with new vote
      await pollRef.update({
        options,
        totalVotes: admin.firestore.FieldValue.increment(1),
        voters: admin.firestore.FieldValue.arrayUnion(userId)
      });

      // Log the vote
      await firestore.collection('vote_logs').add({
        pollId,
        userId,
        userWallet,
        optionIndex,
        votedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: 'Vote recorded successfully'
      });
    }

    // GET USER VOTE STATUS
    if (action === 'check-vote-status') {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ 
          error: 'User ID is required',
          success: false 
        });
      }

      try {
        // Get all active polls
        const pollsSnapshot = await firestore
          .collection('government_polls')
          .where('isActive', '==', true)
          .get();
        
        const voteStatus = {};
        if (!pollsSnapshot.empty) {
          pollsSnapshot.forEach(doc => {
            const data = doc.data();
            voteStatus[doc.id] = {
              hasVoted: data.voters ? data.voters.includes(userId) : false
            };
          });
        }

        return res.status(200).json({
          success: true,
          voteStatus
        });
      } catch (error) {
        return res.status(200).json({
          success: true,
          voteStatus: {}
        });
      }
    }

    return res.status(400).json({ 
      error: 'Invalid action',
      success: false 
    });

  } catch (error) {
    console.error('Vote Hub API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      success: false,
      details: error.message 
    });
  }
}

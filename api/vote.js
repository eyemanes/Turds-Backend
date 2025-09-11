import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (privateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  try {
    // Cast a vote
    if (req.method === 'POST') {
      const { voterId, candidateId, electionType } = req.body;
      
      if (!voterId || !candidateId) {
        return res.status(400).json({ error: 'Voter and candidate IDs required' });
      }

      // Check voter eligibility (6+ months old Twitter account)
      const voterDoc = await db.collection('users').doc(voterId).get();
      
      if (!voterDoc.exists) {
        return res.status(403).json({ error: 'User not found' });
      }
      
      const voterData = voterDoc.data();
      
      // Check if account is old enough to vote
      if (!voterData.eligibleToVote || voterData.twitterAccountAgeMonths < 6) {
        return res.status(403).json({ 
          error: 'Your Twitter account must be at least 6 months old to vote',
          accountAge: voterData.twitterAccountAgeMonths || 0,
          required: 6
        });
      }

      // Check if already voted
      const existingVote = await db.collection('votes')
        .where('voterId', '==', voterId)
        .where('electionType', '==', electionType || 'general')
        .get();
      
      if (!existingVote.empty) {
        return res.status(400).json({ error: 'Already voted in this election' });
      }

      // Create vote record
      await db.collection('votes').add({
        voterId,
        candidateId,
        electionType: electionType || 'general',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Increment candidate vote count
      await db.collection('candidates').doc(candidateId).update({
        votes: admin.firestore.FieldValue.increment(1),
        supportersCount: admin.firestore.FieldValue.increment(1)
      });

      return res.status(200).json({ 
        success: true, 
        message: 'Vote recorded successfully'
      });
    }

    // Get vote status
    if (req.method === 'GET') {
      const { voterId, electionType } = req.query;
      
      if (!voterId) {
        return res.status(400).json({ error: 'Voter ID required' });
      }

      const voteQuery = await db.collection('votes')
        .where('voterId', '==', voterId)
        .where('electionType', '==', electionType || 'general')
        .get();
      
      const hasVoted = !voteQuery.empty;
      let votedFor = null;
      
      if (hasVoted) {
        const voteData = voteQuery.docs[0].data();
        votedFor = voteData.candidateId;
      }

      return res.status(200).json({ 
        success: true, 
        hasVoted,
        votedFor
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Vote API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

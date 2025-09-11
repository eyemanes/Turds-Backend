import { admin, getFirestore } from '../lib/firebase-init.js';
import { setSecureCorsHeaders, rateLimit, sanitizeInput } from '../lib/cors.js';
import logger from '../lib/logger.js';
import { requireAuth, validateRequest } from '../lib/middleware.js';
import { validateFirebaseUid } from '../lib/validation.js';

// Validation schemas
const voteSchema = {
  voterId: {
    required: true,
    type: 'string',
    validate: (value) => validateFirebaseUid(value).valid || 'Invalid voter ID'
  },
  candidateId: {
    required: true,
    type: 'string',
    validate: (value) => validateFirebaseUid(value).valid || 'Invalid candidate ID'
  },
  electionType: {
    required: false,
    type: 'string',
    validate: (value) => ['general', 'primary', 'special'].includes(value) || 'Invalid election type'
  }
};

export default async function handler(req, res) {
  // Apply security middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }
  
  // Apply rate limiting - stricter for voting
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
  const voteRateLimit = { maxRequests: 10, windowMs: 60000 }; // 10 votes per minute max
  rateLimit(req, res);
  
  // Sanitize inputs
  sanitizeInput(req, res);
  
  // Log request
  logger.logRequest(req, 'Vote API');
  
  const db = getFirestore();
  if (!db) {
    logger.error('Database not configured');
    return res.status(500).json({ error: 'Database initialization failed' });
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

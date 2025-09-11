import admin from 'firebase-admin';
import { 
  validateFirebaseUid, 
  validateObjectId, 
  validateElectionType,
  checkRateLimit 
} from '../lib/validation.js';
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
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  // Get client IP for rate limiting
  const clientIp = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection?.remoteAddress || 
                   'unknown';

  try {
    // Cast a vote
    if (req.method === 'POST') {
      // Rate limiting - 5 votes per minute per IP
      const rateLimit = checkRateLimit(`vote_${clientIp}`, 5, 60000);
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: rateLimit.error,
          retryAfter: rateLimit.remainingTime 
        });
      }
      
      const { voterId, candidateId, electionType } = req.body;
      
      // Validate inputs
      const voterValidation = validateFirebaseUid(voterId);
      if (!voterValidation.valid) {
        return res.status(400).json({ error: voterValidation.error });
      }
      
      const candidateValidation = validateObjectId(candidateId);
      if (!candidateValidation.valid) {
        return res.status(400).json({ error: candidateValidation.error });
      }
      
      const electionValidation = validateElectionType(electionType || 'general');
      if (!electionValidation.valid) {
        return res.status(400).json({ error: electionValidation.error });
      }
      
      // Use validated values
      const validVoterId = voterValidation.value;
      const validCandidateId = candidateValidation.value;
      const validElectionType = electionValidation.value;
      
      // Start transaction for vote integrity
      const voteResult = await db.runTransaction(async (transaction) => {
        // Check voter eligibility
        const voterRef = db.collection('users').doc(validVoterId);
        const voterDoc = await transaction.get(voterRef);
        
        if (!voterDoc.exists) {
          throw new Error('User not found');
        }
        
        const voterData = voterDoc.data();
        
        // Verify account age (6+ months)
        if (!voterData.eligibleToVote || voterData.twitterAccountAgeMonths < 6) {
          throw new Error('Account must be at least 6 months old to vote');
        }
        
        // Check if already voted
        const votesRef = db.collection('votes');
        const existingVoteQuery = await transaction.get(
          votesRef
            .where('voterId', '==', validVoterId)
            .where('electionType', '==', validElectionType)
            .limit(1)
        );
        
        if (!existingVoteQuery.empty) {
          throw new Error('Already voted in this election');
        }
        
        // Verify candidate exists
        const candidateRef = db.collection('candidates').doc(validCandidateId);
        const candidateDoc = await transaction.get(candidateRef);
        
        if (!candidateDoc.exists) {
          throw new Error('Candidate not found');
        }
        
        // Create vote record with timestamp
        const voteData = {
          voterId: validVoterId,
          candidateId: validCandidateId,
          electionType: validElectionType,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          ip: clientIp, // Store for audit purposes
          userAgent: req.headers['user-agent']
        };
        
        const voteRef = votesRef.doc(); // Create new document
        transaction.set(voteRef, voteData);
        
        // Update candidate vote count
        transaction.update(candidateRef, {
          votes: admin.firestore.FieldValue.increment(1),
          supportersCount: admin.firestore.FieldValue.increment(1),
          lastVoteAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Log the vote for audit
        const auditRef = db.collection('audit_logs').doc();
        transaction.set(auditRef, {
          type: 'vote_cast',
          voterId: validVoterId,
          candidateId: validCandidateId,
          electionType: validElectionType,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          ip: clientIp
        });
        
        return { success: true, voteId: voteRef.id };
      });
      
      return res.status(200).json({ 
        success: true, 
        message: 'Vote recorded successfully',
        voteId: voteResult.voteId
      });
      
    }

    // Get vote status
    if (req.method === 'GET') {
      // Rate limiting for status checks
      const rateLimit = checkRateLimit(`vote_status_${clientIp}`, 20, 60000);
      if (!rateLimit.allowed) {
        return res.status(429).json({ 
          error: rateLimit.error,
          retryAfter: rateLimit.remainingTime 
        });
      }
      
      const { voterId, electionType } = req.query;
      
      // Validate voter ID
      const voterValidation = validateFirebaseUid(voterId);
      if (!voterValidation.valid) {
        return res.status(400).json({ error: voterValidation.error });
      }
      
      const validVoterId = voterValidation.value;
      const validElectionType = electionType || 'general';
      
      // Check vote status
      const voteQuery = await db.collection('votes')
        .where('voterId', '==', validVoterId)
        .where('electionType', '==', validElectionType)
        .limit(1)
        .get();
      
      const hasVoted = !voteQuery.empty;
      let votedFor = null;
      let votedAt = null;
      
      if (hasVoted) {
        const voteData = voteQuery.docs[0].data();
        votedFor = voteData.candidateId;
        votedAt = voteData.timestamp?.toDate?.()?.toISOString() || null;
      }

      return res.status(200).json({ 
        success: true, 
        hasVoted,
        votedFor,
        votedAt
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Vote API error:', error);
    
    // Handle specific errors
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message === 'Already voted in this election' || 
        error.message === 'Account must be at least 6 months old to vote') {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message === 'Candidate not found') {
      return res.status(404).json({ error: error.message });
    }
    
    // Generic error
    return res.status(500).json({ 
      error: 'Failed to process vote',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

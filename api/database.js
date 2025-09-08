import admin from 'firebase-admin';

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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const path = req.url.split('?')[0];
    
    // User registration/login
    if (path === '/api/auth/register' && req.method === 'POST') {
      const { uid, username, email, profilePicture, walletAddress } = req.body;
      
      const userData = {
        uid,
        username: username || 'Anonymous',
        email: email || null,
        profilePicture: profilePicture || null,
        walletAddress: walletAddress || null,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActive: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        role: 'citizen',
        tokenBalance: 0,
        verifiedHolder: false
      };

      await db.collection('users').doc(uid).set(userData, { merge: true });
      
      // Also create a citizen record
      await db.collection('citizens').doc(uid).set({
        ...userData,
        citizenNumber: Date.now()
      }, { merge: true });
      
      return res.status(200).json({ success: true, user: userData });
    }

    // Get user profile
    if (path === '/api/auth/user' && req.method === 'GET') {
      const { uid } = req.query;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      return res.status(200).json({ 
        success: true, 
        user: { id: userDoc.id, ...userDoc.data() }
      });
    }

    // Update user profile
    if (path === '/api/auth/update' && req.method === 'PUT') {
      const { uid, ...updates } = req.body;
      
      if (!uid) {
        return res.status(400).json({ error: 'User ID required' });
      }
      
      updates.lastActive = admin.firestore.FieldValue.serverTimestamp();
      
      await db.collection('users').doc(uid).update(updates);
      await db.collection('citizens').doc(uid).update(updates);
      
      return res.status(200).json({ success: true, message: 'Profile updated' });
    }

    // Create candidate profile
    if (path === '/api/candidates' && req.method === 'POST') {
      const candidateData = {
        ...req.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        supportersCount: 0,
        votes: 0,
        endorsements: []
      };

      const docRef = await db.collection('candidates').add(candidateData);
      
      // Update user record to mark as candidate
      if (req.body.userId) {
        await db.collection('users').doc(req.body.userId).update({
          isCandidate: true,
          candidateId: docRef.id
        });
      }
      
      return res.status(201).json({ 
        success: true, 
        id: docRef.id,
        message: 'Candidate profile created'
      });
    }

    // Get all candidates
    if (path === '/api/candidates' && req.method === 'GET') {
      const snapshot = await db.collection('candidates')
        .where('isActive', '==', true)
        .get();
      
      const candidates = [];
      snapshot.forEach(doc => {
        candidates.push({ id: doc.id, ...doc.data() });
      });
      
      candidates.sort((a, b) => (b.votes || 0) - (a.votes || 0));
      
      return res.status(200).json({ 
        success: true, 
        candidates,
        total: candidates.length
      });
    }

    // Vote for candidate
    if (path === '/api/vote' && req.method === 'POST') {
      const { voterId, candidateId, electionType } = req.body;
      
      if (!voterId || !candidateId) {
        return res.status(400).json({ error: 'Voter and candidate IDs required' });
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
    if (path === '/api/vote/status' && req.method === 'GET') {
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

    // Get all citizens
    if (path === '/api/citizens' && req.method === 'GET') {
      const snapshot = await db.collection('citizens').get();
      const citizens = [];
      
      snapshot.forEach(doc => {
        citizens.push({ id: doc.id, ...doc.data() });
      });
      
      return res.status(200).json({ 
        success: true, 
        citizens,
        total: citizens.length
      });
    }

    // Get stats
    if (path === '/api/stats' && req.method === 'GET') {
      const [usersSnapshot, candidatesSnapshot, votesSnapshot] = await Promise.all([
        db.collection('users').get(),
        db.collection('candidates').get(),
        db.collection('votes').get()
      ]);

      return res.status(200).json({
        success: true,
        stats: {
          totalUsers: usersSnapshot.size,
          totalCandidates: candidatesSnapshot.size,
          totalVotes: votesSnapshot.size,
          timestamp: new Date().toISOString()
        }
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

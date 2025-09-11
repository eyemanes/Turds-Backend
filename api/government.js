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
  const firestore = initializeFirebase();
  if (!firestore) {
    return res.status(500).json({ error: 'Database connection failed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    // GET POLLS
    if (action === 'get-polls') {
      const pollsSnapshot = await firestore
        .collection('government_polls')
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      const polls = [];
      pollsSnapshot.forEach(doc => {
        const data = doc.data();
        polls.push({
          id: doc.id,
          question: data.question,
          options: data.options,
          createdBy: data.createdBy,
          createdAt: data.createdAt?.toDate() || new Date(),
          isActive: data.isActive,
          totalVotes: data.totalVotes || 0
        });
      });

      return res.status(200).json({
        success: true,
        polls
      });
    }

    // CREATE POLL
    if (action === 'create-poll') {
      const { question, options, createdBy } = req.body;

      if (!question || !options || options.length < 2) {
        return res.status(400).json({ 
          error: 'Question and at least 2 options are required' 
        });
      }

      const pollData = {
        question,
        options: options.map(opt => ({
          text: opt,
          votes: 0
        })),
        createdBy: createdBy || 'Government',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        totalVotes: 0,
        voters: []
      };

      const docRef = await firestore.collection('government_polls').add(pollData);

      return res.status(200).json({
        success: true,
        pollId: docRef.id
      });
    }

    // VOTE ON POLL
    if (action === 'vote') {
      const { pollId, optionIndex, userId } = req.body;

      if (!pollId || optionIndex === undefined || !userId) {
        return res.status(400).json({ 
          error: 'Poll ID, option index, and user ID are required' 
        });
      }

      const pollRef = firestore.collection('government_polls').doc(pollId);
      const pollDoc = await pollRef.get();

      if (!pollDoc.exists) {
        return res.status(404).json({ error: 'Poll not found' });
      }

      const pollData = pollDoc.data();

      // Check if user already voted
      if (pollData.voters && pollData.voters.includes(userId)) {
        return res.status(400).json({ error: 'User has already voted on this poll' });
      }

      // Update vote count
      const options = pollData.options;
      options[optionIndex].votes += 1;

      await pollRef.update({
        options,
        totalVotes: admin.firestore.FieldValue.increment(1),
        voters: admin.firestore.FieldValue.arrayUnion(userId)
      });

      return res.status(200).json({
        success: true,
        message: 'Vote recorded successfully'
      });
    }

    // CLOSE POLL
    if (action === 'close-poll') {
      const { pollId } = req.body;

      if (!pollId) {
        return res.status(400).json({ error: 'Poll ID is required' });
      }

      await firestore.collection('government_polls').doc(pollId).update({
        isActive: false,
        closedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: 'Poll closed successfully'
      });
    }

    // GET GOVERNMENT MEMBERS
    if (action === 'get-members') {
      const membersSnapshot = await firestore
        .collection('users')
        .where('role', '==', 'government')
        .get();
      
      const members = [];
      membersSnapshot.forEach(doc => {
        const data = doc.data();
        members.push({
          id: doc.id,
          username: data.username,
          governmentRole: data.governmentRole,
          appointedAt: data.appointedAt?.toDate() || null
        });
      });

      return res.status(200).json({
        success: true,
        members
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Government API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

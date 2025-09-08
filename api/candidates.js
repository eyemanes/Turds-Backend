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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const candidateData = req.body;
      
      const docData = {
        ...candidateData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        supportersCount: 0,
        votes: 0,
        endorsements: []
      };

      const docRef = await db.collection('candidates').add(docData);
      
      // Update user record if userId provided
      if (candidateData.userId) {
        await db.collection('users').doc(candidateData.userId).set({
          isCandidate: true,
          candidateId: docRef.id
        }, { merge: true });
      }
      
      return res.status(201).json({ 
        success: true, 
        id: docRef.id,
        message: 'Candidate profile created'
      });
    }

    if (req.method === 'GET') {
      const snapshot = await db.collection('candidates')
        .where('isActive', '==', true)
        .get();
      
      const candidates = [];
      snapshot.forEach(doc => {
        candidates.push({ 
          id: doc.id, 
          ...doc.data(),
          // Convert Firestore timestamps to ISO strings
          createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null
        });
      });
      
      // Sort by votes/supporters
      candidates.sort((a, b) => (b.votes || 0) - (a.votes || 0));
      
      return res.status(200).json({ 
        success: true, 
        candidates,
        total: candidates.length
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Candidates API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

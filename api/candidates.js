import admin from 'firebase-admin';

// Initialize Firebase Admin only once
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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Initialize Firebase
    const firestore = initializeFirebase();
    
    if (!firestore) {
      // Return mock data if Firebase isn't configured
      if (req.method === 'POST') {
        return res.status(201).json({
          success: true,
          id: `temp_${Date.now()}`,
          message: 'Candidate created (temporary - database not configured)'
        });
      }
      
      if (req.method === 'GET') {
        return res.status(200).json({
          success: true,
          candidates: [],
          total: 0,
          message: 'Database not configured'
        });
      }
    }

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

      const docRef = await firestore.collection('candidates').add(docData);
      
      return res.status(201).json({ 
        success: true, 
        id: docRef.id,
        message: 'Candidate profile created successfully'
      });
    }

    if (req.method === 'GET') {
      const snapshot = await firestore.collection('candidates')
        .where('isActive', '==', true)
        .get();
      
      const candidates = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        candidates.push({ 
          id: doc.id, 
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null
        });
      });
      
      candidates.sort((a, b) => (b.votes || 0) - (a.votes || 0));
      
      return res.status(200).json({ 
        success: true, 
        candidates,
        total: candidates.length
      });
    }

    // Delete candidate
    if (req.method === 'DELETE') {
      const { id } = req.query;
      const { userId } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Candidate ID required' });
      }
      
      // Get candidate to verify ownership
      const candidateDoc = await firestore.collection('candidates').doc(id).get();
      
      if (!candidateDoc.exists) {
        return res.status(404).json({ error: 'Candidate not found' });
      }
      
      const candidateData = candidateDoc.data();
      
      // Verify ownership
      if (candidateData.userId !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this profile' });
      }
      
      // Mark as inactive instead of deleting
      await firestore.collection('candidates').doc(id).update({
        isActive: false,
        deletedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return res.status(200).json({ 
        success: true, 
        message: 'Candidate profile deleted successfully'
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

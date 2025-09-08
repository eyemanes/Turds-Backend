import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    // Use environment variables
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.error('Missing Firebase credentials in environment variables');
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
      console.log('Firebase Admin initialized successfully');
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Check if Firebase is initialized
    if (!admin.apps.length) {
      throw new Error('Firebase Admin not initialized - check environment variables');
    }

    if (req.method === 'POST') {
      const candidateData = req.body;
      
      const docData = {
        ...candidateData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        supportersCount: 0,
        endorsements: [],
        verifiedHolder: false,
        tokenBalance: 0
      };
      
      // Save to Firestore
      const docRef = await db.collection('candidates').add(docData);
      console.log('Candidate saved to Firestore:', docRef.id);
      
      return res.status(201).json({ 
        success: true, 
        id: docRef.id,
        message: 'Candidate profile created successfully'
      });
    }

    if (req.method === 'GET') {
      // Fetch candidates from Firestore
      const snapshot = await db.collection('candidates')
        .where('isActive', '==', true)
        .get();
      
      const candidates = [];
      snapshot.forEach(doc => {
        candidates.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Sort by supportersCount
      candidates.sort((a, b) => (b.supportersCount || 0) - (a.supportersCount || 0));
      
      return res.status(200).json({ 
        success: true, 
        candidates: candidates,
        total: candidates.length
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Candidates API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
}

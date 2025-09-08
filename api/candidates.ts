import { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../lib/firebase-admin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Create new candidate
      const candidateData = req.body;
      
      // Add server-side data
      const docData = {
        ...candidateData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        supportersCount: 0,
        endorsements: [],
        verifiedHolder: false, // TODO: Verify with blockchain
        tokenBalance: 0 // TODO: Fetch from blockchain
      };

      // Save to Firestore using admin SDK (bypasses security rules)
      const docRef = await db.collection('candidates').add(docData);
      
      return res.status(201).json({ 
        success: true, 
        id: docRef.id,
        message: 'Candidate profile created successfully'
      });
    }

    if (req.method === 'GET') {
      // Fetch all candidates
      const candidatesSnapshot = await db
        .collection('candidates')
        .where('isActive', '==', true)
        .orderBy('supportersCount', 'desc')
        .get();

      const candidates = candidatesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.status(200).json({ 
        success: true, 
        candidates 
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Candidates API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

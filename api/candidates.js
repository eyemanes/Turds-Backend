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
    if (req.method === 'POST') {
      const candidateData = req.body;
      
      const docData = {
        ...candidateData,
        id: `candidate_${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        supportersCount: 0,
        endorsements: [],
        verifiedHolder: false,
        tokenBalance: 0
      };
      
      return res.status(201).json({ 
        success: true, 
        id: docData.id,
        message: 'Candidate profile created successfully',
        data: docData
      });
    }

    if (req.method === 'GET') {
      return res.status(200).json({ 
        success: true, 
        candidates: [],
        message: 'Candidates endpoint working'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
}

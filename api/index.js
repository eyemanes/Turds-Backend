export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = {
      message: 'TURDS Nation API is live! 🏛️',
      timestamp: new Date().toISOString(),
      status: 'operational',
      version: '1.0.0',
      endpoints: [
        '/api/health',
        '/api/admin/login',
        '/api/admin/announcements'
      ]
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}

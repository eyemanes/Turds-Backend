// Test API endpoint to verify deployment
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const response = {
      message: 'TURDS Nation API is live! 🏛️',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        admin: '/api/admin/*',
        auth: '/api/auth/*',
        voting: '/api/voting/*',
        government: '/api/government/*',
        elections: '/api/elections/*'
      },
      status: 'operational'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}

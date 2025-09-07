// Health check endpoint - Vercel Serverless Function
export default async function handler(req, res) {
  // Set CORS headers
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
      environment: process.env.NODE_ENV || 'production',
      version: '1.0.0',
      status: 'operational',
      runtime: 'nodejs18.x',
      platform: 'vercel-serverless',
      endpoints: {
        health: '/api/health',
        admin: {
          login: '/api/admin/login',
          announcements: '/api/admin/announcements'
        }
      },
      config: {
        cors_enabled: true,
        rate_limiting: 'enabled',
        environment_variables: {
          node_env: process.env.NODE_ENV ? 'set' : 'not_set',
          solana_rpc: process.env.SOLANA_RPC_URL ? 'configured' : 'using_default'
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      timestamp: new Date().toISOString(),
      status: 'error'
    });
  }
}

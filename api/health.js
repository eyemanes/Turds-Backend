// Health check endpoint with Solana connection test
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
    // Get Solana RPC URL from environment variables
    const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    let solanaStatus = 'not_configured';
    
    // Test Solana connection if URL is provided
    if (solanaRpcUrl && solanaRpcUrl !== 'https://api.mainnet-beta.solana.com') {
      try {
        // Simple fetch test to Solana RPC
        const solanaResponse = await fetch(solanaRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getHealth'
          })
        });
        
        if (solanaResponse.ok) {
          solanaStatus = 'connected';
        } else {
          solanaStatus = 'error';
        }
      } catch (error) {
        solanaStatus = 'error';
      }
    } else {
      solanaStatus = 'using_default';
    }

    const response = {
      message: 'TURDS Nation API is live! 🏛️',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      status: 'operational',
      solana: {
        rpc_url: solanaRpcUrl ? 'configured' : 'not_configured',
        status: solanaStatus,
        network: 'mainnet-beta'
      },
      endpoints: {
        health: '/api/health',
        admin: '/api/admin/*',
        auth: '/api/auth/*',
        voting: '/api/voting/*',
        government: '/api/government/*',
        elections: '/api/elections/*'
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

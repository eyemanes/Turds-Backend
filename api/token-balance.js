// Simple token balance endpoint for Solana tokens
export default async function handler(req, res) {
  // Set CORS headers for ALL requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress, mintAddress, uid } = req.body;

    console.log('Token balance request:', { walletAddress, mintAddress });

    if (!walletAddress || !mintAddress) {
      return res.status(200).json({
        error: 'Missing required parameters',
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: false
      });
    }

    // Check if the wallet address is a Solana address (base58 format)
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress);
    
    if (!isSolanaAddress) {
      console.log('Not a Solana address:', walletAddress);
      return res.status(200).json({
        error: 'Not a valid Solana address',
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: false
      });
    }

    // For now, return mock data for testing
    // You can adjust this value to test different scenarios
    const mockBalance = 10000000; // 10M tokens
    console.log('Returning mock balance for testing:', mockBalance);
    
    return res.status(200).json({
      success: true,
      balance: (mockBalance * 1000000000).toString(), // Convert to smallest unit (9 decimals)
      decimals: 9,
      uiAmount: mockBalance,
      mock: true,
      message: `Mock data: ${mockBalance.toLocaleString()} $TURDS`,
      walletAddress: walletAddress,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Token balance API error:', error);
    
    return res.status(200).json({
      error: 'Failed to fetch token balance',
      message: error.message || 'Unknown error',
      balance: '0',
      decimals: 9,
      uiAmount: 0,
      success: false
    });
  }
}

/**
 * Secure Helius API Proxy
 * All Helius API calls go through this backend endpoint
 * API keys are kept secure on the server
 */

import { setSecureCorsHeaders } from '../lib/cors.js';

export default async function handler(req, res) {
  // Set secure CORS headers
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress, mintAddress, action } = req.body;

    // Validate required parameters
    if (!walletAddress || !mintAddress || !action) {
      return res.status(400).json({ 
        error: 'Missing required parameters: walletAddress, mintAddress, action' 
      });
    }

    // Validate Solana address format
    const addressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!addressRegex.test(walletAddress) || !addressRegex.test(mintAddress)) {
      return res.status(400).json({ error: 'Invalid Solana address format' });
    }

    // Get Helius API key from environment
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      console.error('HELIUS_API_KEY not configured in environment');
      return res.status(500).json({ error: 'Service configuration error' });
    }

    let response;
    
    switch (action) {
      case 'getBalance':
        response = await getTokenBalance(walletAddress, mintAddress, heliusApiKey);
        break;
      case 'verifyHolding':
        const { minimumAmount } = req.body;
        if (minimumAmount === undefined) {
          return res.status(400).json({ error: 'minimumAmount required for verifyHolding' });
        }
        response = await verifyTokenHolding(walletAddress, mintAddress, minimumAmount, heliusApiKey);
        break;
      default:
        return res.status(400).json({ error: 'Invalid action. Supported: getBalance, verifyHolding' });
    }

    res.json({
      success: true,
      ...response,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Helius proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to process request',
      success: false 
    });
  }
}

/**
 * Get token balance using Helius API
 */
async function getTokenBalance(walletAddress, mintAddress, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TURDS-Backend/1.0'
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      } else if (response.status >= 500) {
        throw new Error('Helius service temporarily unavailable');
      } else {
        throw new Error('Failed to fetch token balance');
      }
    }

    const data = await response.json();
    const tokenAccount = data.tokens?.find(token => token.mint === mintAddress);
    
    if (!tokenAccount) {
      return {
        balance: '0',
        decimals: 6,
        uiAmount: 0,
        mint: mintAddress,
        exists: false
      };
    }

    const balance = parseInt(tokenAccount.amount || '0');
    const decimals = tokenAccount.decimals || 6;
    const uiAmount = balance / Math.pow(10, decimals);

    return {
      balance: tokenAccount.amount,
      decimals,
      uiAmount,
      mint: mintAddress,
      exists: true
    };

  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Verify token holding meets minimum requirement
 */
async function verifyTokenHolding(walletAddress, mintAddress, minimumAmount, apiKey) {
  const balanceData = await getTokenBalance(walletAddress, mintAddress, apiKey);
  const balance = parseInt(balanceData.balance || '0');
  const verified = balance >= minimumAmount;

  return {
    verified,
    actualBalance: balance,
    minimumRequired: minimumAmount,
    meetsRequirement: verified,
    uiAmount: balanceData.uiAmount
  };
}

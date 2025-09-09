// Token balance endpoint for Solana tokens using Helius RPC
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
    
    // Use the TURDS mint address from env or passed value
    const tokenMint = mintAddress || process.env.TURDS_MINT_ADDRESS || '5tiJnwdL5WrCFa7K4eKHRjRtqgX9z2hmbn3LACNApump';

    console.log('Token balance request:', { 
      walletAddress, 
      mintAddress: tokenMint,
      rpcUrl: process.env.SOLANA_RPC_URL ? 'Helius RPC' : 'Public RPC'
    });

    if (!walletAddress) {
      return res.status(200).json({
        error: 'Missing wallet address',
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: false
      });
    }

    // Check if the wallet address is a Solana address (base58 format)
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress);
    
    if (!isSolanaAddress) {
      console.log('Invalid Solana address format:', walletAddress);
      return res.status(200).json({
        error: 'Not a valid Solana address',
        balance: '0',
        decimals: 9,
        uiAmount: 0,
        success: false
      });
    }

    // Import Solana web3.js
    const { Connection, PublicKey } = await import('@solana/web3.js');
    
    // Use Helius RPC if available, otherwise fallback to public RPC
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    console.log('Connecting to RPC:', rpcUrl.includes('helius') ? 'Helius' : 'Public Solana');
    
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    
    try {
      const walletPubkey = new PublicKey(walletAddress);
      const mintPubkey = new PublicKey(tokenMint);
      
      console.log('Fetching token accounts for wallet:', walletAddress);
      console.log('Token mint:', tokenMint);
      
      // Get token accounts for this wallet and mint
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: mintPubkey },
        'confirmed'
      );
      
      if (tokenAccounts.value.length === 0) {
        console.log('No token accounts found for this wallet and mint');
        return res.status(200).json({
          success: true,
          balance: '0',
          decimals: 9,
          uiAmount: 0,
          mint: tokenMint,
          walletAddress: walletAddress,
          message: 'No TURDS tokens found in this wallet',
          timestamp: Date.now()
        });
      }
      
      // Calculate total balance across all token accounts
      let totalBalance = 0;
      let decimals = 9;
      
      for (const tokenAccount of tokenAccounts.value) {
        const accountData = tokenAccount.account.data;
        if ('parsed' in accountData) {
          const tokenAmount = accountData.parsed.info?.tokenAmount;
          
          if (tokenAmount) {
            const amount = parseInt(tokenAmount.amount);
            totalBalance += amount;
            decimals = tokenAmount.decimals;
            
            console.log('Token account found:', {
              account: tokenAccount.pubkey.toString(),
              amount: amount,
              decimals: decimals
            });
          }
        }
      }
      
      const uiAmount = totalBalance / Math.pow(10, decimals);
      
      console.log('Total token balance:', { 
        balance: totalBalance.toString(), 
        decimals, 
        uiAmount,
        formattedAmount: uiAmount.toLocaleString() + ' TURDS'
      });
      
      // Log to Firebase if uid provided
      if (uid) {
        try {
          console.log('Logging balance to Firebase for user:', uid);
          const { firebaseService } = await import('../lib/firebase.js');
          await firebaseService.logBalanceCheck(uid, walletAddress, totalBalance);
          await firebaseService.updateTokenBalance(uid, totalBalance);
        } catch (fbError) {
          console.error('Firebase logging failed (non-critical):', fbError.message);
          // Continue anyway - balance fetch was successful
        }
      }
      
      return res.status(200).json({
        success: true,
        balance: totalBalance.toString(),
        decimals: decimals,
        uiAmount: uiAmount,
        mint: tokenMint,
        walletAddress: walletAddress,
        message: `Found ${uiAmount.toLocaleString()} TURDS`,
        timestamp: Date.now()
      });
      
    } catch (rpcError) {
      console.error('RPC Error:', rpcError);
      
      // If Helius fails, try public RPC as fallback
      if (rpcUrl.includes('helius')) {
        console.log('Helius failed, trying public RPC as fallback...');
        
        const fallbackConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
        
        try {
          const walletPubkey = new PublicKey(walletAddress);
          const mintPubkey = new PublicKey(tokenMint);
          
          const tokenAccounts = await fallbackConnection.getParsedTokenAccountsByOwner(
            walletPubkey,
            { mint: mintPubkey },
            'confirmed'
          );
          
          if (tokenAccounts.value.length === 0) {
            return res.status(200).json({
              success: true,
              balance: '0',
              decimals: 9,
              uiAmount: 0,
              mint: tokenMint,
              walletAddress: walletAddress,
              message: 'No TURDS tokens found (fallback RPC)',
              timestamp: Date.now()
            });
          }
          
          let totalBalance = 0;
          let decimals = 9;
          
          for (const tokenAccount of tokenAccounts.value) {
            const accountData = tokenAccount.account.data;
            if ('parsed' in accountData) {
              const tokenAmount = accountData.parsed.info?.tokenAmount;
              if (tokenAmount) {
                totalBalance += parseInt(tokenAmount.amount);
                decimals = tokenAmount.decimals;
              }
            }
          }
          
          const uiAmount = totalBalance / Math.pow(10, decimals);
          
          return res.status(200).json({
            success: true,
            balance: totalBalance.toString(),
            decimals: decimals,
            uiAmount: uiAmount,
            mint: tokenMint,
            walletAddress: walletAddress,
            message: `Found ${uiAmount.toLocaleString()} TURDS (via fallback)`,
            timestamp: Date.now()
          });
          
        } catch (fallbackError) {
          console.error('Fallback RPC also failed:', fallbackError);
          throw fallbackError;
        }
      } else {
        throw rpcError;
      }
    }

  } catch (error) {
    console.error('Token balance API error:', error);
    
    // Return a user-friendly error
    return res.status(200).json({
      error: 'Failed to fetch token balance',
      message: error.message || 'Unknown error',
      balance: '0',
      decimals: 9,
      uiAmount: 0,
      success: false,
      walletAddress: req.body.walletAddress,
      timestamp: Date.now()
    });
  }
}

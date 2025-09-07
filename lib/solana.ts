import { Connection, PublicKey } from '@solana/web3.js'

export interface TokenBalance {
  balance: string
  decimals: number
  uiAmount: number
  mint: string
}

export class SolanaService {
  private connection: Connection

  constructor(rpcUrl?: string) {
    this.connection = new Connection(
      rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    )
  }

  /**
   * Get SPL token balance for a wallet
   */
  async getTokenBalance(walletAddress: string, mintAddress: string): Promise<TokenBalance | null> {
    try {
      const walletPubkey = new PublicKey(walletAddress)
      const mintPubkey = new PublicKey(mintAddress)

      // Get token accounts owned by the wallet for this specific mint
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        walletPubkey,
        { mint: mintPubkey },
        'confirmed'
      )

      if (tokenAccounts.value.length === 0) {
        return {
          balance: '0',
          decimals: 0,
          uiAmount: 0,
          mint: mintAddress
        }
      }

      // Get the largest token account (usually there's only one)
      let totalBalance = 0
      let decimals = 0

      for (const tokenAccount of tokenAccounts.value) {
        const accountInfo = await this.connection.getParsedAccountInfo(tokenAccount.pubkey)
        
        if (accountInfo.value?.data && 'parsed' in accountInfo.value.data) {
          const parsedData = accountInfo.value.data.parsed
          const tokenAmount = parsedData.info?.tokenAmount
          
          if (tokenAmount) {
            totalBalance += parseInt(tokenAmount.amount)
            decimals = tokenAmount.decimals
          }
        }
      }

      return {
        balance: totalBalance.toString(),
        decimals,
        uiAmount: totalBalance / Math.pow(10, decimals),
        mint: mintAddress
      }

    } catch (error) {
      console.error('Error fetching token balance:', error)
      throw new Error(`Failed to fetch token balance: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get SOL balance for a wallet
   */
  async getSolBalance(walletAddress: string): Promise<number> {
    try {
      const walletPubkey = new PublicKey(walletAddress)
      const balance = await this.connection.getBalance(walletPubkey)
      
      // Convert lamports to SOL
      return balance / 1_000_000_000
    } catch (error) {
      console.error('Error fetching SOL balance:', error)
      return 0
    }
  }

  /**
   * Get multiple token balances for a wallet
   */
  async getMultipleTokenBalances(
    walletAddress: string, 
    mintAddresses: string[]
  ): Promise<Record<string, TokenBalance | null>> {
    const results: Record<string, TokenBalance | null> = {}
    
    await Promise.all(
      mintAddresses.map(async (mintAddress) => {
        try {
          results[mintAddress] = await this.getTokenBalance(walletAddress, mintAddress)
        } catch (error) {
          console.error(`Error fetching balance for mint ${mintAddress}:`, error)
          results[mintAddress] = null
        }
      })
    )

    return results
  }

  /**
   * Verify wallet owns minimum token amount
   */
  async verifyTokenHolding(
    walletAddress: string,
    mintAddress: string,
    minimumAmount: number
  ): Promise<boolean> {
    try {
      const tokenBalance = await this.getTokenBalance(walletAddress, mintAddress)
      
      if (!tokenBalance) return false
      
      const balance = parseInt(tokenBalance.balance)
      return balance >= minimumAmount
    } catch (error) {
      console.error('Error verifying token holding:', error)
      return false
    }
  }

  /**
   * Test connection to Solana RPC
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connection.getLatestBlockhash()
      return true
    } catch (error) {
      console.error('Solana connection test failed:', error)
      return false
    }
  }
}

export const solanaService = new SolanaService()

# TUR Nation Backend API

A Vercel-deployed backend API for TUR Nation that handles Solana token balance verification and Firebase integration.

## 🚀 Quick Deploy to Vercel

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy
```bash
cd tur-nation-backend
npm install
vercel --prod
```

### 3. Set Environment Variables in Vercel
```bash
vercel env add SOLANA_RPC_URL
vercel env add FIREBASE_PROJECT_ID  
vercel env add FIREBASE_PRIVATE_KEY
vercel env add FIREBASE_CLIENT_EMAIL
```

## 🔧 API Endpoints

### Health Check
```
GET /api/health
```
Returns API status and Solana connection health.

### Token Balance
```
POST /api/token-balance
```
**Body:**
```json
{
  "walletAddress": "wallet_address_here",
  "mintAddress": "token_mint_address",
  "uid": "user_id_optional"
}
```

**Response:**
```json
{
  "success": true,
  "balance": "1000000",
  "decimals": 6,
  "uiAmount": 1.0,
  "mint": "token_mint_address",
  "timestamp": 1234567890
}
```

### Verify Token Holding
```
POST /api/verify-holding
```
**Body:**
```json
{
  "walletAddress": "wallet_address_here",
  "mintAddress": "token_mint_address",
  "minimumAmount": 1000000,
  "uid": "user_id_optional"
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "actualBalance": 5000000,
  "minimumRequired": 1000000,
  "meetsRequirement": true,
  "timestamp": 1234567890
}
```

## 🔒 Environment Variables

### Required for Production
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `FIREBASE_PROJECT_ID` - Firebase project ID  
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email

## 🏗️ Architecture

- **Runtime**: Node.js 18.x on Vercel
- **Database**: Firebase Realtime Database
- **Blockchain**: Solana via @solana/web3.js
- **CORS**: Enabled for all origins
- **Logging**: Balance checks audited to Firebase

## 🔄 Integration with Frontend

Update your frontend token service to use the backend:

```typescript
// In src/services/tokenBalance/backend.ts
export class BackendTokenBalanceService implements TokenBalanceService {
  private apiUrl: string

  constructor(apiUrl = 'https://your-backend.vercel.app') {
    this.apiUrl = apiUrl
  }

  async getSplTokenBalance(walletAddress: string, mintAddress: string): Promise<number> {
    const response = await fetch(`${this.apiUrl}/api/token-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, mintAddress })
    })

    const data = await response.json()
    return parseInt(data.balance)
  }
}
```

## 📦 Features

- ✅ **Solana token balance checking**
- ✅ **Token holding verification**
- ✅ **Firebase audit logging**
- ✅ **CORS enabled**
- ✅ **Error handling**
- ✅ **TypeScript support**
- ✅ **Vercel optimized**
- ✅ **Production ready**

## 🛡️ Security

- Environment variables for sensitive data
- CORS headers configured
- Error messages sanitized
- Firebase Admin SDK for secure database access
- Input validation on all endpoints

## 📊 Monitoring

The backend logs all token balance checks to Firebase for:
- Audit trails
- Usage analytics  
- Debugging support
- User balance caching

## 🔄 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Deploy to production
npm run deploy
```

## 📝 Notes

- All API responses include timestamps
- Balance checks are cached in user profiles
- Errors are logged but don't expose sensitive data
- Compatible with both mainnet and devnet Solana

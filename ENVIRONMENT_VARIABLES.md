# Environment Variables Configuration

## Required Environment Variables for Vercel

### Backend Environment Variables

Set these in your Vercel project settings under "Environment Variables":

#### Helius API
```
HELIUS_API_KEY=your_helius_api_key_here
```

#### Twitter API (RapidAPI)
```
RAPIDAPI_KEY=your_rapidapi_key_here
```

#### Token Configuration
```
TURDS_MINT_ADDRESS=your_token_mint_address_here
```

#### Firebase Configuration (REQUIRED)
```
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
```

**⚠️ CRITICAL**: `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PROJECT_ID` are REQUIRED for backend Firebase Admin SDK functionality.

#### Admin Configuration (REQUIRED)
```
ADMIN_PASSWORD=your_secure_admin_password
ADMIN_USERNAME=your_admin_username
JWT_SECRET=your_jwt_secret_key
```

**⚠️ CRITICAL**: These admin configuration variables are REQUIRED and have NO fallbacks. The application will fail to start if they are not properly configured.

#### Frontend URL (for CORS)
```
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

### Frontend Environment Variables

Set these in your frontend Vercel project:

#### API Configuration
```
VITE_API_BASE_URL=https://your-backend.vercel.app
VITE_API_URL=https://your-backend.vercel.app
```

#### Blockchain Configuration
```
VITE_SOLANA_NETWORK=mainnet-beta
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VITE_TOKEN_MINT_ADDRESS=your_token_mint_address
```

#### App Configuration
```
VITE_APP_NAME=TURDS Nation
VITE_BRAND_NAME=The United Retards
VITE_TOKEN_SYMBOL=TURDS
VITE_TOKEN_NAME=Turd
```

#### Feature Flags
```
VITE_ENABLE_ELECTIONS=true
VITE_ENABLE_VOTING=true
VITE_ENABLE_ADMIN=true
```

#### Authentication
```
VITE_PRIVY_APP_ID=your_privy_app_id
```

#### Analytics (Optional)
```
VITE_GOOGLE_ANALYTICS_ID=your_ga_id
```

#### Logging Configuration (Optional)
```
LOG_LEVEL=WARN
NODE_ENV=production
```

**Log Levels**: `ERROR`, `WARN`, `INFO`, `DEBUG`
- **Production**: Use `WARN` or `ERROR` to reduce log volume
- **Development**: Use `DEBUG` for detailed logging

## Security Notes

1. **Never expose API keys in frontend code** - All API keys should be in backend environment variables only
2. **Use VITE_ prefix only for public configuration** - Never use VITE_ for sensitive data
3. **Backend API keys are secure** - They're only accessible server-side
4. **CORS is configured** - Only specific domains are allowed
5. **NO HARDCODED FALLBACKS** - All sensitive values MUST be properly configured in environment variables
6. **Environment validation** - Missing required environment variables will cause the application to fail with clear error messages
7. **Required vs Optional** - Some environment variables are required for security, others are optional with safe defaults

## Setting Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click on "Settings" tab
3. Click on "Environment Variables" in the sidebar
4. Add each variable with the appropriate value
5. Make sure to set them for the correct environments (Production, Preview, Development)

## Local Development

For local development, create a `.env` file in the backend directory:

```bash
# Backend .env
HELIUS_API_KEY=your_key_here
RAPIDAPI_KEY=your_key_here
TURDS_MINT_ADDRESS=your_token_mint_address
FIREBASE_API_KEY=your_key_here
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
ADMIN_PASSWORD=your_admin_password
ADMIN_USERNAME=your_admin_username
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:3000
# ... other backend variables
```

And a `.env` file in the frontend directory:

```bash
# Frontend .env
VITE_API_BASE_URL=http://localhost:3001
VITE_SOLANA_NETWORK=devnet
# ... other frontend variables
```

**Important**: Never commit `.env` files to version control!

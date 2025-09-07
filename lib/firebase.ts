import admin from 'firebase-admin'

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    })
  } catch (error) {
    console.error('Firebase initialization error:', error)
  }
}

export const db = admin.database()
export const auth = admin.auth()

export interface UserProfile {
  uid: string
  xHandle?: string
  xId?: string
  walletAddress?: string
  isAdmin?: boolean
  tokenBalance?: number
  lastBalanceCheck?: number
  createdAt: number
  updatedAt: number
}

export class FirebaseService {
  /**
   * Get user profile from database
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const snapshot = await db.ref(`users/${uid}`).once('value')
      return snapshot.val()
    } catch (error) {
      console.error('Error fetching user profile:', error)
      return null
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
    try {
      await db.ref(`users/${uid}`).update({
        ...updates,
        updatedAt: Date.now()
      })
    } catch (error) {
      console.error('Error updating user profile:', error)
      throw error
    }
  }

  /**
   * Check if user is admin
   */
  async isAdmin(uid: string): Promise<boolean> {
    try {
      const snapshot = await db.ref(`rolesAllowlist/admins/${uid}`).once('value')
      return snapshot.val() === true
    } catch (error) {
      console.error('Error checking admin status:', error)
      return false
    }
  }

  /**
   * Update user token balance
   */
  async updateTokenBalance(uid: string, balance: number): Promise<void> {
    try {
      await db.ref(`users/${uid}`).update({
        tokenBalance: balance,
        lastBalanceCheck: Date.now(),
        updatedAt: Date.now()
      })
    } catch (error) {
      console.error('Error updating token balance:', error)
      throw error
    }
  }

  /**
   * Log token balance check for audit
   */
  async logBalanceCheck(uid: string, walletAddress: string, balance: number): Promise<void> {
    try {
      const logRef = db.ref('balanceChecks').push()
      await logRef.set({
        uid,
        walletAddress,
        balance,
        timestamp: Date.now(),
        checkId: logRef.key
      })
    } catch (error) {
      console.error('Error logging balance check:', error)
      // Don't throw - this is just for audit
    }
  }

  /**
   * Get app configuration
   */
  async getConfig(key: string): Promise<any> {
    try {
      const snapshot = await db.ref(`config/${key}`).once('value')
      return snapshot.val()
    } catch (error) {
      console.error(`Error fetching config ${key}:`, error)
      return null
    }
  }
}

export const firebaseService = new FirebaseService()

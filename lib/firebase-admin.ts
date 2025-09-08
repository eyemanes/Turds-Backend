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
    console.error('Firebase Admin initialization error:', error)
  }
}

// Export both Realtime Database and Firestore
export const realtimeDb = admin.database()
export const db = admin.firestore() // Firestore instance
export const auth = admin.auth()

export default admin

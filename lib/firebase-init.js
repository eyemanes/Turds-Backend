/**
 * Centralized Firebase initialization module
 * Single source of truth for Firebase Admin SDK initialization
 */

import admin from 'firebase-admin';
import logger from './logger.js';

let db = null;
let auth = null;
let initialized = false;

/**
 * Initialize Firebase Admin SDK
 * @returns {Object} Object containing firestore and auth instances
 */
export function initializeFirebase() {
  if (initialized) {
    return { db, auth };
  }

  try {
    // Validate required environment variables
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      const missing = [];
      if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
      if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
      if (!projectId) missing.push('FIREBASE_PROJECT_ID');
      
      throw new Error(`Missing Firebase credentials: ${missing.join(', ')}`);
    }

    // Initialize only if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey,
        })
      });
      
      logger.info('Firebase Admin SDK initialized successfully');
    }

    // Get Firestore and Auth instances
    db = admin.firestore();
    auth = admin.auth();
    initialized = true;

    // Configure Firestore settings
    db.settings({
      ignoreUndefinedProperties: true,
      timestampsInSnapshots: true
    });

    return { db, auth };
  } catch (error) {
    logger.logError(error, 'Firebase initialization failed');
    throw error;
  }
}

/**
 * Get Firestore instance
 * @returns {admin.firestore.Firestore} Firestore instance
 */
export function getFirestore() {
  if (!db) {
    const { db: firestore } = initializeFirebase();
    db = firestore;
  }
  return db;
}

/**
 * Get Auth instance
 * @returns {admin.auth.Auth} Auth instance
 */
export function getAuth() {
  if (!auth) {
    const { auth: authInstance } = initializeFirebase();
    auth = authInstance;
  }
  return auth;
}

/**
 * Verify ID token and get user claims
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<admin.auth.DecodedIdToken>} Decoded token with claims
 */
export async function verifyIdToken(idToken) {
  try {
    const authInstance = getAuth();
    const decodedToken = await authInstance.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.logError(error, 'Token verification failed');
    throw new Error('Invalid authentication token');
  }
}

/**
 * Check if user has admin privileges
 * @param {string} uid - User ID
 * @returns {Promise<boolean>} True if user is admin
 */
export async function isUserAdmin(uid) {
  try {
    const firestore = getFirestore();
    const userDoc = await firestore.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData.isAdmin === true || userData.role === 'admin';
  } catch (error) {
    logger.logError(error, 'Admin check failed');
    return false;
  }
}

/**
 * Set custom claims for a user
 * @param {string} uid - User ID
 * @param {Object} claims - Custom claims to set
 */
export async function setCustomClaims(uid, claims) {
  try {
    const authInstance = getAuth();
    await authInstance.setCustomUserClaims(uid, claims);
    logger.info(`Custom claims set for user ${uid}`);
  } catch (error) {
    logger.logError(error, 'Failed to set custom claims');
    throw error;
  }
}

// Export Firebase Admin for backward compatibility
export { admin };

export default {
  initializeFirebase,
  getFirestore,
  getAuth,
  verifyIdToken,
  isUserAdmin,
  setCustomClaims,
  admin
};

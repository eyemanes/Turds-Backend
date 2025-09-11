import admin from 'firebase-admin';
import { setSecureCorsHeaders } from '../lib/cors.js';

// Initialize Firebase Admin
let db = null;

function initializeFirebase() {
  if (db) return db;
  
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.error('Missing Firebase credentials');
      return null;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        })
      });
    }
    
    db = admin.firestore();
    return db;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, username, secretKey } = req.body;

    // Simple secret key check (you can change this)
    if (secretKey !== 'TURDS_SUPER_ADMIN_2025') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!userId || !username) {
      return res.status(400).json({ error: 'userId and username required' });
    }

    const firestore = initializeFirebase();
    if (!firestore) {
      return res.status(500).json({ error: 'Database connection failed' });
    }

    // Add to admins collection
    const adminDoc = {
      userId: userId,
      username: username,
      role: "super_admin",
      permissions: [
        "admin_dashboard",
        "user_management",
        "election_management",
        "government_panel",
        "broadcast_messages",
        "audit_logs",
        "system_settings"
      ],
      createdAt: new Date().toISOString(),
      createdBy: "api",
      isActive: true
    };

    await firestore.collection('admins').doc(userId).set(adminDoc);

    // Update user document
    const userUpdate = {
      role: "super_admin",
      isAdmin: true,
      isSuperAdmin: true,
      adminPermissions: [
        "admin_dashboard",
        "user_management",
        "election_management",
        "government_panel",
        "broadcast_messages",
        "audit_logs",
        "system_settings"
      ],
      adminSince: new Date().toISOString()
    };

    await firestore.collection('users').doc(userId).update(userUpdate);

    res.status(200).json({
      success: true,
      message: 'User promoted to super admin',
      userId: userId,
      username: username
    });

  } catch (error) {
    console.error('Make super admin error:', error);
    res.status(500).json({ error: 'Failed to promote user' });
  }
}

import { admin, getFirestore } from '../lib/firebase-init.js';
import { setSecureCorsHeaders, rateLimit, sanitizeInput } from '../lib/cors.js';
import logger from '../lib/logger.js';
import { requireAdmin, validateRequest } from '../lib/middleware.js';
import crypto from 'crypto';

/**
 * SECURITY NOTE: Admin status can ONLY be set through Firebase Custom Claims.
 * 
 * To grant admin access:
 * 1. Use the make-super-admin.js script
 * 2. Or set custom claims via Firebase Admin SDK
 * 
 * Never expose an API endpoint for setting admin status as it could be exploited.
 */

export default async function handler(req, res) {
  // Apply security middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }
  
  // Apply rate limiting
  rateLimit(req, res);
  
  // Sanitize inputs
  sanitizeInput(req, res);
  
  // Log request
  logger.logRequest(req, 'Admin API');

  const firestore = getFirestore();
  
  if (!firestore) {
    logger.error('Database not configured');
    return res.status(500).json({
      success: false,
      message: 'Database initialization failed'
    });
  }

  try {
    const { action } = req.query;

    // ADMIN LOGIN (support both old and new endpoints)
    if ((action === 'login' || action === 'authenticate') && req.method === 'POST') {
      const { username, password } = req.body;

      // Check environment variables for admin credentials
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminUsername || !adminPassword) {
        console.error('Admin credentials not configured');
        return res.status(503).json({ 
          success: false, 
          message: 'Admin authentication not configured' 
        });
      }

      if (username === adminUsername && password === adminPassword) {
        return res.status(200).json({ 
          success: true, 
          message: 'Admin authenticated',
          isAdmin: true 
        });
      }

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // ANNOUNCEMENTS
    if (action === 'announcements') {
      // Create announcement
      if (req.method === 'POST') {
        const { title, content, type, priority } = req.body;
        
        if (!title || !content) {
          return res.status(400).json({ error: 'Title and content required' });
        }

        const announcement = {
          title,
          content,
          type: type || 'general',
          priority: priority || 'normal',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isActive: true
        };

        const docRef = await firestore.collection('announcements').add(announcement);
        
        return res.status(201).json({ 
          success: true, 
          id: docRef.id,
          message: 'Announcement created successfully'
        });
      }

      // Get announcements
      if (req.method === 'GET') {
        const snapshot = await firestore.collection('announcements')
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();
        
        const announcements = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          announcements.push({ 
            id: doc.id, 
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null
          });
        });
        
        return res.status(200).json({ 
          success: true, 
          announcements 
        });
      }

      // Delete announcement
      if (req.method === 'DELETE') {
        const { id } = req.query;
        
        if (!id) {
          return res.status(400).json({ error: 'Announcement ID required' });
        }

        await firestore.collection('announcements').doc(id).update({
          isActive: false,
          deletedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({ 
          success: true, 
          message: 'Announcement deleted successfully'
        });
      }
    }

    // REMOVED set-admin endpoint for security - admin status should only be set directly in database

    // GET ALL USERS (for admin panel)
    if (action === 'users' && req.method === 'GET') {
      const usersSnapshot = await firestore.collection('users').get();
      const users = [];
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        users.push({
          id: doc.id,
          username: data.username || 'Anonymous',
          email: data.email,
          isAdmin: data.isAdmin || false,
          twitterFollowers: data.twitterFollowers || 0,
          walletAddress: data.walletAddress,
          lastLogin: data.lastLogin?.toDate?.()?.toISOString() || null
        });
      });
      
      return res.status(200).json({ 
        success: true, 
        users 
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}

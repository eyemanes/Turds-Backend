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
  const firestore = initializeFirebase();
  if (!firestore) {
    return res.status(500).json({ error: 'Database connection failed' });
  }
  // Use secure CORS middleware
  if (setSecureCorsHeaders(req, res)) {
    return; // Preflight request handled
  }

  const { action } = req.query;

  try {
    // GET BROADCAST MESSAGES
    if (action === 'get-messages') {
      const messagesSnapshot = await firestore.collection('broadcast_messages')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      const messages = [];
      messagesSnapshot.forEach(doc => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          message: data.message,
          type: data.type || 'info',
          isActive: data.isActive !== false,
          createdAt: data.createdAt?.toDate() || null,
          createdBy: data.createdBy || null
        });
      });

      return res.status(200).json({
        success: true,
        messages
      });
    }

    // GET ACTIVE BROADCAST MESSAGE
    if (action === 'get-active') {
      try {
        const activeMessageSnapshot = await firestore.collection('broadcast_messages')
          .where('isActive', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (activeMessageSnapshot.empty) {
          return res.status(200).json({
            success: false,
            message: null
          });
        }

        const doc = activeMessageSnapshot.docs[0];
        const data = doc.data();
        
        return res.status(200).json({
          success: true,
          message: {
            id: doc.id,
            message: data.message,
            type: data.type || 'info',
            createdAt: data.createdAt?.toDate() || null
          }
        });
      } catch (error) {
        console.log('No active broadcast found');
        return res.status(200).json({
          success: false,
          message: null
        });
      }
    }

    // CREATE BROADCAST MESSAGE
    if (action === 'create') {
      const { message, type = 'info', createdBy } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Deactivate all existing messages
      const existingMessagesSnapshot = await firestore.collection('broadcast_messages')
        .where('isActive', '==', true)
        .get();

      const batch = firestore.batch();
      existingMessagesSnapshot.forEach(doc => {
        batch.update(doc.ref, { isActive: false });
      });

      // Create new message
      const newMessageRef = firestore.collection('broadcast_messages').doc();
      batch.set(newMessageRef, {
        message,
        type,
        isActive: true,
        createdBy: createdBy || 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      return res.status(200).json({
        success: true,
        message: 'Broadcast message created successfully',
        messageId: newMessageRef.id
      });
    }

    // UPDATE BROADCAST MESSAGE
    if (action === 'update') {
      const { messageId, message, type, isActive } = req.body;

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (message) updateData.message = message;
      if (type) updateData.type = type;
      if (isActive !== undefined) updateData.isActive = isActive;

      await firestore.collection('broadcast_messages').doc(messageId).update(updateData);

      return res.status(200).json({
        success: true,
        message: 'Broadcast message updated successfully'
      });
    }

    // DELETE BROADCAST MESSAGE
    if (action === 'delete') {
      const { messageId } = req.body;

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      await firestore.collection('broadcast_messages').doc(messageId).delete();

      return res.status(200).json({
        success: true,
        message: 'Broadcast message deleted successfully'
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Broadcast API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

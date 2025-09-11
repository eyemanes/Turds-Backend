import admin from 'firebase-admin';

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
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    // GET CHAT MESSAGES
    if (action === 'get-messages') {
      const { limit = 50, offset = 0, room = 'admin' } = req.query;
      
      const messagesSnapshot = await firestore.collection('admin_chat')
        .where('room', '==', room)
        .orderBy('createdAt', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset))
        .get();
      
      const messages = [];
      messagesSnapshot.forEach(doc => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          message: data.message,
          senderId: data.senderId,
          senderName: data.senderName,
          senderRole: data.senderRole,
          createdAt: data.createdAt?.toDate() || null,
          isSystem: data.isSystem || false,
          room: data.room || 'admin'
        });
      });

      return res.status(200).json({
        success: true,
        messages: messages.reverse() // Reverse to show oldest first
      });
    }

    // SEND CHAT MESSAGE
    if (action === 'send-message') {
      const { message, senderId, senderName, senderRole, room = 'admin' } = req.body;

      if (!message || !senderId || !senderName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const messageData = {
        message,
        senderId,
        senderName,
        senderRole: senderRole || 'admin',
        room: room,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isSystem: false
      };

      const docRef = await firestore.collection('admin_chat').add(messageData);

      return res.status(200).json({
        success: true,
        message: 'Message sent successfully',
        messageId: docRef.id
      });
    }

    // SEND SYSTEM MESSAGE
    if (action === 'send-system-message') {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const messageData = {
        message,
        senderId: 'system',
        senderName: 'System',
        senderRole: 'system',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isSystem: true
      };

      const docRef = await firestore.collection('admin_chat').add(messageData);

      return res.status(200).json({
        success: true,
        message: 'System message sent successfully',
        messageId: docRef.id
      });
    }

    // DELETE MESSAGE
    if (action === 'delete-message') {
      const { messageId } = req.body;

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      await firestore.collection('admin_chat').doc(messageId).delete();

      return res.status(200).json({
        success: true,
        message: 'Message deleted successfully'
      });
    }

    // GET ONLINE ADMINS
    if (action === 'get-online-admins') {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const onlineAdminsSnapshot = await firestore.collection('users')
        .where('isAdmin', '==', true)
        .where('lastActive', '>', fiveMinutesAgo)
        .get();
      
      const onlineAdmins = [];
      onlineAdminsSnapshot.forEach(doc => {
        const data = doc.data();
        
        // Check if admin is in stealth mode (has stealthMode field set to true)
        // If stealthMode is true, exclude from online list
        if (data.stealthMode === true) {
          return; // Skip this admin - they're in stealth mode
        }
        
        onlineAdmins.push({
          id: doc.id,
          username: data.username || 'Unknown',
          profilePicture: data.profilePicture || null,
          lastActive: data.lastActive?.toDate() || null
        });
      });

      return res.status(200).json({
        success: true,
        onlineAdmins
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Admin chat API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

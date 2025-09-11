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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, room = 'admin' } = req.query;

  try {
    // GET CHAT MESSAGES
    if (action === 'get-messages') {
      const messagesSnapshot = await firestore
        .collection('chat_messages')
        .where('room', '==', room)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
      
      const messages = [];
      messagesSnapshot.forEach(doc => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          message: data.message,
          senderId: data.senderId,
          senderName: data.senderName,
          room: data.room,
          timestamp: data.timestamp?.toDate() || new Date(),
        });
      });

      // Reverse to show oldest first
      messages.reverse();

      return res.status(200).json({
        success: true,
        messages
      });
    }

    // SEND MESSAGE
    if (action === 'send-message') {
      const { message, senderId, senderName } = req.body;

      if (!message || !senderId || !senderName) {
        return res.status(400).json({ 
          error: 'Missing required fields: message, senderId, senderName' 
        });
      }

      const newMessage = {
        message,
        senderId,
        senderName,
        room,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await firestore.collection('chat_messages').add(newMessage);

      // Also update online status
      await firestore.collection('online_admins').doc(senderId).set({
        id: senderId,
        name: senderName,
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        room
      }, { merge: true });

      return res.status(200).json({
        success: true,
        messageId: docRef.id
      });
    }

    // GET ONLINE ADMINS
    if (action === 'get-online-admins') {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const onlineSnapshot = await firestore
        .collection('online_admins')
        .where('lastSeen', '>', fiveMinutesAgo)
        .get();
      
      const onlineAdmins = [];
      onlineSnapshot.forEach(doc => {
        const data = doc.data();
        onlineAdmins.push({
          id: doc.id,
          name: data.name,
          room: data.room
        });
      });

      return res.status(200).json({
        success: true,
        onlineAdmins
      });
    }

    // CLEAR OLD MESSAGES (optional cleanup)
    if (action === 'cleanup') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const oldMessagesSnapshot = await firestore
        .collection('chat_messages')
        .where('timestamp', '<', thirtyDaysAgo)
        .get();

      const batch = firestore.batch();
      oldMessagesSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      return res.status(200).json({
        success: true,
        deletedCount: oldMessagesSnapshot.size
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Admin Chat API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

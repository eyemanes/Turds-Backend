import admin from 'firebase-admin';

// Initialize Firebase Admin
let db = null;
let initialized = false;

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
    initialized = true;
    return db;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return null;
  }
}

export default async function handler(req, res) {
  // Set CORS headers first
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const firestore = initializeFirebase();
  if (!firestore) {
    return res.status(500).json({ 
      error: 'Database connection failed',
      success: false,
      messages: [] 
    });
  }

  const { action } = req.query;
  // Use a shared room for admin and government
  const room = 'admin-government-shared';

  try {
    // GET CHAT MESSAGES
    if (action === 'get-messages') {
      try {
        // Create the collection if it doesn't exist by adding a system message
        const messagesRef = firestore.collection('chat_messages');
        const snapshot = await messagesRef
          .where('room', '==', room)
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        
        const messages = [];
        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            const data = doc.data();
            messages.push({
              id: doc.id,
              message: data.message,
              senderId: data.senderId,
              senderName: data.senderName,
              senderRole: data.senderRole || 'admin',
              room: data.room,
              timestamp: data.timestamp?.toDate() || new Date(),
            });
          });
        }

        // Reverse to show oldest first
        messages.reverse();

        return res.status(200).json({
          success: true,
          messages
        });
      } catch (error) {
        console.log('Error fetching messages:', error);
        // Return empty messages on error
        return res.status(200).json({
          success: true,
          messages: []
        });
      }
    }

    // SEND MESSAGE
    if (action === 'send-message') {
      const { message, senderId, senderName, senderRole } = req.body;

      if (!message || !senderId || !senderName) {
        return res.status(400).json({ 
          error: 'Missing required fields: message, senderId, senderName',
          success: false 
        });
      }

      const newMessage = {
        message,
        senderId,
        senderName,
        senderRole: senderRole || 'admin',
        room,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await firestore.collection('chat_messages').add(newMessage);

      // Also update online status
      await firestore.collection('online_admins').doc(senderId).set({
        id: senderId,
        name: senderName,
        role: senderRole || 'admin',
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
      
      try {
        const onlineSnapshot = await firestore
          .collection('online_admins')
          .where('lastSeen', '>', fiveMinutesAgo)
          .get();
        
        const onlineAdmins = [];
        if (!onlineSnapshot.empty) {
          onlineSnapshot.forEach(doc => {
            const data = doc.data();
            onlineAdmins.push({
              id: doc.id,
              name: data.name,
              role: data.role || 'admin',
              room: data.room
            });
          });
        }

        return res.status(200).json({
          success: true,
          onlineAdmins
        });
      } catch (error) {
        return res.status(200).json({
          success: true,
          onlineAdmins: []
        });
      }
    }

    return res.status(400).json({ 
      error: 'Invalid action',
      success: false 
    });

  } catch (error) {
    console.error('Admin Chat API error:', error);
    return res.status(200).json({ 
      success: false,
      error: error.message,
      messages: []
    });
  }
}

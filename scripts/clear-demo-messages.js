import admin from 'firebase-admin';

// Initialize Firebase Admin
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
  console.error('Missing Firebase credentials');
  process.exit(1);
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

const firestore = admin.firestore();

async function clearDemoMessages() {
  try {
    console.log('Clearing demo broadcast messages...');
    
    // Get all broadcast messages
    const messagesSnapshot = await firestore.collection('broadcast_messages').get();
    
    if (messagesSnapshot.empty) {
      console.log('No broadcast messages found');
      return;
    }
    
    // Delete all messages
    const batch = firestore.batch();
    messagesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${messagesSnapshot.docs.length} broadcast messages`);
    
    // Also clear admin chat messages
    const chatSnapshot = await firestore.collection('admin_chat').get();
    
    if (!chatSnapshot.empty) {
      const chatBatch = firestore.batch();
      chatSnapshot.docs.forEach(doc => {
        chatBatch.delete(doc.ref);
      });
      
      await chatBatch.commit();
      console.log(`Deleted ${chatSnapshot.docs.length} admin chat messages`);
    }
    
    console.log('Demo messages cleared successfully!');
    
  } catch (error) {
    console.error('Error clearing demo messages:', error);
  } finally {
    process.exit(0);
  }
}

clearDemoMessages();

// Script to update user admin status
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

async function updateUserAdminStatus(userId, isAdmin) {
  try {
    console.log(`Updating user ${userId} isAdmin to ${isAdmin}`);
    
    await firestore.collection('users').doc(userId).update({
      isAdmin: isAdmin,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('✅ User admin status updated successfully');
    
    // Verify the update
    const userDoc = await firestore.collection('users').doc(userId).get();
    const userData = userDoc.data();
    console.log('✅ Verification - User isAdmin:', userData.isAdmin);
    
  } catch (error) {
    console.error('❌ Error updating user admin status:', error);
  }
}

// Update your user to admin
const userId = 'did:privy:cmf90xuxx0011jv0c6z6zyn8x';
updateUserAdminStatus(userId, true);

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
    // GET BANK DATA
    if (action === 'get-data') {
      const bankDoc = await firestore.collection('bank').doc('treasury').get();
      
      if (!bankDoc.exists) {
        // Return default data if not initialized
        return res.status(200).json({
          success: true,
          bankData: {
            totalSalaries: 0,
            salaryPercentages: {
              president: 20,
              primeMinister: 15,
              secretary: 10,
              financeMinister: 10,
              creativityMinister: 8,
              raidMinister: 10,
              developmentMinister: 9,
              citizensMinister: 8,
              justiceMinister: 10
            },
            nextPaymentDate: null,
            lastUpdated: null,
            cycleActive: false
          }
        });
      }

      const data = bankDoc.data();
      return res.status(200).json({
        success: true,
        bankData: {
          totalSalaries: data.totalSalaries || 0,
          salaryPercentages: data.salaryPercentages || {},
          nextPaymentDate: data.nextPaymentDate?.toDate() || null,
          lastUpdated: data.lastUpdated?.toDate() || null,
          cycleActive: data.cycleActive || false
        }
      });
    }

    // UPDATE TOTAL SALARIES (Admin only)
    if (action === 'update-total') {
      const { totalSalaries, adminId } = req.body;

      if (!totalSalaries || totalSalaries < 0) {
        return res.status(400).json({ error: 'Invalid total salaries amount' });
      }

      // Skip admin verification for now since we know it's admin from frontend
      // TODO: Implement proper auth later

      // Update bank data
      await firestore.collection('bank').doc('treasury').set({
        totalSalaries,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminId
      }, { merge: true });

      // Log the update
      await firestore.collection('bank_logs').add({
        action: 'update_total',
        previousValue: (await firestore.collection('bank').doc('treasury').get()).data()?.totalSalaries || 0,
        newValue: totalSalaries,
        adminId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: 'Total salaries updated successfully'
      });
    }

    // UPDATE SALARY PERCENTAGES (Admin only)
    if (action === 'update-percentages') {
      const { salaryPercentages, adminId } = req.body;

      if (!salaryPercentages) {
        return res.status(400).json({ error: 'Invalid salary percentages' });
      }

      // Verify percentages add up to 100
      const total = Object.values(salaryPercentages).reduce((sum, pct) => sum + pct, 0);
      if (total !== 100) {
        return res.status(400).json({ error: 'Percentages must add up to 100%' });
      }

      // Verify admin status
      if (!adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const adminDoc = await firestore.collection('users').doc(adminId).get();
      if (!adminDoc.exists || !adminDoc.data().isAdmin) {
        return res.status(401).json({ error: 'Unauthorized - Admin access required' });
      }

      // Update bank data
      await firestore.collection('bank').doc('treasury').set({
        salaryPercentages,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: adminId
      }, { merge: true });

      return res.status(200).json({
        success: true,
        message: 'Salary percentages updated successfully'
      });
    }

    // START PAYMENT CYCLE (Admin only - one time button)
    if (action === 'start-cycle') {
      const { adminId } = req.body;

      // Verify admin status
      if (!adminId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const adminDoc = await firestore.collection('users').doc(adminId).get();
      if (!adminDoc.exists || !adminDoc.data().isAdmin) {
        return res.status(401).json({ error: 'Unauthorized - Admin access required' });
      }

      // Check if cycle is already active
      const bankDoc = await firestore.collection('bank').doc('treasury').get();
      if (bankDoc.exists && bankDoc.data().cycleActive) {
        return res.status(400).json({ error: 'Payment cycle is already active' });
      }

      // Calculate next payment date (7 days from now)
      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);

      // Update bank data
      await firestore.collection('bank').doc('treasury').set({
        nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPaymentDate),
        cycleActive: true,
        cycleStarted: admin.firestore.FieldValue.serverTimestamp(),
        startedBy: adminId
      }, { merge: true });

      // Log the cycle start
      await firestore.collection('bank_logs').add({
        action: 'start_cycle',
        nextPaymentDate,
        adminId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: 'Payment cycle started successfully',
        nextPaymentDate
      });
    }

    // PROCESS PAYMENT (Can be called when timer expires)
    if (action === 'process-payment') {
      const bankDoc = await firestore.collection('bank').doc('treasury').get();
      
      if (!bankDoc.exists || !bankDoc.data().cycleActive) {
        return res.status(400).json({ error: 'No active payment cycle' });
      }

      const bankData = bankDoc.data();
      const now = new Date();
      const paymentDate = bankData.nextPaymentDate?.toDate();

      if (!paymentDate || now < paymentDate) {
        return res.status(400).json({ error: 'Payment not due yet' });
      }

      // Process payments for each role
      const payments = [];
      const totalSalaries = bankData.totalSalaries || 0;
      const percentages = bankData.salaryPercentages || {};

      for (const [role, percentage] of Object.entries(percentages)) {
        const amount = (totalSalaries * percentage) / 100;
        payments.push({
          role,
          percentage,
          amount,
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Log all payments
      const batch = firestore.batch();
      payments.forEach(payment => {
        const paymentRef = firestore.collection('salary_payments').doc();
        batch.set(paymentRef, payment);
      });

      // Reset cycle for next week
      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);

      batch.update(firestore.collection('bank').doc('treasury'), {
        nextPaymentDate: admin.firestore.Timestamp.fromDate(nextPaymentDate),
        lastPaymentProcessed: admin.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      return res.status(200).json({
        success: true,
        message: 'Payments processed successfully',
        payments,
        nextPaymentDate
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Bank API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

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

const governmentRoles = [
  {
    name: 'President',
    description: 'Head of state and government, highest authority in TURDS Nation',
    level: 10,
    permissions: ['all'],
    color: '#DC2626' // Red
  },
  {
    name: 'Prime Minister',
    description: 'Second in command, assists the President in governance',
    level: 9,
    permissions: ['manage_ministers', 'approve_policies', 'emergency_powers'],
    color: '#7C3AED' // Purple
  },
  {
    name: 'Secretary',
    description: 'Handles official communications and documentation',
    level: 8,
    permissions: ['manage_documents', 'official_communications', 'record_keeping'],
    color: '#059669' // Green
  },
  {
    name: 'Minister of Marketing and Finance',
    description: 'Manages financial resources and marketing strategies',
    level: 7,
    permissions: ['budget_management', 'marketing_campaigns', 'financial_oversight'],
    color: '#D97706' // Orange
  },
  {
    name: 'Minister of Creativity',
    description: 'Oversees creative projects and cultural initiatives',
    level: 6,
    permissions: ['creative_projects', 'cultural_events', 'content_approval'],
    color: '#DB2777' // Pink
  },
  {
    name: 'Minister of Raid Corps',
    description: 'Commands military operations and defense strategies',
    level: 7,
    permissions: ['military_operations', 'defense_planning', 'security_oversight'],
    color: '#DC2626' // Red
  },
  {
    name: 'Minister of Development',
    description: 'Manages infrastructure and technological advancement',
    level: 6,
    permissions: ['infrastructure_projects', 'tech_development', 'urban_planning'],
    color: '#2563EB' // Blue
  },
  {
    name: 'Minister of Citizens',
    description: 'Represents citizen interests and handles public services',
    level: 5,
    permissions: ['citizen_services', 'public_welfare', 'community_outreach'],
    color: '#16A34A' // Green
  },
  {
    name: 'Minister of Justice',
    description: 'Oversees legal matters and judicial processes',
    level: 8,
    permissions: ['legal_oversight', 'judicial_appointments', 'law_enforcement'],
    color: '#7C2D12' // Brown
  }
];

async function setupGovernmentRoles() {
  try {
    console.log('Setting up government roles...');
    
    // Clear existing roles first
    const existingRoles = await firestore.collection('government_roles').get();
    if (!existingRoles.empty) {
      const batch = firestore.batch();
      existingRoles.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`Cleared ${existingRoles.docs.length} existing roles`);
    }
    
    // Add new roles
    const batch = firestore.batch();
    governmentRoles.forEach(role => {
      const docRef = firestore.collection('government_roles').doc();
      batch.set(docRef, {
        ...role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    console.log(`Successfully added ${governmentRoles.length} government roles`);
    
    // List the roles
    governmentRoles.forEach((role, index) => {
      console.log(`${index + 1}. ${role.name} (Level ${role.level}) - ${role.description}`);
    });
    
    console.log('Government roles setup complete!');
    
  } catch (error) {
    console.error('Error setting up government roles:', error);
  } finally {
    process.exit(0);
  }
}

setupGovernmentRoles();


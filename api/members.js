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
    // GET ALL MEMBERS
    if (action === 'get-all') {
      const membersSnapshot = await firestore.collection('users').get();
      const members = [];
      
      membersSnapshot.forEach(doc => {
        const data = doc.data();
        members.push({
          id: doc.id,
          uid: data.uid,
          username: data.username || 'Unknown',
          email: data.email || null,
          profilePicture: data.profilePicture || null,
          twitterUsername: data.twitterUsername || null,
          twitterFollowers: data.twitterFollowers || 0,
          tokenBalance: data.tokenBalance || 0,
          role: data.role || 'citizen',
          governmentRole: data.governmentRole || null,
          isAdmin: data.isAdmin || false,
          joinedAt: data.joinedAt?.toDate() || null,
          lastActive: data.lastActive?.toDate() || null,
          eligibleToVote: data.eligibleToVote !== false,
          eligibleForCandidacy: data.eligibleForCandidacy || false
        });
      });

      return res.status(200).json({
        success: true,
        members: members.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))
      });
    }

    // UPDATE MEMBER ROLE
    if (action === 'update-role') {
      const { userId, role, governmentRole } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      // Update user role
      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // If role is provided, update it (only government role allowed)
      if (role === 'government' || role === 'citizen') {
        updateData.role = role;
      }

      // Validate government role if provided
      if (governmentRole) {
        const validGovRoles = [
          'president', 'primeMinister', 'secretary', 'financeMinister', 
          'creativityMinister', 'raidMinister', 'developmentMinister', 
          'citizensMinister', 'justiceMinister', 'citizen'
        ];
        if (validGovRoles.includes(governmentRole)) {
          updateData.governmentRole = governmentRole;
          if (governmentRole !== 'citizen') {
            updateData.role = 'government';
          } else {
            updateData.role = 'citizen';
            updateData.governmentRole = null;
          }
        }
      }

      await firestore.collection('users').doc(userId).update(updateData);

      return res.status(200).json({
        success: true,
        message: 'Member role updated successfully'
      });
    }

    // GET GOVERNMENT MEMBERS
    if (action === 'get-government') {
      const membersSnapshot = await firestore.collection('users')
        .where('role', '==', 'government')
        .get();
      
      const members = [];
      membersSnapshot.forEach(doc => {
        const data = doc.data();
        members.push({
          id: doc.id,
          username: data.username || 'Unknown',
          governmentRole: data.governmentRole || null,
          profilePicture: data.profilePicture || null,
          joinedAt: data.joinedAt?.toDate() || null
        });
      });

      return res.status(200).json({
        success: true,
        members
      });
    }

    // GET GOVERNMENT ROLES
    if (action === 'get-government-roles') {
      // Define the government roles directly in the code
      const governmentRoles = [
        {
          id: 'president',
          name: 'President',
          description: 'Head of state and government, highest authority in TURDS Nation',
          level: 10,
          permissions: ['all'],
          color: '#DC2626'
        },
        {
          id: 'prime-minister',
          name: 'Prime Minister',
          description: 'Second in command, assists the President in governance',
          level: 9,
          permissions: ['manage_ministers', 'approve_policies', 'emergency_powers'],
          color: '#7C3AED'
        },
        {
          id: 'secretary',
          name: 'Secretary',
          description: 'Handles official communications and documentation',
          level: 8,
          permissions: ['manage_documents', 'official_communications', 'record_keeping'],
          color: '#059669'
        },
        {
          id: 'minister-marketing-finance',
          name: 'Minister of Marketing and Finance',
          description: 'Manages financial resources and marketing strategies',
          level: 7,
          permissions: ['budget_management', 'marketing_campaigns', 'financial_oversight'],
          color: '#D97706'
        },
        {
          id: 'minister-creativity',
          name: 'Minister of Creativity',
          description: 'Oversees creative projects and cultural initiatives',
          level: 6,
          permissions: ['creative_projects', 'cultural_events', 'content_approval'],
          color: '#DB2777'
        },
        {
          id: 'minister-raid-corps',
          name: 'Minister of Raid Corps',
          description: 'Commands military operations and defense strategies',
          level: 7,
          permissions: ['military_operations', 'defense_planning', 'security_oversight'],
          color: '#DC2626'
        },
        {
          id: 'minister-development',
          name: 'Minister of Development',
          description: 'Manages infrastructure and technological advancement',
          level: 6,
          permissions: ['infrastructure_projects', 'tech_development', 'urban_planning'],
          color: '#2563EB'
        },
        {
          id: 'minister-citizens',
          name: 'Minister of Citizens',
          description: 'Represents citizen interests and handles public services',
          level: 5,
          permissions: ['citizen_services', 'public_welfare', 'community_outreach'],
          color: '#16A34A'
        },
        {
          id: 'minister-justice',
          name: 'Minister of Justice',
          description: 'Oversees legal matters and judicial processes',
          level: 8,
          permissions: ['legal_oversight', 'judicial_appointments', 'law_enforcement'],
          color: '#7C2D12'
        }
      ];
      
      return res.status(200).json({
        success: true,
        roles: governmentRoles.sort((a, b) => b.level - a.level) // Sort by level descending
      });
    }

    // CREATE GOVERNMENT ROLE
    if (action === 'create-government-role') {
      const { name, description, permissions, level } = req.body;

      if (!name || !description) {
        return res.status(400).json({ error: 'Missing name or description' });
      }

      const roleData = {
        name,
        description,
        permissions: permissions || [],
        level: level || 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await firestore.collection('government_roles').add(roleData);

      return res.status(200).json({
        success: true,
        message: 'Government role created successfully',
        roleId: docRef.id
      });
    }

    // UPDATE GOVERNMENT ROLE
    if (action === 'update-government-role') {
      const { roleId, name, description, permissions, level } = req.body;

      if (!roleId) {
        return res.status(400).json({ error: 'Missing roleId' });
      }

      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (name) updateData.name = name;
      if (description) updateData.description = description;
      if (permissions) updateData.permissions = permissions;
      if (level) updateData.level = level;

      await firestore.collection('government_roles').doc(roleId).update(updateData);

      return res.status(200).json({
        success: true,
        message: 'Government role updated successfully'
      });
    }

    // DELETE GOVERNMENT ROLE
    if (action === 'delete-government-role') {
      const { roleId } = req.body;

      if (!roleId) {
        return res.status(400).json({ error: 'Missing roleId' });
      }

      await firestore.collection('government_roles').doc(roleId).delete();

      return res.status(200).json({
        success: true,
        message: 'Government role deleted successfully'
      });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('Members API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

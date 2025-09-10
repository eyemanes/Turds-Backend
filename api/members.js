import admin from 'firebase-admin';

const firestore = admin.firestore();

export default async function handler(req, res) {
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

      if (!userId || !role) {
        return res.status(400).json({ error: 'Missing userId or role' });
      }

      // Validate role
      const validRoles = ['citizen', 'moderator', 'admin', 'super_admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // Validate government role if provided
      if (governmentRole) {
        const validGovRoles = ['president', 'vice_president', 'minister', 'ambassador', 'judge', 'senator'];
        if (!validGovRoles.includes(governmentRole)) {
          return res.status(400).json({ error: 'Invalid government role' });
        }
      }

      // Update user role
      const updateData = {
        role: role,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (governmentRole) {
        updateData.governmentRole = governmentRole;
      } else {
        updateData.governmentRole = null;
      }

      await firestore.collection('users').doc(userId).update(updateData);

      return res.status(200).json({
        success: true,
        message: 'Member role updated successfully'
      });
    }

    // GET GOVERNMENT ROLES
    if (action === 'get-government-roles') {
      const rolesSnapshot = await firestore.collection('government_roles').get();
      const roles = [];
      
      rolesSnapshot.forEach(doc => {
        const data = doc.data();
        roles.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || null,
          updatedAt: data.updatedAt?.toDate() || null
        });
      });

      return res.status(200).json({
        success: true,
        roles: roles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
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

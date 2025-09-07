// Admin authentication endpoint
import crypto from 'crypto';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    // Hash the provided password
    const hashedPassword = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    // The correct password hash for "Turdsonamission@25"
    const correctPasswordHash = crypto
      .createHash('sha256')
      .update('Turdsonamission@25')
      .digest('hex');

    if (hashedPassword === correctPasswordHash) {
      // Generate a session token (in production, use JWT)
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        sessionToken,
        expiresIn: 24 * 60 * 60 * 1000, // 24 hours
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

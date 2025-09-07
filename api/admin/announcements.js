// Admin announcements endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // Return mock announcements for now
      const announcements = [
        {
          id: 1,
          title: 'Platform Launch',
          message: 'TURDS Nation platform is now live! Connect your Twitter to become a Citizen.',
          type: 'info',
          timestamp: new Date().toISOString(),
          author: 'System'
        },
        {
          id: 2,
          title: 'Elections Coming Soon',
          message: 'Presidential elections will begin once candidate registration opens.',
          type: 'success',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          author: 'Admin'
        }
      ];

      res.status(200).json({
        success: true,
        announcements,
        total: announcements.length
      });
    } else if (req.method === 'POST') {
      const { title, message, type = 'info' } = req.body;

      if (!title || !message) {
        return res.status(400).json({ 
          error: 'Title and message are required' 
        });
      }

      // In production, save to database
      const newAnnouncement = {
        id: Date.now(),
        title,
        message,
        type,
        timestamp: new Date().toISOString(),
        author: 'Admin'
      };

      res.status(201).json({
        success: true,
        message: 'Announcement created successfully',
        announcement: newAnnouncement
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Announcements error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

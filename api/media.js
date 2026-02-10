const admin = require('firebase-admin');
const TelegramBot = require('node-telegram-bot-api');

// Initialize Firebase Admin
const serviceAccount = {
  "type": "service_account",
  "project_id": "odigyan-56dc4",
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

const db = admin.firestore();

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const mediaRef = db.collection('media');

    // GET media files
    if (req.method === 'GET') {
      const { courseId, type, chapterId, limit = 50 } = req.query;
      
      let query = mediaRef;

      if (courseId) {
        query = query.where('courseId', '==', courseId);
      }

      if (type) {
        query = query.where('type', '==', type);
      }

      if (chapterId) {
        query = query.where('chapterId', '==', chapterId);
      }

      query = query.orderBy('createdAt', 'desc').limit(parseInt(limit));

      const snapshot = await query.get();
      const mediaFiles = [];
      
      snapshot.forEach(doc => {
        mediaFiles.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.status(200).json({
        success: true,
        data: mediaFiles,
        count: mediaFiles.length
      });
    }

    // POST add new media from Telegram
    if (req.method === 'POST') {
      const mediaData = req.body;
      
      if (!mediaData.fileId || !mediaData.type || !mediaData.courseId) {
        return res.status(400).json({
          success: false,
          error: 'File ID, type, and course ID are required'
        });
      }

      // Get file info from Telegram
      let fileInfo;
      try {
        fileInfo = await bot.getFile(mediaData.fileId);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Telegram file ID'
        });
      }

      // Construct file URL
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;

      const newMedia = {
        fileId: mediaData.fileId,
        telegramFileId: fileInfo.file_id,
        fileName: mediaData.fileName || fileInfo.file_path.split('/').pop(),
        fileType: mediaData.type,
        fileUrl: fileUrl,
        courseId: mediaData.courseId,
        chapterId: mediaData.chapterId || '',
        chapterName: mediaData.chapterName || 'General',
        name: mediaData.name || mediaData.fileName || 'Untitled',
        description: mediaData.description || '',
        type: mediaData.type, // 'video', 'notes', 'test', 'current-affairs'
        size: fileInfo.file_size || 0,
        duration: mediaData.duration || 0,
        order: mediaData.order || 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await mediaRef.add(newMedia);

      return res.status(201).json({
        success: true,
        message: 'Media file added successfully',
        id: docRef.id,
        data: newMedia
      });
    }

    // DELETE media file
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Media ID is required'
        });
      }

      const mediaDocRef = mediaRef.doc(id);
      const mediaDoc = await mediaDocRef.get();

      if (!mediaDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Media file not found'
        });
      }

      await mediaDocRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Media file deleted successfully'
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

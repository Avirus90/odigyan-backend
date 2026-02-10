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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const currentAffairsRef = db.collection('currentAffairs');

    // GET current affairs
    if (req.method === 'GET') {
      const { 
        type = 'daily', 
        courseId, 
        date, 
        limit = 20,
        page = 1 
      } = req.query;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = currentAffairsRef.where('type', '==', type);

      if (courseId) {
        query = query.where('courseId', '==', courseId);
      }

      if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        
        query = query.where('date', '>=', startDate.toISOString())
                     .where('date', '<=', endDate.toISOString());
      }

      query = query.orderBy('date', 'desc');

      const snapshot = await query.get();
      const total = snapshot.size;

      // Apply pagination
      const paginatedSnapshot = await query.limit(limitNum).offset(offset).get();
      
      const affairs = [];
      paginatedSnapshot.forEach(doc => {
        const affairData = doc.data();
        affairs.push({
          id: doc.id,
          ...affairData,
          date: affairData.date.toDate ? affairData.date.toDate().toISOString() : affairData.date
        });
      });

      return res.status(200).json({
        success: true,
        data: affairs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    }

    // POST create new current affair
    if (req.method === 'POST') {
      const affairData = req.body;
      
      if (!affairData.title || !affairData.type) {
        return res.status(400).json({
          success: false,
          error: 'Title and type are required'
        });
      }

      // Handle file from Telegram if provided
      let fileInfo = null;
      let fileUrl = '';
      
      if (affairData.fileId) {
        try {
          fileInfo = await bot.getFile(affairData.fileId);
          fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
        } catch (error) {
          console.error('Error fetching Telegram file:', error);
        }
      }

      const newAffair = {
        title: affairData.title,
        description: affairData.description || '',
        content: affairData.content || '',
        type: affairData.type, // daily, weekly, monthly, yearly
        courseId: affairData.courseId || '',
        category: affairData.category || 'General',
        fileId: affairData.fileId || '',
        fileUrl: fileUrl,
        fileName: affairData.fileName || (fileInfo ? fileInfo.file_path.split('/').pop() : ''),
        tags: affairData.tags || [],
        isImportant: affairData.isImportant || false,
        date: affairData.date ? new Date(affairData.date) : new Date(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await currentAffairsRef.add(newAffair);

      return res.status(201).json({
        success: true,
        message: 'Current affair created successfully',
        id: docRef.id,
        data: newAffair
      });
    }

    // PUT update current affair
    if (req.method === 'PUT') {
      const { id } = req.query;
      const affairData = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Current affair ID is required'
        });
      }

      const affairRef = currentAffairsRef.doc(id);
      const affairDoc = await affairRef.get();

      if (!affairDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Current affair not found'
        });
      }

      await affairRef.update({
        ...affairData,
        updatedAt: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Current affair updated successfully'
      });
    }

    // DELETE current affair
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Current affair ID is required'
        });
      }

      const affairRef = currentAffairsRef.doc(id);
      const affairDoc = await affairRef.get();

      if (!affairDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Current affair not found'
        });
      }

      await affairRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Current affair deleted successfully'
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

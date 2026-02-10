const admin = require('firebase-admin');

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
    const bannersRef = db.collection('banners');

    // GET all banners
    if (req.method === 'GET') {
      const snapshot = await bannersRef.orderBy('order', 'asc').get();
      const banners = [];
      
      snapshot.forEach(doc => {
        banners.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.status(200).json({
        success: true,
        data: banners
      });
    }

    // POST create new banner
    if (req.method === 'POST') {
      const bannerData = req.body;
      
      if (!bannerData.title || !bannerData.image) {
        return res.status(400).json({
          success: false,
          error: 'Title and image are required'
        });
      }

      // Get current max order
      const snapshot = await bannersRef.orderBy('order', 'desc').limit(1).get();
      let maxOrder = 0;
      
      if (!snapshot.empty) {
        maxOrder = snapshot.docs[0].data().order;
      }

      const newBanner = {
        title: bannerData.title,
        description: bannerData.description || '',
        image: bannerData.image,
        link: bannerData.link || '',
        isActive: bannerData.isActive !== undefined ? bannerData.isActive : true,
        order: maxOrder + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await bannersRef.add(newBanner);

      return res.status(201).json({
        success: true,
        message: 'Banner created successfully',
        id: docRef.id,
        data: newBanner
      });
    }

    // PUT update banner
    if (req.method === 'PUT') {
      const { id } = req.query;
      const bannerData = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Banner ID is required'
        });
      }

      const bannerRef = bannersRef.doc(id);
      const bannerDoc = await bannerRef.get();

      if (!bannerDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Banner not found'
        });
      }

      await bannerRef.update({
        ...bannerData,
        updatedAt: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Banner updated successfully'
      });
    }

    // DELETE banner
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Banner ID is required'
        });
      }

      const bannerRef = bannersRef.doc(id);
      const bannerDoc = await bannerRef.get();

      if (!bannerDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Banner not found'
        });
      }

      await bannerRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Banner deleted successfully'
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

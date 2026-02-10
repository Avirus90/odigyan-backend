const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      "type": "service_account",
      "project_id": "odigyan-56dc4",
      "private_key_id": "31099557f9b49d9f3f6298c94ade53a1b03756e3",
      "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      "client_email": "firebase-adminsdk-fbsvc@odigyan-56dc4.iam.gserviceaccount.com",
      "client_id": "110244582487810249130",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40odigyan-56dc4.iam.gserviceaccount.com"
    })
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const coursesSnapshot = await db.collection('courses').get();
      const courses = [];
      
      coursesSnapshot.forEach(doc => {
        courses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.status(200).json(courses);
    }

    if (req.method === 'POST') {
      const courseData = req.body;
      
      // Validate course data
      if (!courseData.name || !courseData.description) {
        return res.status(400).json({ error: 'Name and description are required' });
      }

      const docRef = await db.collection('courses').add({
        ...courseData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return res.status(201).json({ id: docRef.id, message: 'Course created successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

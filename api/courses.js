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
    const coursesRef = db.collection('courses');

    // GET all courses
    if (req.method === 'GET') {
      const snapshot = await coursesRef.orderBy('createdAt', 'desc').get();
      const courses = [];
      
      snapshot.forEach(doc => {
        courses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.status(200).json({
        success: true,
        data: courses,
        count: courses.length
      });
    }

    // POST create new course
    if (req.method === 'POST') {
      const courseData = req.body;
      
      if (!courseData.name || !courseData.description) {
        return res.status(400).json({
          success: false,
          error: 'Course name and description are required'
        });
      }

      const newCourse = {
        name: courseData.name,
        description: courseData.description,
        features: courseData.features || "Video Classes, Study Notes, Mock Tests, Current Affairs",
        image: courseData.image || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await coursesRef.add(newCourse);

      return res.status(201).json({
        success: true,
        message: 'Course created successfully',
        id: docRef.id,
        data: newCourse
      });
    }

    // PUT update course
    if (req.method === 'PUT') {
      const { id } = req.query;
      const courseData = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Course ID is required'
        });
      }

      const courseRef = coursesRef.doc(id);
      const courseDoc = await courseRef.get();

      if (!courseDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Course not found'
        });
      }

      await courseRef.update({
        ...courseData,
        updatedAt: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Course updated successfully'
      });
    }

    // DELETE course
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Course ID is required'
        });
      }

      const courseRef = coursesRef.doc(id);
      const courseDoc = await courseRef.get();

      if (!courseDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Course not found'
        });
      }

      await courseRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Course deleted successfully'
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

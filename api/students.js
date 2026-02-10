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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const studentsRef = db.collection('students');

    // GET all students
    if (req.method === 'GET') {
      const { page = 1, limit = 20, search = '' } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = studentsRef.orderBy('createdAt', 'desc');

      // Apply search filter if provided
      if (search) {
        // Note: Firestore doesn't support OR queries easily
        // You might need to implement better search logic
        query = query.where('name', '>=', search).where('name', '<=', search + '\uf8ff');
      }

      const snapshot = await query.get();
      const total = snapshot.size;

      // Apply pagination
      const paginatedSnapshot = await query.limit(limitNum).offset(offset).get();
      
      const students = [];
      paginatedSnapshot.forEach(doc => {
        const studentData = doc.data();
        // Remove sensitive data
        delete studentData.privateKey;
        students.push({
          id: doc.id,
          ...studentData
        });
      });

      return res.status(200).json({
        success: true,
        data: students,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    }

    // POST create/update student
    if (req.method === 'POST') {
      const studentData = req.body;
      
      if (!studentData.uid || !studentData.email || !studentData.name) {
        return res.status(400).json({
          success: false,
          error: 'UID, email, and name are required'
        });
      }

      const studentRef = studentsRef.doc(studentData.uid);
      const studentDoc = await studentRef.get();

      const studentRecord = {
        uid: studentData.uid,
        email: studentData.email,
        name: studentData.name,
        phone: studentData.phone || '',
        dob: studentData.dob || '',
        education: studentData.education || '',
        photoURL: studentData.photoURL || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        enrolledCourses: studentData.enrolledCourses || [],
        testAttempts: studentData.testAttempts || 0,
        totalScore: studentData.totalScore || 0,
        updatedAt: new Date().toISOString()
      };

      if (studentDoc.exists) {
        // Update existing student
        await studentRef.update(studentRecord);
        
        return res.status(200).json({
          success: true,
          message: 'Student updated successfully',
          id: studentData.uid
        });
      } else {
        // Create new student
        studentRecord.createdAt = new Date().toISOString();
        await studentRef.set(studentRecord);
        
        return res.status(201).json({
          success: true,
          message: 'Student registered successfully',
          id: studentData.uid
        });
      }
    }

    // PUT enroll student in course
    if (req.method === 'PUT') {
      const { uid, courseId } = req.body;

      if (!uid || !courseId) {
        return res.status(400).json({
          success: false,
          error: 'Student UID and Course ID are required'
        });
      }

      const studentRef = studentsRef.doc(uid);
      const studentDoc = await studentRef.get();

      if (!studentDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Student not found'
        });
      }

      const studentData = studentDoc.data();
      const enrolledCourses = studentData.enrolledCourses || [];

      if (!enrolledCourses.includes(courseId)) {
        enrolledCourses.push(courseId);
        
        await studentRef.update({
          enrolledCourses,
          updatedAt: new Date().toISOString()
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Course enrollment updated'
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

const admin = require('firebase-admin');

let firebaseApp;

try {
    if (!admin.apps.length) {
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            }),
            databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
        });
    } else {
        firebaseApp = admin.app();
    }
    
    console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    throw error;
}

// Firestore instance
const db = admin.firestore();
const auth = admin.auth();

// Batch helper for Firestore
const batch = db.batch;

// Firestore collections
const collections = {
    USERS: 'users',
    STUDENTS: 'students',
    COURSES: 'courses',
    ENROLLMENTS: 'enrollments',
    TEST_RESULTS: 'testResults',
    BANNERS: 'banners',
    FILES: 'files',
    SUBJECTS: 'subjects',
    CHAPTERS: 'chapters',
    CURRENT_AFFAIRS: 'currentAffairs',
    SETTINGS: 'settings'
};

// Firestore security rules
const firestoreRules = {
    // Course rules
    canViewCourse: (userId, course) => {
        if (course.public) return true;
        return course.students?.includes(userId) || course.teachers?.includes(userId);
    },
    
    canEditCourse: (userId, course) => {
        return course.teachers?.includes(userId) || course.owner === userId;
    },
    
    // Student rules
    canViewStudent: (userId, studentData) => {
        return studentData.userId === userId || 
               studentData.teachers?.includes(userId) ||
               process.env.ADMIN_EMAIL === studentData.email;
    },
    
    canEditStudent: (userId, studentData) => {
        return studentData.userId === userId;
    }
};

module.exports = {
    admin,
    firebaseApp,
    db,
    auth,
    batch,
    collections,
    firestoreRules
};

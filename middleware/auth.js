const { admin, firestoreRules } = require('../utils/firebase');
const { formatResponse } = require('../utils/helpers');

/**
 * Verify Firebase ID token
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json(
                formatResponse(false, null, 'No token provided')
            );
        }
        
        const token = authHeader.split('Bearer ')[1];
        
        // Verify Firebase token
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Add user info to request
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email.split('@')[0]
        };
        
        // Check if user is admin
        req.user.isAdmin = decodedToken.email === process.env.ADMIN_EMAIL;
        
        next();
        
    } catch (error) {
        console.error('Token verification error:', error.message);
        
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json(
                formatResponse(false, null, 'Token expired')
            );
        }
        
        return res.status(401).json(
            formatResponse(false, null, 'Invalid token')
        );
    }
};

/**
 * Check if user is authenticated
 */
const isAuthenticated = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json(
            formatResponse(false, null, 'Authentication required')
        );
    }
    next();
};

/**
 * Check if user is admin
 */
const isAdmin = async (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json(
            formatResponse(false, null, 'Admin access required')
        );
    }
    next();
};

/**
 * Check if user can access course
 */
const canAccessCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { uid, isAdmin } = req.user;
        
        if (isAdmin) {
            return next(); // Admin can access everything
        }
        
        // Check enrollment
        const enrollmentRef = admin.firestore()
            .collection('enrollments')
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .limit(1);
        
        const enrollmentSnap = await enrollmentRef.get();
        
        if (enrollmentSnap.empty) {
            return res.status(403).json(
                formatResponse(false, null, 'Not enrolled in this course')
            );
        }
        
        next();
        
    } catch (error) {
        console.error('Course access check error:', error);
        return res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
};

/**
 * Check if user can edit course
 */
const canEditCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { uid, isAdmin } = req.user;
        
        if (isAdmin) {
            return next();
        }
        
        // Get course
        const courseDoc = await admin.firestore()
            .collection('courses')
            .doc(courseId)
            .get();
        
        if (!courseDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Course not found')
            );
        }
        
        const course = courseDoc.data();
        
        // Check if user is teacher/owner
        const isTeacher = course.teachers?.includes(uid) || course.owner === uid;
        
        if (!isTeacher) {
            return res.status(403).json(
                formatResponse(false, null, 'Course editing permission required')
            );
        }
        
        next();
        
    } catch (error) {
        console.error('Course edit check error:', error);
        return res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
};

/**
 * Check if user can view student data
 */
const canViewStudent = async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const { uid, isAdmin } = req.user;
        
        if (isAdmin) {
            return next();
        }
        
        // Students can view their own data
        if (studentId === uid) {
            return next();
        }
        
        // Teachers can view their students' data
        // You might want to add additional checks here
        
        return res.status(403).json(
            formatResponse(false, null, 'Access to student data denied')
        );
        
    } catch (error) {
        console.error('Student view check error:', error);
        return res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
};

module.exports = {
    verifyToken,
    isAuthenticated,
    isAdmin,
    canAccessCourse,
    canEditCourse,
    canViewStudent
};

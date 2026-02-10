const express = require('express');
const router = express.Router();
const { admin } = require('../utils/firebase');
const { formatResponse, isValidEmail } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');

/**
 * @route   GET /api/auth/verify
 * @desc    Verify authentication token
 * @access  Public (with token)
 */
router.get('/verify', verifyToken, async (req, res) => {
    try {
        res.json(formatResponse(true, {
            user: req.user,
            isAuthenticated: true
        }));
        
    } catch (error) {
        console.error('Auth verification error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
});

/**
 * @route   POST /api/auth/create-custom-token
 * @desc    Create custom token for Firebase (for testing)
 * @access  Private (Admin only)
 */
router.post('/create-custom-token', verifyToken, async (req, res) => {
    try {
        const { uid, email } = req.body;
        
        if (!req.user.isAdmin) {
            return res.status(403).json(
                formatResponse(false, null, 'Admin access required')
            );
        }
        
        if (!uid && !email) {
            return res.status(400).json(
                formatResponse(false, null, 'UID or email required')
            );
        }
        
        let userId = uid;
        
        if (email) {
            try {
                const userRecord = await admin.auth().getUserByEmail(email);
                userId = userRecord.uid;
            } catch (error) {
                return res.status(404).json(
                    formatResponse(false, null, 'User not found')
                );
            }
        }
        
        const customToken = await admin.auth().createCustomToken(userId);
        
        res.json(formatResponse(true, { customToken }));
        
    } catch (error) {
        console.error('Create custom token error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
});

/**
 * @route   GET /api/auth/user/:uid
 * @desc    Get user information
 * @access  Private
 */
router.get('/user/:uid', verifyToken, async (req, res) => {
    try {
        const { uid } = req.params;
        
        // Users can only get their own info unless admin
        if (req.user.uid !== uid && !req.user.isAdmin) {
            return res.status(403).json(
                formatResponse(false, null, 'Access denied')
            );
        }
        
        const userRecord = await admin.auth().getUser(uid);
        
        // Remove sensitive information
        const safeUserInfo = {
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName,
            photoURL: userRecord.photoURL,
            emailVerified: userRecord.emailVerified,
            disabled: userRecord.disabled,
            metadata: userRecord.metadata
        };
        
        res.json(formatResponse(true, safeUserInfo));
        
    } catch (error) {
        console.error('Get user error:', error);
        
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json(
                formatResponse(false, null, 'User not found')
            );
        }
        
        res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
});

/**
 * @route   POST /api/auth/update-profile
 * @desc    Update user profile
 * @access  Private
 */
router.post('/update-profile', verifyToken, async (req, res) => {
    try {
        const { displayName, photoURL } = req.body;
        const { uid } = req.user;
        
        const updateData = {};
        
        if (displayName) updateData.displayName = displayName;
        if (photoURL) updateData.photoURL = photoURL;
        
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json(
                formatResponse(false, null, 'No data to update')
            );
        }
        
        await admin.auth().updateUser(uid, updateData);
        
        res.json(formatResponse(true, { message: 'Profile updated successfully' }));
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
});

/**
 * @route   DELETE /api/auth/delete-account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/delete-account', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        
        // Also delete from Firestore
        const db = admin.firestore();
        const batch = db.batch();
        
        // Delete student record
        batch.delete(db.collection('students').doc(uid));
        
        // Delete enrollments
        const enrollmentsRef = db.collection('enrollments').where('userId', '==', uid);
        const enrollmentsSnap = await enrollmentsRef.get();
        
        enrollmentsSnap.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Delete test results
        const testResultsRef = db.collection('testResults').where('userId', '==', uid);
        const testResultsSnap = await testResultsRef.get();
        
        testResultsSnap.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        
        // Delete from Firebase Auth
        await admin.auth().deleteUser(uid);
        
        res.json(formatResponse(true, { message: 'Account deleted successfully' }));
        
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Internal server error')
        );
    }
});

module.exports = router;

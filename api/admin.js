const express = require('express');
const router = express.Router();
const { admin, db, collections } = require('../utils/firebase');
const { formatResponse, paginate, sanitizeInput } = require('../utils/helpers');
const { verifyToken, isAdmin } = require('../middleware/auth');

// All admin routes require admin privileges
router.use(verifyToken, isAdmin);

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Private (Admin only)
 */
router.get('/dashboard', async (req, res) => {
    try {
        // Get total students count
        const studentsSnap = await db.collection(collections.STUDENTS).get();
        const totalStudents = studentsSnap.size;
        
        // Get total courses count
        const coursesSnap = await db.collection(collections.COURSES).get();
        const totalCourses = coursesSnap.size;
        
        // Get total enrollments count
        const enrollmentsSnap = await db.collection(collections.ENROLLMENTS).get();
        const totalEnrollments = enrollmentsSnap.size;
        
        // Get total test attempts
        const testsSnap = await db.collection(collections.TEST_RESULTS).get();
        const totalTests = testsSnap.size;
        
        // Get recent students (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const recentStudentsQuery = await db.collection(collections.STUDENTS)
            .where('createdAt', '>', weekAgo)
            .get();
        const recentStudents = recentStudentsQuery.size;
        
        // Get popular courses (by enrollment)
        const courses = [];
        coursesSnap.forEach(doc => {
            courses.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Sort by enrollment count
        const popularCourses = courses
            .sort((a, b) => (b.enrollmentCount || 0) - (a.enrollmentCount || 0))
            .slice(0, 5);
        
        // Get recent test results
        const recentTestsQuery = await db.collection(collections.TEST_RESULTS)
            .orderBy('testDate', 'desc')
            .limit(10)
            .get();
        
        const recentTests = [];
        for (const doc of recentTestsQuery.docs) {
            const test = doc.data();
            
            // Get student name
            const studentDoc = await db.collection(collections.STUDENTS)
                .doc(test.userId)
                .get();
            
            const studentName = studentDoc.exists ? 
                studentDoc.data().fullName || studentDoc.data().email : 'Unknown';
            
            // Get course name
            let courseName = 'Unknown Course';
            if (test.courseId) {
                const courseDoc = await db.collection(collections.COURSES)
                    .doc(test.courseId)
                    .get();
                
                if (courseDoc.exists) {
                    courseName = courseDoc.data().name;
                }
            }
            
            recentTests.push({
                id: doc.id,
                studentName,
                courseName,
                score: test.score,
                date: test.testDate
            });
        }
        
        res.json(formatResponse(true, {
            stats: {
                totalStudents,
                totalCourses,
                totalEnrollments,
                totalTests,
                recentStudents,
                averageEnrollment: totalCourses > 0 ? Math.round(totalEnrollments / totalCourses) : 0,
                averageTestsPerStudent: totalStudents > 0 ? Math.round(totalTests / totalStudents) : 0
            },
            popularCourses,
            recentTests
        }));
        
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to load dashboard')
        );
    }
});

/**
 * @route   GET /api/admin/students
 * @desc    Get all students with pagination
 * @access  Private (Admin only)
 */
router.get('/students', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        
        let query = db.collection(collections.STUDENTS);
        
        // Apply search filter if provided
        if (search) {
            // Note: Firestore doesn't support OR queries easily
            // This is a simplified search
            query = query.orderBy('fullName').startAt(search).endAt(search + '\uf8ff');
        }
        
        const snapshot = await query.get();
        
        const students = [];
        for (const doc of snapshot.docs) {
            const student = doc.data();
            
            // Get enrollment count for this student
            const enrollmentsSnap = await db.collection(collections.ENROLLMENTS)
                .where('userId', '==', doc.id)
                .get();
            
            // Get test results for this student
            const testsSnap = await db.collection(collections.TEST_RESULTS)
                .where('userId', '==', doc.id)
                .get();
            
            // Calculate average test score
            let averageScore = 0;
            if (testsSnap.size > 0) {
                const totalScore = testsSnap.docs.reduce((sum, testDoc) => 
                    sum + (testDoc.data().score || 0), 0);
                averageScore = Math.round(totalScore / testsSnap.size);
            }
            
            students.push({
                id: doc.id,
                ...student,
                stats: {
                    enrolledCourses: enrollmentsSnap.size,
                    testsTaken: testsSnap.size,
                    averageScore
                }
            });
        }
        
        // Paginate results
        const paginated = paginate(students, parseInt(page), parseInt(limit));
        
        res.json(formatResponse(true, paginated));
        
    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch students')
        );
    }
});

/**
 * @route   GET /api/admin/student/:studentId
 * @desc    Get detailed student information
 * @access  Private (Admin only)
 */
router.get('/student/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;
        
        // Get student profile
        const studentDoc = await db.collection(collections.STUDENTS)
            .doc(studentId)
            .get();
        
        if (!studentDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Student not found')
            );
        }
        
        const student = studentDoc.data();
        
        // Get enrolled courses
        const enrollmentsSnap = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', studentId)
            .get();
        
        const enrolledCourses = [];
        for (const doc of enrollmentsSnap.docs) {
            const enrollment = doc.data();
            
            const courseDoc = await db.collection(collections.COURSES)
                .doc(enrollment.courseId)
                .get();
            
            if (courseDoc.exists) {
                enrolledCourses.push({
                    enrollmentId: doc.id,
                    courseId: enrollment.courseId,
                    courseName: courseDoc.data().name,
                    enrolledAt: enrollment.enrolledAt,
                    progress: enrollment.progress || 0,
                    lastAccessed: enrollment.lastAccessed
                });
            }
        }
        
        // Get test results
        const testsSnap = await db.collection(collections.TEST_RESULTS)
            .where('userId', '==', studentId)
            .orderBy('testDate', 'desc')
            .get();
        
        const testResults = [];
        for (const doc of testsSnap.docs) {
            const test = doc.data();
            
            let courseName = 'Unknown Course';
            if (test.courseId) {
                const courseDoc = await db.collection(collections.COURSES)
                    .doc(test.courseId)
                    .get();
                
                if (courseDoc.exists) {
                    courseName = courseDoc.data().name;
                }
            }
            
            testResults.push({
                id: doc.id,
                courseName,
                score: test.score,
                correct: test.correct,
                total: test.total,
                timeSpent: test.timeSpent,
                testDate: test.testDate
            });
        }
        
        // Calculate statistics
        const stats = {
            totalCourses: enrolledCourses.length,
            totalTests: testResults.length,
            averageProgress: enrolledCourses.length > 0 ? 
                Math.round(enrolledCourses.reduce((sum, course) => sum + course.progress, 0) / enrolledCourses.length) : 0,
            averageScore: testResults.length > 0 ? 
                Math.round(testResults.reduce((sum, test) => sum + test.score, 0) / testResults.length) : 0,
            bestScore: testResults.length > 0 ? 
                Math.max(...testResults.map(test => test.score)) : 0
        };
        
        res.json(formatResponse(true, {
            profile: student,
            enrolledCourses,
            testResults,
            stats
        }));
        
    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch student details')
        );
    }
});

/**
 * @route   POST /api/admin/courses
 * @desc    Create a new course
 * @access  Private (Admin only)
 */
router.post('/courses', async (req, res) => {
    try {
        const { name, description, category, thumbnail, price, duration } = req.body;
        
        if (!name || !description) {
            return res.status(400).json(
                formatResponse(false, null, 'Name and description are required')
            );
        }
        
        // Sanitize input
        const courseData = {
            name: sanitizeInput(name),
            description: sanitizeInput(description),
            category: sanitizeInput(category) || 'General',
            thumbnail: thumbnail || '',
            price: parseFloat(price) || 0,
            duration: sanitizeInput(duration) || 'Self-paced',
            active: true,
            public: true,
            enrollmentCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: req.user.uid
        };
        
        const courseRef = await db.collection(collections.COURSES).add(courseData);
        
        res.json(formatResponse(true, {
            courseId: courseRef.id,
            message: 'Course created successfully'
        }));
        
    } catch (error) {
        console.error('Create course error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to create course')
        );
    }
});

/**
 * @route   PUT /api/admin/courses/:courseId
 * @desc    Update course
 * @access  Private (Admin only)
 */
router.put('/courses/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        const updateData = req.body;
        
        // Remove non-updatable fields
        delete updateData.createdAt;
        delete updateData.createdBy;
        delete updateData.enrollmentCount;
        
        // Sanitize input
        Object.keys(updateData).forEach(key => {
            if (typeof updateData[key] === 'string') {
                updateData[key] = sanitizeInput(updateData[key]);
            }
        });
        
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        
        await db.collection(collections.COURSES)
            .doc(courseId)
            .update(updateData);
        
        res.json(formatResponse(true, {
            message: 'Course updated successfully'
        }));
        
    } catch (error) {
        console.error('Update course error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to update course')
        );
    }
});

/**
 * @route   DELETE /api/admin/courses/:courseId
 * @desc    Delete course (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/courses/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        
        // Soft delete - mark as inactive
        await db.collection(collections.COURSES)
            .doc(courseId)
            .update({
                active: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        
        res.json(formatResponse(true, {
            message: 'Course deleted successfully'
        }));
        
    } catch (error) {
        console.error('Delete course error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to delete course')
        );
    }
});

/**
 * @route   POST /api/admin/banners
 * @desc    Create banner
 * @access  Private (Admin only)
 */
router.post('/banners', async (req, res) => {
    try {
        const { title, description, imageUrl, buttonText, buttonLink, active = true } = req.body;
        
        if (!title || !description) {
            return res.status(400).json(
                formatResponse(false, null, 'Title and description are required')
            );
        }
        
        const bannerData = {
            title: sanitizeInput(title),
            description: sanitizeInput(description),
            imageUrl: imageUrl || '',
            buttonText: sanitizeInput(buttonText) || '',
            buttonLink: buttonLink || '',
            active: Boolean(active),
            order: 0, // Will be updated based on position
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: req.user.uid
        };
        
        const bannerRef = await db.collection(collections.BANNERS).add(bannerData);
        
        res.json(formatResponse(true, {
            bannerId: bannerRef.id,
            message: 'Banner created successfully'
        }));
        
    } catch (error) {
        console.error('Create banner error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to create banner')
        );
    }
});

/**
 * @route   GET /api/admin/banners
 * @desc    Get all banners
 * @access  Private (Admin only)
 */
router.get('/banners', async (req, res) => {
    try {
        const snapshot = await db.collection(collections.BANNERS)
            .orderBy('createdAt', 'desc')
            .get();
        
        const banners = [];
        snapshot.forEach(doc => {
            banners.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        res.json(formatResponse(true, banners));
        
    } catch (error) {
        console.error('Get banners error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch banners')
        );
    }
});

/**
 * @route   PUT /api/admin/banners/:bannerId
 * @desc    Update banner
 * @access  Private (Admin only)
 */
router.put('/banners/:bannerId', async (req, res) => {
    try {
        const { bannerId } = req.params;
        const updateData = req.body;
        
        // Sanitize input
        Object.keys(updateData).forEach(key => {
            if (typeof updateData[key] === 'string') {
                updateData[key] = sanitizeInput(updateData[key]);
            }
        });
        
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        
        await db.collection(collections.BANNERS)
            .doc(bannerId)
            .update(updateData);
        
        res.json(formatResponse(true, {
            message: 'Banner updated successfully'
        }));
        
    } catch (error) {
        console.error('Update banner error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to update banner')
        );
    }
});

/**
 * @route   DELETE /api/admin/banners/:bannerId
 * @desc    Delete banner
 * @access  Private (Admin only)
 */
router.delete('/banners/:bannerId', async (req, res) => {
    try {
        const { bannerId } = req.params;
        
        await db.collection(collections.BANNERS)
            .doc(bannerId)
            .delete();
        
        res.json(formatResponse(true, {
            message: 'Banner deleted successfully'
        }));
        
    } catch (error) {
        console.error('Delete banner error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to delete banner')
        );
    }
});

/**
 * @route   GET /api/admin/analytics
 * @desc    Get platform analytics
 * @access  Private (Admin only)
 */
router.get('/analytics', async (req, res) => {
    try {
        const { period = 'month' } = req.query; // day, week, month, year
        
        // Calculate date range based on period
        const now = new Date();
        let startDate = new Date();
        
        switch (period) {
            case 'day':
                startDate.setDate(now.getDate() - 1);
                break;
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(now.getMonth() - 1);
        }
        
        // Get new students in period
        const newStudentsSnap = await db.collection(collections.STUDENTS)
            .where('createdAt', '>', startDate)
            .get();
        
        // Get new enrollments in period
        const newEnrollmentsSnap = await db.collection(collections.ENROLLMENTS)
            .where('enrolledAt', '>', startDate)
            .get();
        
        // Get test attempts in period
        const testAttemptsSnap = await db.collection(collections.TEST_RESULTS)
            .where('testDate', '>', startDate)
            .get();
        
        // Calculate daily/weekly/monthly trends
        const trends = await calculateTrends(period);
        
        // Get top performing courses
        const coursesSnap = await db.collection(collections.COURSES).get();
        const coursePerformance = [];
        
        for (const doc of coursesSnap.docs) {
            const course = doc.data();
            
            // Get enrollments for this course
            const courseEnrollmentsSnap = await db.collection(collections.ENROLLMENTS)
                .where('courseId', '==', doc.id)
                .get();
            
            // Get test results for this course
            const courseTestsSnap = await db.collection(collections.TEST_RESULTS)
                .where('courseId', '==', doc.id)
                .get();
            
            let averageScore = 0;
            if (courseTestsSnap.size > 0) {
                const totalScore = courseTestsSnap.docs.reduce((sum, testDoc) => 
                    sum + (testDoc.data().score || 0), 0);
                averageScore = Math.round(totalScore / courseTestsSnap.size);
            }
            
            coursePerformance.push({
                courseId: doc.id,
                courseName: course.name,
                enrollmentCount: courseEnrollmentsSnap.size,
                testAttempts: courseTestsSnap.size,
                averageScore,
                completionRate: courseEnrollmentsSnap.size > 0 ? 
                    Math.round((courseEnrollmentsSnap.docs.filter(e => e.data().progress >= 90).length / courseEnrollmentsSnap.size) * 100) : 0
            });
        }
        
        // Sort by enrollment count
        coursePerformance.sort((a, b) => b.enrollmentCount - a.enrollmentCount);
        
        res.json(formatResponse(true, {
            period,
            dateRange: {
                start: startDate,
                end: now
            },
            stats: {
                newStudents: newStudentsSnap.size,
                newEnrollments: newEnrollmentsSnap.size,
                testAttempts: testAttemptsSnap.size,
                activeUsers: await getActiveUsersCount(startDate)
            },
            trends,
            topCourses: coursePerformance.slice(0, 10),
            bottomCourses: coursePerformance.slice(-10).reverse()
        }));
        
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch analytics')
        );
    }
});

/**
 * Helper function to calculate trends
 */
async function calculateTrends(period) {
    const trends = {
        studentGrowth: [],
        enrollmentGrowth: [],
        testGrowth: []
    };
    
    // This is a simplified implementation
    // In production, you would query Firestore with proper date ranges
    
    return trends;
}

/**
 * Helper function to get active users count
 */
async function getActiveUsersCount(sinceDate) {
    try {
        // Get users who have accessed the platform since the given date
        const enrollmentsSnap = await db.collection(collections.ENROLLMENTS)
            .where('lastAccessed', '>', sinceDate)
            .get();
        
        // Get unique user IDs
        const activeUserIds = new Set();
        enrollmentsSnap.forEach(doc => {
            activeUserIds.add(doc.data().userId);
        });
        
        return activeUserIds.size;
        
    } catch (error) {
        console.error('Get active users error:', error);
        return 0;
    }
}

/**
 * @route   POST /api/admin/upload-logo
 * @desc    Upload platform logo
 * @access  Private (Admin only)
 */
router.post('/upload-logo', async (req, res) => {
    try {
        const { logoUrl, logoType = 'main' } = req.body;
        
        if (!logoUrl) {
            return res.status(400).json(
                formatResponse(false, null, 'Logo URL is required')
            );
        }
        
        // Save to settings
        await db.collection(collections.SETTINGS)
            .doc('logo')
            .set({
                [logoType]: logoUrl,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: req.user.uid
            }, { merge: true });
        
        res.json(formatResponse(true, {
            message: 'Logo updated successfully',
            logoUrl
        }));
        
    } catch (error) {
        console.error('Upload logo error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to upload logo')
        );
    }
});

module.exports = router;

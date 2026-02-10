const express = require('express');
const router = express.Router();
const { admin, db, collections } = require('../utils/firebase');
const { formatResponse, isValidPhone, sanitizeInput } = require('../utils/helpers');
const { verifyToken, isAuthenticated, canViewStudent } = require('../middleware/auth');

/**
 * @route   POST /api/students/register
 * @desc    Register student profile
 * @access  Private
 */
router.post('/register', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid, email } = req.user;
        const { fullName, dob, phone, education } = req.body;
        
        // Validate input
        if (!fullName || !dob || !phone || !education) {
            return res.status(400).json(
                formatResponse(false, null, 'All fields are required')
            );
        }
        
        if (!isValidPhone(phone)) {
            return res.status(400).json(
                formatResponse(false, null, 'Invalid phone number format')
            );
        }
        
        // Sanitize input
        const sanitizedData = {
            fullName: sanitizeInput(fullName),
            dob: sanitizeInput(dob),
            phone: sanitizeInput(phone),
            education: sanitizeInput(education)
        };
        
        // Check if already registered
        const existingStudent = await db.collection(collections.STUDENTS)
            .doc(uid)
            .get();
        
        if (existingStudent.exists) {
            return res.status(400).json(
                formatResponse(false, null, 'Student already registered')
            );
        }
        
        // Create student profile
        const studentData = {
            userId: uid,
            email: email,
            ...sanitizedData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isActive: true,
            profileCompleted: true
        };
        
        await db.collection(collections.STUDENTS)
            .doc(uid)
            .set(studentData);
        
        res.json(formatResponse(true, {
            message: 'Registration completed successfully',
            studentId: uid
        }));
        
    } catch (error) {
        console.error('Student registration error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Registration failed')
        );
    }
});

/**
 * @route   GET /api/students/profile
 * @desc    Get student profile
 * @access  Private
 */
router.get('/profile', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid } = req.user;
        
        const studentDoc = await db.collection(collections.STUDENTS)
            .doc(uid)
            .get();
        
        if (!studentDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Student profile not found')
            );
        }
        
        const student = studentDoc.data();
        
        // Get enrolled courses
        const enrollmentsSnap = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .get();
        
        const enrolledCourses = [];
        
        for (const enrollmentDoc of enrollmentsSnap.docs) {
            const enrollment = enrollmentDoc.data();
            
            const courseDoc = await db.collection(collections.COURSES)
                .doc(enrollment.courseId)
                .get();
            
            if (courseDoc.exists) {
                enrolledCourses.push({
                    enrollmentId: enrollmentDoc.id,
                    courseId: enrollment.courseId,
                    courseName: courseDoc.data().name,
                    enrolledAt: enrollment.enrolledAt,
                    progress: enrollment.progress || 0,
                    lastAccessed: enrollment.lastAccessed
                });
            }
        }
        
        // Get test results
        const testResultsSnap = await db.collection(collections.TEST_RESULTS)
            .where('userId', '==', uid)
            .orderBy('testDate', 'desc')
            .limit(10)
            .get();
        
        const testResults = [];
        testResultsSnap.forEach(doc => {
            testResults.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Calculate overall progress
        const totalProgress = enrolledCourses.reduce((sum, course) => sum + course.progress, 0);
        const overallProgress = enrolledCourses.length > 0 ? 
            Math.round(totalProgress / enrolledCourses.length) : 0;
        
        res.json(formatResponse(true, {
            profile: student,
            enrolledCourses,
            testResults,
            stats: {
                totalCourses: enrolledCourses.length,
                overallProgress,
                testsTaken: testResults.length,
                averageScore: testResults.length > 0 ? 
                    Math.round(testResults.reduce((sum, test) => sum + test.score, 0) / testResults.length) : 0
            }
        }));
        
    } catch (error) {
        console.error('Get student profile error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch profile')
        );
    }
});

/**
 * @route   PUT /api/students/profile
 * @desc    Update student profile
 * @access  Private
 */
router.put('/profile', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid } = req.user;
        const updateData = req.body;
        
        // Remove non-updatable fields
        delete updateData.userId;
        delete updateData.email;
        delete updateData.createdAt;
        
        // Validate phone if provided
        if (updateData.phone && !isValidPhone(updateData.phone)) {
            return res.status(400).json(
                formatResponse(false, null, 'Invalid phone number format')
            );
        }
        
        // Sanitize input
        Object.keys(updateData).forEach(key => {
            if (typeof updateData[key] === 'string') {
                updateData[key] = sanitizeInput(updateData[key]);
            }
        });
        
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        
        await db.collection(collections.STUDENTS)
            .doc(uid)
            .update(updateData);
        
        res.json(formatResponse(true, {
            message: 'Profile updated successfully'
        }));
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to update profile')
        );
    }
});

/**
 * @route   POST /api/students/test-result
 * @desc    Save mock test result
 * @access  Private
 */
router.post('/test-result', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid } = req.user;
        const { courseId, score, correct, total, answers, timeSpent, questions } = req.body;
        
        if (!courseId || score === undefined) {
            return res.status(400).json(
                formatResponse(false, null, 'Course ID and score are required')
            );
        }
        
        const testData = {
            userId: uid,
            courseId,
            score: parseFloat(score),
            correct: parseInt(correct) || 0,
            total: parseInt(total) || 0,
            answers: answers || {},
            timeSpent: parseInt(timeSpent) || 0,
            questions: questions || [],
            testDate: admin.firestore.FieldValue.serverTimestamp(),
            submittedAt: new Date().toISOString()
        };
        
        // Calculate percentage if not provided
        if (!testData.score && testData.total > 0) {
            testData.score = Math.round((testData.correct / testData.total) * 100);
        }
        
        const testRef = await db.collection(collections.TEST_RESULTS).add(testData);
        
        // Update course progress based on test performance
        if (testData.score >= 70) { // If score is 70% or above
            const enrollmentQuery = await db.collection(collections.ENROLLMENTS)
                .where('userId', '==', uid)
                .where('courseId', '==', courseId)
                .limit(1)
                .get();
            
            if (!enrollmentQuery.empty) {
                const enrollmentDoc = enrollmentQuery.docs[0];
                const enrollment = enrollmentDoc.data();
                
                // Add test to completed tests
                const completedTests = enrollment.completedTests || [];
                if (!completedTests.includes(testRef.id)) {
                    completedTests.push(testRef.id);
                    
                    await enrollmentDoc.ref.update({
                        completedTests,
                        lastAccessed: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        }
        
        res.json(formatResponse(true, {
            testId: testRef.id,
            message: 'Test result saved successfully'
        }));
        
    } catch (error) {
        console.error('Save test result error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to save test result')
        );
    }
});

/**
 * @route   GET /api/students/test-results
 * @desc    Get student's test results
 * @access  Private
 */
router.get('/test-results', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid } = req.user;
        const { courseId, page = 1, limit = 10 } = req.query;
        
        let query = db.collection(collections.TEST_RESULTS)
            .where('userId', '==', uid)
            .orderBy('testDate', 'desc');
        
        if (courseId) {
            query = query.where('courseId', '==', courseId);
        }
        
        const snapshot = await query.get();
        
        const testResults = [];
        snapshot.forEach(doc => {
            testResults.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Paginate
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedResults = testResults.slice(startIndex, endIndex);
        
        // Get course names for each test
        for (const result of paginatedResults) {
            if (result.courseId) {
                const courseDoc = await db.collection(collections.COURSES)
                    .doc(result.courseId)
                    .get();
                
                if (courseDoc.exists) {
                    result.courseName = courseDoc.data().name;
                }
            }
        }
        
        res.json(formatResponse(true, {
            results: paginatedResults,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: testResults.length,
                totalPages: Math.ceil(testResults.length / limit)
            },
            stats: {
                totalTests: testResults.length,
                averageScore: testResults.length > 0 ? 
                    Math.round(testResults.reduce((sum, test) => sum + test.score, 0) / testResults.length) : 0,
                bestScore: testResults.length > 0 ? 
                    Math.max(...testResults.map(test => test.score)) : 0
            }
        }));
        
    } catch (error) {
        console.error('Get test results error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch test results')
        );
    }
});

/**
 * @route   GET /api/students/test-result/:testId
 * @desc    Get detailed test result
 * @access  Private
 */
router.get('/test-result/:testId', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid } = req.user;
        const { testId } = req.params;
        
        const testDoc = await db.collection(collections.TEST_RESULTS)
            .doc(testId)
            .get();
        
        if (!testDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Test result not found')
            );
        }
        
        const testData = testDoc.data();
        
        // Check if user owns this test result
        if (testData.userId !== uid && !req.user.isAdmin) {
            return res.status(403).json(
                formatResponse(false, null, 'Access denied')
            );
        }
        
        // Get course details
        let courseName = 'Unknown Course';
        if (testData.courseId) {
            const courseDoc = await db.collection(collections.COURSES)
                .doc(testData.courseId)
                .get();
            
            if (courseDoc.exists) {
                courseName = courseDoc.data().name;
            }
        }
        
        // Calculate detailed statistics
        const questions = testData.questions || [];
        const answers = testData.answers || {};
        
        const detailedStats = {
            totalQuestions: questions.length,
            attempted: Object.keys(answers).length,
            correct: testData.correct || 0,
            wrong: (testData.total || 0) - (testData.correct || 0),
            skipped: questions.length - Object.keys(answers).length,
            accuracy: questions.length > 0 ? 
                Math.round((testData.correct / questions.length) * 100) : 0
        };
        
        // Prepare question-wise analysis
        const questionAnalysis = questions.map((question, index) => {
            const userAnswer = answers[index];
            const isCorrect = userAnswer === question.answer;
            
            return {
                questionNumber: index + 1,
                question: question.text,
                userAnswer: userAnswer !== undefined ? question.options[userAnswer] : 'Not Attempted',
                correctAnswer: question.options[question.answer],
                isCorrect,
                explanation: question.explanation || '',
                marks: question.marks || 1,
                negativeMarks: question.negativeMarks || 0
            };
        });
        
        res.json(formatResponse(true, {
            testId,
            courseId: testData.courseId,
            courseName,
            score: testData.score,
            ...detailedStats,
            timeSpent: testData.timeSpent,
            testDate: testData.testDate,
            submittedAt: testData.submittedAt,
            questionAnalysis
        }));
        
    } catch (error) {
        console.error('Get test result error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch test result')
        );
    }
});

/**
 * @route   GET /api/students/enrolled-courses
 * @desc    Get student's enrolled courses
 * @access  Private
 */
router.get('/enrolled-courses', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { uid } = req.user;
        const { page = 1, limit = 10 } = req.query;
        
        // Get enrollments
        const enrollmentsSnap = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .get();
        
        const enrolledCourses = [];
        
        for (const enrollmentDoc of enrollmentsSnap.docs) {
            const enrollment = enrollmentDoc.data();
            
            const courseDoc = await db.collection(collections.COURSES)
                .doc(enrollment.courseId)
                .get();
            
            if (courseDoc.exists) {
                const course = courseDoc.data();
                
                // Get chapter count for progress calculation
                const chaptersSnap = await db.collection(collections.CHAPTERS)
                    .where('courseId', '==', enrollment.courseId)
                    .get();
                
                const totalChapters = chaptersSnap.size;
                const completedChapters = enrollment.completedChapters?.length || 0;
                const progress = totalChapters > 0 ? 
                    Math.round((completedChapters / totalChapters) * 100) : 0;
                
                enrolledCourses.push({
                    enrollmentId: enrollmentDoc.id,
                    courseId: enrollment.courseId,
                    courseName: course.name,
                    description: course.description,
                    thumbnail: course.thumbnail,
                    enrolledAt: enrollment.enrolledAt,
                    progress: progress,
                    lastAccessed: enrollment.lastAccessed,
                    totalChapters,
                    completedChapters
                });
            }
        }
        
        // Sort by last accessed
        enrolledCourses.sort((a, b) => 
            new Date(b.lastAccessed) - new Date(a.lastAccessed)
        );
        
        // Paginate
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedResults = enrolledCourses.slice(startIndex, endIndex);
        
        res.json(formatResponse(true, {
            courses: paginatedResults,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: enrolledCourses.length,
                totalPages: Math.ceil(enrolledCourses.length / limit)
            },
            stats: {
                totalCourses: enrolledCourses.length,
                overallProgress: enrolledCourses.length > 0 ? 
                    Math.round(enrolledCourses.reduce((sum, course) => sum + course.progress, 0) / enrolledCourses.length) : 0,
                recentlyAccessed: enrolledCourses[0] || null
            }
        }));
        
    } catch (error) {
        console.error('Get enrolled courses error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch enrolled courses')
        );
    }
});

module.exports = router;

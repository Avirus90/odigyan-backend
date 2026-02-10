const express = require('express');
const router = express.Router();
const { admin, db, collections } = require('../utils/firebase');
const { formatResponse, calculateTestScore } = require('../utils/helpers');
const { verifyToken, isAuthenticated, canAccessCourse } = require('../middleware/auth');

/**
 * @route   POST /api/mocktest/start
 * @desc    Start a new mock test
 * @access  Private
 */
router.post('/start', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { courseId, testType = 'full', duration = 1800 } = req.body;
        const { uid } = req.user;
        
        if (!courseId) {
            return res.status(400).json(
                formatResponse(false, null, 'Course ID is required')
            );
        }
        
        // Check if course exists and user is enrolled
        const enrollmentQuery = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .limit(1)
            .get();
        
        if (enrollmentQuery.empty) {
            return res.status(403).json(
                formatResponse(false, null, 'Not enrolled in this course')
            );
        }
        
        // Get questions for the test
        const questions = await generateMockTestQuestions(courseId, testType);
        
        if (questions.length === 0) {
            return res.status(404).json(
                formatResponse(false, null, 'No questions available for this course')
            );
        }
        
        // Create test session
        const testSession = {
            userId: uid,
            courseId,
            testType,
            questions,
            duration: parseInt(duration),
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'in_progress',
            answers: {},
            currentQuestion: 0
        };
        
        const testRef = await db.collection('testSessions').add(testSession);
        
        res.json(formatResponse(true, {
            testId: testRef.id,
            questions,
            totalQuestions: questions.length,
            duration,
            startedAt: new Date().toISOString()
        }));
        
    } catch (error) {
        console.error('Start mock test error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to start mock test')
        );
    }
});

/**
 * @route   POST /api/mocktest/:testId/answer
 * @desc    Submit answer for a question
 * @access  Private
 */
router.post('/:testId/answer', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { testId } = req.params;
        const { questionIndex, answer } = req.body;
        const { uid } = req.user;
        
        if (questionIndex === undefined || answer === undefined) {
            return res.status(400).json(
                formatResponse(false, null, 'Question index and answer are required')
            );
        }
        
        // Get test session
        const testDoc = await db.collection('testSessions').doc(testId).get();
        
        if (!testDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Test session not found')
            );
        }
        
        const testData = testDoc.data();
        
        // Check if user owns this test
        if (testData.userId !== uid) {
            return res.status(403).json(
                formatResponse(false, null, 'Access denied')
            );
        }
        
        // Check if test is still in progress
        if (testData.status !== 'in_progress') {
            return res.status(400).json(
                formatResponse(false, null, 'Test session has ended')
            );
        }
        
        // Update answer
        const answers = testData.answers || {};
        answers[questionIndex] = parseInt(answer);
        
        await testDoc.ref.update({
            answers,
            currentQuestion: parseInt(questionIndex) + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json(formatResponse(true, {
            message: 'Answer submitted successfully',
            currentQuestion: parseInt(questionIndex) + 1
        }));
        
    } catch (error) {
        console.error('Submit answer error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to submit answer')
        );
    }
});

/**
 * @route   POST /api/mocktest/:testId/submit
 * @desc    Submit completed test
 * @access  Private
 */
router.post('/:testId/submit', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { testId } = req.params;
        const { uid } = req.user;
        
        // Get test session
        const testDoc = await db.collection('testSessions').doc(testId).get();
        
        if (!testDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Test session not found')
            );
        }
        
        const testData = testDoc.data();
        
        // Check if user owns this test
        if (testData.userId !== uid) {
            return res.status(403).json(
                formatResponse(false, null, 'Access denied')
            );
        }
        
        // Check if test is still in progress
        if (testData.status !== 'in_progress') {
            return res.status(400).json(
                formatResponse(false, null, 'Test session has already been submitted')
            );
        }
        
        // Calculate score
        const questions = testData.questions || [];
        const answers = testData.answers || {};
        
        const score = calculateTestScore(answers, questions);
        
        // Update test session
        await testDoc.ref.update({
            status: 'completed',
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            score: score.percentage,
            correct: score.correct,
            total: score.total,
            obtainedMarks: score.obtainedMarks,
            totalMarks: score.totalMarks
        });
        
        // Save to test results
        const testResultData = {
            userId: uid,
            courseId: testData.courseId,
            testSessionId: testId,
            score: score.percentage,
            correct: score.correct,
            total: score.total,
            obtainedMarks: score.obtainedMarks,
            totalMarks: score.totalMarks,
            answers,
            questions,
            testType: testData.testType,
            duration: testData.duration,
            startedAt: testData.startedAt,
            submittedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        const testResultRef = await db.collection(collections.TEST_RESULTS).add(testResultData);
        
        res.json(formatResponse(true, {
            testResultId: testResultRef.id,
            score: score.percentage,
            correct: score.correct,
            total: score.total,
            obtainedMarks: score.obtainedMarks,
            totalMarks: score.totalMarks,
            timeSpent: calculateTimeSpent(testData.startedAt)
        }));
        
    } catch (error) {
        console.error('Submit test error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to submit test')
        );
    }
});

/**
 * @route   GET /api/mocktest/:testId
 * @desc    Get test session details
 * @access  Private
 */
router.get('/:testId', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { testId } = req.params;
        const { uid } = req.user;
        
        const testDoc = await db.collection('testSessions').doc(testId).get();
        
        if (!testDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Test session not found')
            );
        }
        
        const testData = testDoc.data();
        
        // Check if user owns this test
        if (testData.userId !== uid && !req.user.isAdmin) {
            return res.status(403).json(
                formatResponse(false, null, 'Access denied')
            );
        }
        
        // Calculate remaining time
        const remainingTime = calculateRemainingTime(
            testData.startedAt.toDate(),
            testData.duration
        );
        
        res.json(formatResponse(true, {
            testId,
            ...testData,
            remainingTime,
            isExpired: remainingTime <= 0 && testData.status === 'in_progress'
        }));
        
    } catch (error) {
        console.error('Get test session error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch test session')
        );
    }
});

/**
 * @route   GET /api/mocktest/course/:courseId
 * @desc    Get available mock tests for a course
 * @access  Private
 */
router.get('/course/:courseId', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { courseId } = req.params;
        const { uid } = req.user;
        
        // Check enrollment
        const enrollmentQuery = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .limit(1)
            .get();
        
        if (enrollmentQuery.empty && !req.user.isAdmin) {
            return res.status(403).json(
                formatResponse(false, null, 'Not enrolled in this course')
            );
        }
        
        // Get mock tests for this course
        const mockTestsSnap = await db.collection('mockTests')
            .where('courseId', '==', courseId)
            .where('active', '==', true)
            .get();
        
        const mockTests = [];
        mockTestsSnap.forEach(doc => {
            mockTests.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Get previous test results for this user
        const testResultsSnap = await db.collection(collections.TEST_RESULTS)
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .orderBy('submittedAt', 'desc')
            .limit(5)
            .get();
        
        const previousResults = [];
        testResultsSnap.forEach(doc => {
            const result = doc.data();
            previousResults.push({
                id: doc.id,
                score: result.score,
                date: result.submittedAt,
                testType: result.testType || 'mock'
            });
        });
        
        res.json(formatResponse(true, {
            courseId,
            availableTests: mockTests,
            previousResults,
            stats: {
                totalTests: mockTests.length,
                testsTaken: previousResults.length,
                averageScore: previousResults.length > 0 ? 
                    Math.round(previousResults.reduce((sum, r) => sum + r.score, 0) / previousResults.length) : 0,
                bestScore: previousResults.length > 0 ? 
                    Math.max(...previousResults.map(r => r.score)) : 0
            }
        }));
        
    } catch (error) {
        console.error('Get course mock tests error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch mock tests')
        );
    }
});

/**
 * Helper function to generate mock test questions
 */
async function generateMockTestQuestions(courseId, testType) {
    try {
        // This is a simplified implementation
        // In production, you would:
        // 1. Fetch questions from Firestore
        // 2. Apply filters based on testType
        // 3. Randomize selection
        // 4. Apply difficulty levels
        
        // For now, return sample questions
        return [
            {
                text: "What is the capital of France?",
                options: ["London", "Berlin", "Paris", "Madrid"],
                answer: 2,
                explanation: "Paris is the capital of France.",
                section: "General Knowledge",
                marks: 1,
                negativeMarks: 0.25
            },
            {
                text: "Which planet is known as the Red Planet?",
                options: ["Venus", "Mars", "Jupiter", "Saturn"],
                answer: 1,
                explanation: "Mars appears red due to iron oxide on its surface.",
                section: "Science",
                marks: 1,
                negativeMarks: 0.25
            }
        ];
        
    } catch (error) {
        console.error('Generate questions error:', error);
        return [];
    }
}

/**
 * Helper function to calculate remaining time
 */
function calculateRemainingTime(startedAt, duration) {
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    return Math.max(0, duration - elapsed);
}

/**
 * Helper function to calculate time spent
 */
function calculateTimeSpent(startedAt) {
    return Math.floor((Date.now() - startedAt.toDate().getTime()) / 1000);
}

module.exports = router;

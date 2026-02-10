const express = require('express');
const router = express.Router();
const { admin, db, collections } = require('../utils/firebase');
const { formatResponse, paginate, calculateProgress } = require('../utils/helpers');
const { verifyToken, isAuthenticated, canAccessCourse, canEditCourse } = require('../middleware/auth');

/**
 * @route   GET /api/courses
 * @desc    Get all courses (public)
 * @access  Public
 */
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, category = null } = req.query;
        
        let query = db.collection(collections.COURSES)
            .where('active', '==', true);
        
        if (category) {
            query = query.where('category', '==', category);
        }
        
        const snapshot = await query.get();
        
        const courses = [];
        snapshot.forEach(doc => {
            courses.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Paginate results
        const paginated = paginate(courses, parseInt(page), parseInt(limit));
        
        res.json(formatResponse(true, paginated));
        
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch courses')
        );
    }
});

/**
 * @route   GET /api/courses/:courseId
 * @desc    Get single course details
 * @access  Public
 */
router.get('/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        
        const courseDoc = await db.collection(collections.COURSES)
            .doc(courseId)
            .get();
        
        if (!courseDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Course not found')
            );
        }
        
        const course = {
            id: courseDoc.id,
            ...courseDoc.data()
        };
        
        // Get subjects for this course
        const subjectsSnap = await db.collection(collections.SUBJECTS)
            .where('courseId', '==', courseId)
            .get();
        
        const subjects = [];
        subjectsSnap.forEach(doc => {
            subjects.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        course.subjects = subjects;
        
        // Get chapter count
        const chaptersSnap = await db.collection(collections.CHAPTERS)
            .where('courseId', '==', courseId)
            .get();
        
        course.chapterCount = chaptersSnap.size;
        
        res.json(formatResponse(true, course));
        
    } catch (error) {
        console.error('Get course error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch course')
        );
    }
});

/**
 * @route   GET /api/courses/:courseId/content
 * @desc    Get course content (videos, notes, etc.)
 * @access  Private (Enrolled students only)
 */
router.get('/:courseId/content', verifyToken, canAccessCourse, async (req, res) => {
    try {
        const { courseId } = req.params;
        const { type = 'all' } = req.query;
        
        const content = {
            videos: [],
            notes: [],
            mockTests: [],
            currentAffairs: []
        };
        
        // Get course details
        const courseDoc = await db.collection(collections.COURSES)
            .doc(courseId)
            .get();
        
        if (!courseDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Course not found')
            );
        }
        
        const course = courseDoc.data();
        
        // Get subjects and chapters
        const subjectsSnap = await db.collection(collections.SUBJECTS)
            .where('courseId', '==', courseId)
            .get();
        
        for (const subjectDoc of subjectsSnap.docs) {
            const subject = {
                id: subjectDoc.id,
                ...subjectDoc.data(),
                chapters: []
            };
            
            // Get chapters for this subject
            const chaptersSnap = await db.collection(collections.CHAPTERS)
                .where('subjectId', '==', subjectDoc.id)
                .get();
            
            for (const chapterDoc of chaptersSnap.docs) {
                const chapter = {
                    id: chapterDoc.id,
                    ...chapterDoc.data()
                };
                
                // Get files for this chapter
                const filesSnap = await db.collection(collections.FILES)
                    .where('chapterId', '==', chapterDoc.id)
                    .get();
                
                chapter.files = [];
                filesSnap.forEach(fileDoc => {
                    const file = {
                        id: fileDoc.id,
                        ...fileDoc.data()
                    };
                    
                    // Categorize files
                    if (file.type === 'video') {
                        content.videos.push(file);
                    } else if (file.type === 'pdf') {
                        content.notes.push(file);
                    }
                    
                    chapter.files.push(file);
                });
                
                subject.chapters.push(chapter);
            }
            
            // Mock tests for subject
            const mockTestsSnap = await db.collection('mockTests')
                .where('subjectId', '==', subjectDoc.id)
                .get();
            
            mockTestsSnap.forEach(doc => {
                content.mockTests.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
        }
        
        // Get current affairs for course
        const currentAffairsSnap = await db.collection(collections.CURRENT_AFFAIRS)
            .where('courseId', '==', courseId)
            .orderBy('date', 'desc')
            .limit(50)
            .get();
        
        currentAffairsSnap.forEach(doc => {
            content.currentAffairs.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Filter by type if specified
        if (type !== 'all') {
            return res.json(formatResponse(true, content[type] || []));
        }
        
        res.json(formatResponse(true, content));
        
    } catch (error) {
        console.error('Get course content error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch course content')
        );
    }
});

/**
 * @route   POST /api/courses/:courseId/enroll
 * @desc    Enroll in a course
 * @access  Private
 */
router.post('/:courseId/enroll', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { courseId } = req.params;
        const { uid } = req.user;
        
        // Check if course exists
        const courseDoc = await db.collection(collections.COURSES)
            .doc(courseId)
            .get();
        
        if (!courseDoc.exists) {
            return res.status(404).json(
                formatResponse(false, null, 'Course not found')
            );
        }
        
        // Check if already enrolled
        const enrollmentQuery = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .limit(1)
            .get();
        
        if (!enrollmentQuery.empty) {
            return res.status(400).json(
                formatResponse(false, null, 'Already enrolled in this course')
            );
        }
        
        // Create enrollment
        const enrollmentData = {
            userId: uid,
            courseId: courseId,
            enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: 0,
            lastAccessed: admin.firestore.FieldValue.serverTimestamp(),
            completedChapters: [],
            completedTests: []
        };
        
        const enrollmentRef = await db.collection(collections.ENROLLMENTS).add(enrollmentData);
        
        // Update course enrollment count
        await db.collection(collections.COURSES)
            .doc(courseId)
            .update({
                enrollmentCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        
        res.json(formatResponse(true, {
            enrollmentId: enrollmentRef.id,
            message: 'Successfully enrolled in course'
        }));
        
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to enroll in course')
        );
    }
});

/**
 * @route   GET /api/courses/:courseId/progress
 * @desc    Get course progress
 * @access  Private (Enrolled students only)
 */
router.get('/:courseId/progress', verifyToken, canAccessCourse, async (req, res) => {
    try {
        const { courseId } = req.params;
        const { uid } = req.user;
        
        // Get enrollment
        const enrollmentQuery = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .limit(1)
            .get();
        
        if (enrollmentQuery.empty) {
            return res.status(404).json(
                formatResponse(false, null, 'Enrollment not found')
            );
        }
        
        const enrollment = enrollmentQuery.docs[0].data();
        
        // Get total chapters in course
        const chaptersSnap = await db.collection(collections.CHAPTERS)
            .where('courseId', '==', courseId)
            .get();
        
        const totalChapters = chaptersSnap.size;
        const completedChapters = enrollment.completedChapters?.length || 0;
        
        // Calculate progress
        const progress = calculateProgress(completedChapters, totalChapters);
        
        res.json(formatResponse(true, {
            progress,
            completedChapters,
            totalChapters,
            lastAccessed: enrollment.lastAccessed,
            enrolledAt: enrollment.enrolledAt
        }));
        
    } catch (error) {
        console.error('Get progress error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch progress')
        );
    }
});

/**
 * @route   POST /api/courses/:courseId/progress
 * @desc    Update course progress
 * @access  Private (Enrolled students only)
 */
router.post('/:courseId/progress', verifyToken, canAccessCourse, async (req, res) => {
    try {
        const { courseId } = req.params;
        const { uid } = req.user;
        const { chapterId, completed } = req.body;
        
        // Get enrollment
        const enrollmentQuery = await db.collection(collections.ENROLLMENTS)
            .where('userId', '==', uid)
            .where('courseId', '==', courseId)
            .limit(1)
            .get();
        
        if (enrollmentQuery.empty) {
            return res.status(404).json(
                formatResponse(false, null, 'Enrollment not found')
            );
        }
        
        const enrollmentDoc = enrollmentQuery.docs[0];
        const enrollment = enrollmentDoc.data();
        
        // Update completed chapters
        let completedChapters = enrollment.completedChapters || [];
        
        if (completed && !completedChapters.includes(chapterId)) {
            completedChapters.push(chapterId);
        } else if (!completed && completedChapters.includes(chapterId)) {
            completedChapters = completedChapters.filter(id => id !== chapterId);
        }
        
        // Get total chapters
        const chaptersSnap = await db.collection(collections.CHAPTERS)
            .where('courseId', '==', courseId)
            .get();
        
        const totalChapters = chaptersSnap.size;
        const progress = calculateProgress(completedChapters.length, totalChapters);
        
        // Update enrollment
        await enrollmentDoc.ref.update({
            completedChapters,
            progress,
            lastAccessed: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json(formatResponse(true, {
            progress,
            completedChapters: completedChapters.length,
            totalChapters
        }));
        
    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to update progress')
        );
    }
});

/**
 * @route   GET /api/courses/:courseId/enrolled-students
 * @desc    Get enrolled students (for teachers/admins)
 * @access  Private (Teachers/Admins only)
 */
router.get('/:courseId/enrolled-students', verifyToken, canEditCourse, async (req, res) => {
    try {
        const { courseId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        // Get enrollments
        const enrollmentsSnap = await db.collection(collections.ENROLLMENTS)
            .where('courseId', '==', courseId)
            .get();
        
        const students = [];
        
        for (const enrollmentDoc of enrollmentsSnap.docs) {
            const enrollment = enrollmentDoc.data();
            
            // Get student details
            const studentDoc = await db.collection(collections.STUDENTS)
                .doc(enrollment.userId)
                .get();
            
            if (studentDoc.exists) {
                const student = studentDoc.data();
                
                students.push({
                    userId: enrollment.userId,
                    name: student.fullName || student.email?.split('@')[0],
                    email: student.email,
                    enrolledAt: enrollment.enrolledAt,
                    progress: enrollment.progress || 0,
                    lastAccessed: enrollment.lastAccessed
                });
            }
        }
        
        // Paginate
        const paginated = paginate(students, parseInt(page), parseInt(limit));
        
        res.json(formatResponse(true, paginated));
        
    } catch (error) {
        console.error('Get enrolled students error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch enrolled students')
        );
    }
});

module.exports = router;

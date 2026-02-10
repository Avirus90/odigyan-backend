const express = require('express');
const router = express.Router();
const TelegramService = require('../utils/telegram');
const { formatResponse } = require('../utils/helpers');
const { verifyToken, isAuthenticated } = require('../middleware/auth');

/**
 * @route   GET /api/telegram/files
 * @desc    Get files from Telegram channel
 * @access  Private
 */
router.get('/files', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { courseId, type = 'all' } = req.query;
        
        const files = await TelegramService.getChannelFiles(courseId, type);
        
        res.json(formatResponse(true, files));
        
    } catch (error) {
        console.error('Get Telegram files error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch files from Telegram')
        );
    }
});

/**
 * @route   GET /api/telegram/mocktest
 * @desc    Get mock test from Telegram
 * @access  Private
 */
router.get('/mocktest', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { courseId } = req.query;
        
        const files = await TelegramService.getChannelFiles(courseId, 'mocktest');
        
        if (!files.mockTests || files.mockTests.length === 0) {
            return res.status(404).json(
                formatResponse(false, null, 'No mock tests found')
            );
        }
        
        // Parse the first mock test
        const mockTestContent = files.mockTests[0].content;
        const questions = TelegramService.parseMockTest(mockTestContent);
        
        res.json(formatResponse(true, {
            questions,
            totalQuestions: questions.length,
            source: 'Telegram Channel',
            parsedAt: new Date().toISOString()
        }));
        
    } catch (error) {
        console.error('Get mock test error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch mock test')
        );
    }
});

/**
 * @route   GET /api/telegram/current-affairs
 * @desc    Get current affairs from Telegram
 * @access  Private
 */
router.get('/current-affairs', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { courseId, period = 'daily', limit = 20 } = req.query;
        
        const files = await TelegramService.getChannelFiles(courseId, 'currentAffairs');
        
        let currentAffairs = files.currentAffairs || [];
        
        // Filter by period if specified
        if (period !== 'all') {
            currentAffairs = currentAffairs.filter(ca => {
                const caption = (ca.caption || '').toLowerCase();
                return caption.includes(period);
            });
        }
        
        // Sort by date (newest first)
        currentAffairs.sort((a, b) => b.date - a.date);
        
        // Limit results
        currentAffairs = currentAffairs.slice(0, parseInt(limit));
        
        res.json(formatResponse(true, {
            currentAffairs,
            total: currentAffairs.length,
            period
        }));
        
    } catch (error) {
        console.error('Get current affairs error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to fetch current affairs')
        );
    }
});

/**
 * @route   GET /api/telegram/file/:fileId
 * @desc    Get file URL from Telegram
 * @access  Private
 */
router.get('/file/:fileId', verifyToken, isAuthenticated, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        const fileURL = await TelegramService.getFileDirectURL(fileId);
        
        if (!fileURL) {
            return res.status(404).json(
                formatResponse(false, null, 'File not found')
            );
        }
        
        res.json(formatResponse(true, {
            fileURL,
            fileId,
            expiresIn: '1 hour'
        }));
        
    } catch (error) {
        console.error('Get file URL error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to get file URL')
        );
    }
});

/**
 * @route   POST /api/telegram/send-notification
 * @desc    Send notification to Telegram channel (admin only)
 * @access  Private (Admin only)
 */
router.post('/send-notification', verifyToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.isAdmin) {
            return res.status(403).json(
                formatResponse(false, null, 'Admin access required')
            );
        }
        
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json(
                formatResponse(false, null, 'Message is required')
            );
        }
        
        const success = await TelegramService.sendMessage(message);
        
        if (success) {
            res.json(formatResponse(true, {
                message: 'Notification sent successfully'
            }));
        } else {
            throw new Error('Failed to send notification');
        }
        
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json(
            formatResponse(false, null, 'Failed to send notification')
        );
    }
});

module.exports = router;

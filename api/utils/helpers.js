const moment = require('moment');

/**
 * Format response structure
 */
const formatResponse = (success, data = null, error = null, meta = null) => {
    return {
        success,
        data,
        error,
        meta,
        timestamp: new Date().toISOString()
    };
};

/**
 * Validate email
 */
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate phone number (Indian format)
 */
const isValidPhone = (phone) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
};

/**
 * Sanitize input data
 */
const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input
            .trim()
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[<>"'`;]/g, ''); // Remove dangerous characters
    }
    return input;
};

/**
 * Generate random ID
 */
const generateId = (prefix = '') => {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Format date
 */
const formatDate = (date, format = 'DD/MM/YYYY') => {
    return moment(date).format(format);
};

/**
 * Calculate time difference
 */
const timeAgo = (date) => {
    const now = moment();
    const then = moment(date);
    const diff = now.diff(then);
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
};

/**
 * Paginate array
 */
const paginate = (array, page = 1, limit = 10) => {
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const results = array.slice(startIndex, endIndex);
    
    return {
        data: results,
        page: parseInt(page),
        limit: parseInt(limit),
        total: array.length,
        totalPages: Math.ceil(array.length / limit),
        hasNext: endIndex < array.length,
        hasPrev: startIndex > 0
    };
};

/**
 * Validate file type
 */
const validateFileType = (file, allowedTypes) => {
    const types = allowedTypes.split(',');
    return types.includes(file.mimetype);
};

/**
 * Validate file size
 */
const validateFileSize = (file, maxSize) => {
    return file.size <= maxSize;
};

/**
 * Generate progress percentage
 */
const calculateProgress = (completed, total) => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
};

/**
 * Calculate test score
 */
const calculateTestScore = (answers, questions) => {
    let correct = 0;
    let totalMarks = 0;
    let obtainedMarks = 0;
    
    questions.forEach((question, index) => {
        totalMarks += question.marks || 1;
        
        if (answers[index] !== undefined) {
            if (answers[index] === question.answer) {
                correct++;
                obtainedMarks += question.marks || 1;
            } else if (question.negativeMarks) {
                obtainedMarks -= question.negativeMarks;
            }
        }
    });
    
    // Ensure score doesn't go below 0
    obtainedMarks = Math.max(0, obtainedMarks);
    
    const percentage = Math.round((obtainedMarks / totalMarks) * 100);
    
    return {
        correct,
        total: questions.length,
        totalMarks,
        obtainedMarks,
        percentage,
        wrong: questions.length - correct
    };
};

module.exports = {
    formatResponse,
    isValidEmail,
    isValidPhone,
    sanitizeInput,
    generateId,
    formatDate,
    timeAgo,
    paginate,
    validateFileType,
    validateFileSize,
    calculateProgress,
    calculateTestScore
};

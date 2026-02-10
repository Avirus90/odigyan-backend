const { formatResponse } = require('../utils/helpers');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params
    });
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json(
            formatResponse(false, null, err.message)
        );
    }
    
    if (err.code === 'auth/id-token-expired') {
        return res.status(401).json(
            formatResponse(false, null, 'Authentication token expired')
        );
    }
    
    if (err.code === 'auth/invalid-id-token') {
        return res.status(401).json(
            formatResponse(false, null, 'Invalid authentication token')
        );
    }
    
    if (err.code === 'permission-denied') {
        return res.status(403).json(
            formatResponse(false, null, 'Permission denied')
        );
    }
    
    if (err.code === 'not-found') {
        return res.status(404).json(
            formatResponse(false, null, err.message || 'Resource not found')
        );
    }
    
    // Default error
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message;
    
    res.status(statusCode).json(
        formatResponse(false, null, message)
    );
};

module.exports = {
    errorHandler
};

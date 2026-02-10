const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

class TelegramService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.channelId = process.env.TELEGRAM_CHANNEL_ID;
        this.baseURL = `https://api.telegram.org/bot${this.botToken}`;
        
        // Initialize bot for polling (if needed)
        this.bot = new TelegramBot(this.botToken, { polling: false });
        
        // File cache
        this.fileCache = new Map();
        this.cacheExpiry = 3600000; // 1 hour
    }
    
    /**
     * Get files from Telegram channel
     */
    async getChannelFiles(courseId = null, fileType = null) {
        try {
            // In production, you would fetch actual files from channel
            // For now, return structured data
            
            const files = {
                videos: [],
                pdfs: [],
                mockTests: [],
                currentAffairs: []
            };
            
            // Simulate fetching from Telegram
            const response = await axios.get(`${this.baseURL}/getUpdates`);
            
            if (response.data.ok) {
                const updates = response.data.result;
                
                for (const update of updates) {
                    if (update.channel_post) {
                        const fileData = this.parseTelegramMessage(update.channel_post);
                        if (fileData) {
                            this.categorizeFile(files, fileData, courseId, fileType);
                        }
                    }
                }
            }
            
            return files;
            
        } catch (error) {
            console.error('Error fetching Telegram files:', error.message);
            throw new Error('Failed to fetch files from Telegram');
        }
    }
    
    /**
     * Parse Telegram message to extract file information
     */
    parseTelegramMessage(message) {
        try {
            const fileData = {
                messageId: message.message_id,
                date: new Date(message.date * 1000),
                caption: message.caption || '',
                text: message.text || ''
            };
            
            // Check for documents (PDFs)
            if (message.document) {
                fileData.type = 'document';
                fileData.fileId = message.document.file_id;
                fileData.fileName = message.document.file_name || 'document.pdf';
                fileData.fileSize = message.document.file_size;
                fileData.mimeType = message.document.mime_type;
            }
            
            // Check for videos
            else if (message.video) {
                fileData.type = 'video';
                fileData.fileId = message.video.file_id;
                fileData.fileName = message.video.file_name || 'video.mp4';
                fileData.fileSize = message.video.file_size;
                fileData.duration = message.video.duration;
                fileData.width = message.video.width;
                fileData.height = message.video.height;
            }
            
            // Check for text (Mock tests, Current Affairs)
            else if (message.text) {
                if (this.isMockTestFormat(message.text)) {
                    fileData.type = 'mocktest';
                    fileData.content = message.text;
                } else if (this.isCurrentAffairs(message)) {
                    fileData.type = 'currentAffairs';
                    fileData.content = message.text;
                } else {
                    return null;
                }
            }
            
            // Check for photo (for banners)
            else if (message.photo && message.photo.length > 0) {
                fileData.type = 'photo';
                fileData.fileId = message.photo[message.photo.length - 1].file_id;
                fileData.fileSize = message.photo[message.photo.length - 1].file_size;
            }
            
            else {
                return null;
            }
            
            return fileData;
            
        } catch (error) {
            console.error('Error parsing Telegram message:', error);
            return null;
        }
    }
    
    /**
     * Categorize file based on type and content
     */
    categorizeFile(files, fileData, courseId, fileType) {
        if (fileType && fileData.type !== fileType) return;
        
        // Filter by course if specified
        if (courseId && !this.isForCourse(fileData, courseId)) return;
        
        switch (fileData.type) {
            case 'video':
                files.videos.push(fileData);
                break;
                
            case 'document':
                if (fileData.mimeType === 'application/pdf') {
                    files.pdfs.push(fileData);
                }
                break;
                
            case 'mocktest':
                files.mockTests.push(fileData);
                break;
                
            case 'currentAffairs':
                files.currentAffairs.push(fileData);
                break;
                
            case 'photo':
                // Could be used for banners
                break;
        }
    }
    
    /**
     * Check if file is for specific course
     */
    isForCourse(fileData, courseId) {
        const caption = fileData.caption.toLowerCase();
        const text = fileData.text.toLowerCase();
        
        // Implement logic to match course identifiers
        // This could be based on hashtags or specific patterns
        return caption.includes(`#course${courseId}`) || 
               text.includes(`#course${courseId}`);
    }
    
    /**
     * Check if text is in mock test format
     */
    isMockTestFormat(text) {
        const lines = text.split('\n');
        let hasQuestion = false;
        let hasOptions = false;
        
        for (const line of lines) {
            if (line.startsWith('|Q|')) hasQuestion = true;
            if (line.startsWith('|A|') || line.startsWith('|B|') || 
                line.startsWith('|C|') || line.startsWith('|D|')) hasOptions = true;
        }
        
        return hasQuestion && hasOptions;
    }
    
    /**
     * Check if message is current affairs
     */
    isCurrentAffairs(message) {
        const caption = (message.caption || '').toLowerCase();
        const text = (message.text || '').toLowerCase();
        
        return caption.includes('current affairs') || 
               caption.includes('daily') ||
               caption.includes('weekly') ||
               caption.includes('monthly') ||
               text.includes('current affairs');
    }
    
    /**
     * Parse mock test from text format
     */
    parseMockTest(text) {
        try {
            const questions = [];
            const sections = text.split('---\n').filter(s => s.trim());
            
            let currentSection = '';
            
            for (const section of sections) {
                const lines = section.trim().split('\n');
                let question = null;
                
                for (const line of lines) {
                    if (line.startsWith('|SECTION|')) {
                        currentSection = line.replace('|SECTION|', '').trim();
                    } else if (line.startsWith('|Q|')) {
                        if (question) questions.push(question);
                        question = {
                            section: currentSection,
                            text: line.replace('|Q|', '').trim(),
                            options: [],
                            answer: null,
                            explanation: '',
                            marks: 1,
                            negativeMarks: 0.25
                        };
                    } else if (line.startsWith('|A|')) {
                        if (question) question.options[0] = line.replace('|A|', '').trim();
                    } else if (line.startsWith('|B|')) {
                        if (question) question.options[1] = line.replace('|B|', '').trim();
                    } else if (line.startsWith('|C|')) {
                        if (question) question.options[2] = line.replace('|C|', '').trim();
                    } else if (line.startsWith('|D|')) {
                        if (question) question.options[3] = line.replace('|D|', '').trim();
                    } else if (line.startsWith('|ANS|')) {
                        if (question) {
                            const ans = line.replace('|ANS|', '').trim().toUpperCase();
                            question.answer = ['A', 'B', 'C', 'D'].indexOf(ans);
                        }
                    } else if (line.startsWith('|EXP|')) {
                        if (question) question.explanation = line.replace('|EXP|', '').trim();
                    } else if (line.startsWith('|MARKS|')) {
                        if (question) question.marks = parseFloat(line.replace('|MARKS|', '').trim()) || 1;
                    } else if (line.startsWith('|NEGATIVE|')) {
                        if (question) question.negativeMarks = parseFloat(line.replace('|NEGATIVE|', '').trim()) || 0.25;
                    }
                }
                
                if (question) questions.push(question);
            }
            
            return questions;
            
        } catch (error) {
            console.error('Error parsing mock test:', error);
            throw new Error('Invalid mock test format');
        }
    }
    
    /**
     * Get direct file URL from Telegram
     */
    async getFileDirectURL(fileId) {
        try {
            // Check cache first
            const cached = this.fileCache.get(fileId);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.url;
            }
            
            // Get file path from Telegram
            const response = await axios.get(`${this.baseURL}/getFile?file_id=${fileId}`);
            
            if (response.data.ok) {
                const filePath = response.data.result.file_path;
                const fileURL = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
                
                // Cache the URL
                this.fileCache.set(fileId, {
                    url: fileURL,
                    timestamp: Date.now()
                });
                
                return fileURL;
            }
            
            return null;
            
        } catch (error) {
            console.error('Error getting file URL:', error.message);
            return null;
        }
    }
    
    /**
     * Send message to Telegram channel (for admin notifications)
     */
    async sendMessage(message) {
        try {
            const response = await axios.post(`${this.baseURL}/sendMessage`, {
                chat_id: this.channelId,
                text: message,
                parse_mode: 'HTML'
            });
            
            return response.data.ok;
            
        } catch (error) {
            console.error('Error sending Telegram message:', error);
            return false;
        }
    }
    
    /**
     * Get file as buffer (for streaming)
     */
    async getFileBuffer(fileId) {
        try {
            const fileURL = await this.getFileDirectURL(fileId);
            if (!fileURL) return null;
            
            const response = await axios.get(fileURL, {
                responseType: 'arraybuffer'
            });
            
            return {
                buffer: Buffer.from(response.data),
                contentType: response.headers['content-type']
            };
            
        } catch (error) {
            console.error('Error getting file buffer:', error);
            return null;
        }
    }
}

// Export singleton instance
module.exports = new TelegramService();

const admin = require('firebase-admin');
const TelegramBot = require('node-telegram-bot-api');

// Initialize Firebase Admin
const serviceAccount = {
  "type": "service_account",
  "project_id": "odigyan-56dc4",
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

const db = admin.firestore();

// Parse questions from Telegram TXT file format
function parseQuestionsFromText(text) {
  const questions = [];
  const questionBlocks = text.split('---').filter(block => block.trim());
  
  questionBlocks.forEach((block, index) => {
    const lines = block.trim().split('\n').filter(line => line.trim());
    const question = {
      id: index + 1,
      question: '',
      options: {},
      correctAnswer: '',
      explanation: '',
      marks: 1
    };
    
    lines.forEach(line => {
      if (line.startsWith('|Q|')) {
        question.question = line.substring(3).trim();
      } else if (line.startsWith('|A|')) {
        question.options.A = line.substring(3).trim();
      } else if (line.startsWith('|B|')) {
        question.options.B = line.substring(3).trim();
      } else if (line.startsWith('|C|')) {
        question.options.C = line.substring(3).trim();
      } else if (line.startsWith('|D|')) {
        question.options.D = line.substring(3).trim();
      } else if (line.startsWith('|ANS|')) {
        question.correctAnswer = line.substring(5).trim();
      } else if (line.startsWith('|EXP|')) {
        question.explanation = line.substring(5).trim();
      }
    });
    
    // Only add if we have a valid question
    if (question.question && Object.keys(question.options).length >= 2) {
      questions.push(question);
    }
  });
  
  return questions;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const mockTestsRef = db.collection('mockTests');
    const testResultsRef = db.collection('testResults');

    // GET mock tests or questions
    if (req.method === 'GET') {
      const { id, courseId, getQuestions = false, limit = 20 } = req.query;

      // Get specific test with questions
      if (id && getQuestions === 'true') {
        const testDoc = await mockTestsRef.doc(id).get();
        
        if (!testDoc.exists) {
          return res.status(404).json({
            success: false,
            error: 'Mock test not found'
          });
        }

        const testData = testDoc.data();
        
        // Try to fetch questions from Telegram
        if (testData.questionsFileId) {
          try {
            // Get file from Telegram
            const file = await bot.getFile(testData.questionsFileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
            
            // Fetch file content
            const response = await fetch(fileUrl);
            const text = await response.text();
            
            // Parse questions
            const questions = parseQuestionsFromText(text);
            
            return res.status(200).json({
              success: true,
              test: testData,
              questions: questions,
              count: questions.length
            });
          } catch (error) {
            console.error('Error fetching questions:', error);
            // Return test without questions if file fetch fails
            return res.status(200).json({
              success: true,
              test: testData,
              questions: [],
              count: 0
            });
          }
        } else {
          // Return test with embedded questions if available
          return res.status(200).json({
            success: true,
            test: testData,
            questions: testData.questions || [],
            count: testData.questions ? testData.questions.length : 0
          });
        }
      }

      // Get list of mock tests
      let query = mockTestsRef.orderBy('createdAt', 'desc');

      if (courseId) {
        query = query.where('courseId', '==', courseId);
      }

      query = query.limit(parseInt(limit));

      const snapshot = await query.get();
      const mockTests = [];
      
      snapshot.forEach(doc => {
        mockTests.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.status(200).json({
        success: true,
        data: mockTests,
        count: mockTests.length
      });
    }

    // POST create new mock test
    if (req.method === 'POST') {
      const testData = req.body;
      
      if (!testData.name || !testData.courseId) {
        return res.status(400).json({
          success: false,
          error: 'Test name and course ID are required'
        });
      }

      const newTest = {
        name: testData.name,
        description: testData.description || '',
        courseId: testData.courseId,
        courseName: testData.courseName || '',
        duration: testData.duration || 60, // in minutes
        totalMarks: testData.totalMarks || 100,
        passingMarks: testData.passingMarks || 40,
        minusMarking: testData.minusMarking !== undefined ? testData.minusMarking : true,
        minusPerWrong: testData.minusPerWrong || 0.25,
        marksPerCorrect: testData.marksPerCorrect || 1,
        timerPerQuestion: testData.timerPerQuestion || false,
        questionsCount: testData.questionsCount || 0,
        questionsFileId: testData.questionsFileId || '', // Telegram file ID
        sections: testData.sections || [],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await mockTestsRef.add(newTest);

      return res.status(201).json({
        success: true,
        message: 'Mock test created successfully',
        id: docRef.id,
        data: newTest
      });
    }

    // PUT update mock test
    if (req.method === 'PUT') {
      const { id } = req.query;
      const testData = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Test ID is required'
        });
      }

      const testRef = mockTestsRef.doc(id);
      const testDoc = await testRef.get();

      if (!testDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Mock test not found'
        });
      }

      await testRef.update({
        ...testData,
        updatedAt: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Mock test updated successfully'
      });
    }

    // DELETE mock test
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Test ID is required'
        });
      }

      const testRef = mockTestsRef.doc(id);
      const testDoc = await testRef.get();

      if (!testDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Mock test not found'
        });
      }

      await testRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Mock test deleted successfully'
      });
    }

    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};

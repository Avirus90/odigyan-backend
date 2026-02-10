const TelegramBot = require('node-telegram-bot-api');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

// Parse the custom TXT format
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
      section: 'General',
      marks: 1,
      difficulty: 'medium'
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
        question.correctAnswer = line.substring(5).trim().toUpperCase();
      } else if (line.startsWith('|EXP|')) {
        question.explanation = line.substring(5).trim();
      } else if (line.startsWith('|SECTION|')) {
        question.section = line.substring(9).trim();
      } else if (line.startsWith('|MARKS|')) {
        question.marks = parseFloat(line.substring(7).trim()) || 1;
      } else if (line.startsWith('|DIFFICULTY|')) {
        question.difficulty = line.substring(12).trim().toLowerCase();
      }
    });
    
    // Validate question
    if (question.question && 
        Object.keys(question.options).length >= 2 && 
        question.correctAnswer && 
        ['A', 'B', 'C', 'D'].includes(question.correctAnswer)) {
      questions.push(question);
    }
  });
  
  return questions;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET questions from Telegram file
    if (req.method === 'GET') {
      const { fileId, limit = 10, courseId, section } = req.query;
      
      let questions = [];

      if (fileId) {
        try {
          // Get file from Telegram
          const file = await bot.getFile(fileId);
          const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
          
          // Fetch file content
          const response = await fetch(fileUrl);
          const text = await response.text();
          
          // Parse questions
          questions = parseQuestionsFromText(text);
          
          // Apply filters
          if (section) {
            questions = questions.filter(q => q.section === section);
          }
          
          if (limit) {
            questions = questions.slice(0, parseInt(limit));
          }
          
        } catch (error) {
          console.error('Error fetching questions file:', error);
          // Return sample questions if file fetch fails
          questions = generateSampleQuestions(parseInt(limit));
        }
      } else {
        // Return sample questions if no file ID provided
        questions = generateSampleQuestions(parseInt(limit));
      }

      return res.status(200).json({
        success: true,
        data: questions,
        count: questions.length,
        courseId: courseId || 'general'
      });
    }

    // POST validate or create questions
    if (req.method === 'POST') {
      const { action, questions, fileId } = req.body;

      if (action === 'validate') {
        if (!questions) {
          return res.status(400).json({
            success: false,
            error: 'Questions data is required'
          });
        }

        const validationResults = questions.map((q, index) => {
          const errors = [];
          
          if (!q.question) errors.push('Question text is required');
          if (!q.options || Object.keys(q.options).length < 2) errors.push('At least 2 options are required');
          if (!q.correctAnswer) errors.push('Correct answer is required');
          if (q.correctAnswer && !['A', 'B', 'C', 'D'].includes(q.correctAnswer.toUpperCase())) {
            errors.push('Correct answer must be A, B, C, or D');
          }
          
          return {
            index: index + 1,
            isValid: errors.length === 0,
            errors: errors
          };
        });

        const isValid = validationResults.every(r => r.isValid);

        return res.status(200).json({
          success: true,
          isValid: isValid,
          results: validationResults
        });
      }

      if (action === 'upload') {
        if (!fileId) {
          return res.status(400).json({
            success: false,
            error: 'File ID is required'
          });
        }

        try {
          // Get file from Telegram
          const file = await bot.getFile(fileId);
          const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
          
          // Fetch and parse file
          const response = await fetch(fileUrl);
          const text = await response.text();
          const questions = parseQuestionsFromText(text);

          return res.status(200).json({
            success: true,
            message: 'Questions parsed successfully',
            count: questions.length,
            questions: questions
          });
        } catch (error) {
          return res.status(400).json({
            success: false,
            error: 'Failed to parse questions file'
          });
        }
      }

      return res.status(400).json({
        success: false,
        error: 'Invalid action'
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

// Helper function to generate sample questions
function generateSampleQuestions(count) {
  const questions = [];
  const subjects = ['Mathematics', 'Reasoning', 'English', 'General Knowledge'];
  const sections = ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability', 'General Awareness'];
  
  for (let i = 0; i < count; i++) {
    const subjectIndex = i % subjects.length;
    questions.push({
      id: i + 1,
      question: `Sample question ${i + 1} from ${subjects[subjectIndex]}?`,
      options: {
        A: `Option A for question ${i + 1}`,
        B: `Option B for question ${i + 1}`,
        C: `Option C for question ${i + 1}`,
        D: `Option D for question ${i + 1}`
      },
      correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
      explanation: `This is the explanation for question ${i + 1}. The correct answer is ${['A', 'B', 'C', 'D'][i % 4]} because...`,
      section: sections[subjectIndex],
      marks: 1,
      difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
      subject: subjects[subjectIndex]
    });
  }
  
  return questions;
}

const TelegramBot = require('node-telegram-bot-api');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { courseId, limit = 10 } = req.query;

      // Get questions from Telegram channel
      // This is a simplified version. In production, you would:
      // 1. Get the questions file from your Telegram channel
      // 2. Parse the TXT file
      // 3. Return structured questions

      // For now, return sample questions
      const sampleQuestions = generateSampleQuestions(parseInt(limit));

      return res.status(200).json({
        questions: sampleQuestions,
        count: sampleQuestions.length,
        courseId: courseId || 'general'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function generateSampleQuestions(count) {
  const questions = [];
  const subjects = ['Mathematics', 'Reasoning', 'English', 'General Knowledge'];
  
  for (let i = 0; i < count; i++) {
    const subject = subjects[i % subjects.length];
    questions.push({
      id: i + 1,
      question: `Sample question ${i + 1} from ${subject}?`,
      options: {
        A: `Option A for question ${i + 1}`,
        B: `Option B for question ${i + 1}`,
        C: `Option C for question ${i + 1}`,
        D: `Option D for question ${i + 1}`
      },
      correctAnswer: ['A', 'B', 'C', 'D'][i % 4],
      explanation: `This is the explanation for question ${i + 1}. The correct answer is ${['A', 'B', 'C', 'D'][i % 4]} because...`,
      subject: subject,
      marks: 1
    });
  }
  
  return questions;
}

const TelegramBot = require('node-telegram-bot-api');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET channel info or files
    if (req.method === 'GET') {
      const { action, fileId, channelId = '-1003710322105' } = req.query;

      if (action === 'getChannelInfo') {
        try {
          const chat = await bot.getChat(channelId);
          const membersCount = await bot.getChatMembersCount(channelId);
          
          return res.status(200).json({
            success: true,
            data: {
              id: chat.id,
              title: chat.title,
              description: chat.description,
              membersCount: membersCount,
              username: chat.username,
              inviteLink: chat.invite_link
            }
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: 'Failed to get channel info'
          });
        }
      }

      if (action === 'getFile' && fileId) {
        try {
          const file = await bot.getFile(fileId);
          const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
          
          return res.status(200).json({
            success: true,
            data: {
              fileId: file.file_id,
              fileUniqueId: file.file_unique_id,
              fileSize: file.file_size,
              filePath: file.file_path,
              fileUrl: fileUrl
            }
          });
        } catch (error) {
          return res.status(404).json({
            success: false,
            error: 'File not found'
          });
        }
      }

      if (action === 'getChannelFiles') {
        try {
          // Note: Telegram Bot API doesn't directly support listing channel files
          // You'll need to store file IDs in your database when files are uploaded
          return res.status(200).json({
            success: true,
            data: [],
            message: 'File list would be retrieved from database'
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: 'Failed to get channel files'
          });
        }
      }

      return res.status(400).json({
        success: false,
        error: 'Invalid action or missing parameters'
      });
    }

    // POST send message or file to channel
    if (req.method === 'POST') {
      const { action, message, fileId, caption } = req.body;

      if (action === 'sendMessage') {
        if (!message) {
          return res.status(400).json({
            success: false,
            error: 'Message is required'
          });
        }

        try {
          const result = await bot.sendMessage('-1003710322105', message, {
            parse_mode: 'HTML'
          });

          return res.status(200).json({
            success: true,
            message: 'Message sent successfully',
            messageId: result.message_id
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: 'Failed to send message'
          });
        }
      }

      if (action === 'sendFile') {
        if (!fileId) {
          return res.status(400).json({
            success: false,
            error: 'File ID is required'
          });
        }

        try {
          // Forward file from your private channel to bot's storage
          const result = await bot.forwardMessage(
            '-1003710322105',
            '-1003710322105', // Same channel (forward to itself to get file ID)
            parseInt(fileId)
          );

          return res.status(200).json({
            success: true,
            message: 'File sent successfully',
            fileId: result.message_id
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: 'Failed to send file'
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

# Odigyan Backend API

Backend API for Odigyan EdTech Platform built with Node.js, Express, Firebase, and deployed on Vercel.

## Features
- RESTful API with proper error handling
- Firebase Authentication & Firestore integration
- Telegram channel integration for file management
- Admin dashboard with analytics
- Student enrollment and progress tracking
- Mock test system with scoring
- File upload and management
- Rate limiting and security headers

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth
- **File Storage:** Telegram Channel + Firebase Storage
- **Deployment:** Vercel

## API Endpoints

### Authentication
- `POST /api/auth/verify` - Verify authentication token
- `GET /api/auth/user/:uid` - Get user information
- `POST /api/auth/update-profile` - Update user profile

### Courses
- `GET /api/courses` - Get all courses
- `GET /api/courses/:courseId` - Get course details
- `POST /api/courses/:courseId/enroll` - Enroll in course
- `GET /api/courses/:courseId/content` - Get course content

### Students
- `POST /api/students/register` - Register student profile
- `GET /api/students/profile` - Get student profile
- `POST /api/students/test-result` - Save test result
- `GET /api/students/test-results` - Get student's test results

### Admin
- `GET /api/admin/dashboard` - Get admin dashboard stats
- `GET /api/admin/students` - Get all students
- `POST /api/admin/courses` - Create new course
- `POST /api/admin/banners` - Create banner

### Telegram Integration
- `GET /api/telegram/files` - Get files from Telegram
- `GET /api/telegram/mocktest` - Get mock test from Telegram
- `GET /api/telegram/current-affairs` - Get current affairs

### Mock Tests
- `POST /api/mocktest/start` - Start new mock test
- `POST /api/mocktest/:testId/answer` - Submit answer
- `POST /api/mocktest/:testId/submit` - Submit completed test

## Environment Variables

Create a `.env` file with:

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-frontend-url.com

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY=your-private-key

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHANNEL_ID=your-channel-id

# Admin
ADMIN_EMAIL=admin@example.com

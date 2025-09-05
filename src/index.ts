import { initializeDatabase } from '@/database/init';
import authRoutes from '@/routes/auth.routes';
import studentRoutes from '@/routes/student';
import academicYearRoutes from '@/routes/super_admin/academic-year.routes';
import gradeRoutes from '@/routes/super_admin/grade.routes';
import subscriptionPackageRoutes from '@/routes/super_admin/subscription-package.routes';
import teacherSearchRoutes from '@/routes/teacher-search.routes';
import teacherCourseBookingRoutes from '@/routes/teacher/course-booking.routes';
import courseRoutes from '@/routes/teacher/course.routes';
import subjectRoutes from '@/routes/teacher/subject.routes';
import { getMessage } from '@/utils/messages';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: process.env['NODE_ENV'] === 'production'
    ? ['https://yourdomain.com'] // Replace with your frontend domain
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'), // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: getMessage('SERVER.TOO_MANY_REQUESTS'),
    errors: [getMessage('SERVER.TRY_AGAIN_LATER')]
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env['NODE_ENV'] === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: getMessage('SERVER.SERVER_RUNNING'),
    timestamp: new Date().toISOString(),
    environment: process.env['NODE_ENV'] || 'development'
  });
});

// Serve static files
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/teacher-search', teacherSearchRoutes);
app.use('/api/subscription-packages', subscriptionPackageRoutes);
app.use('/api/teacher/bookings', teacherCourseBookingRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: getMessage('SERVER.ROUTE_NOT_FOUND'),
    errors: [`Cannot ${req.method} ${req.originalUrl}`]
  });
});

// Global error handler
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Global error handler:', error);

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: getMessage('VALIDATION.VALIDATION_FAILED'),
      errors: [error.message]
    });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: getMessage('AUTH.UNAUTHORIZED'),
      errors: [getMessage('AUTH.INVALID_TOKEN')]
    });
  }

  // Default error response
  return res.status(500).json({
    success: false,
    message: getMessage('SERVER.INTERNAL_ERROR'),
    errors: process.env['NODE_ENV'] === 'development' ? [error.message] : [getMessage('SERVER.SOMETHING_WENT_WRONG')]
  });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log(getMessage('DATABASE.INITIALIZATION_STARTED'));
    await initializeDatabase();
    console.log(getMessage('SERVER.DATABASE_INITIALIZED'));

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env['NODE_ENV'] || 'development'}`);
      console.log(`⏰ Timezone: ${process.env['TZ'] || 'UTC'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error(getMessage('SERVER.DATABASE_INIT_FAILED'), error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;

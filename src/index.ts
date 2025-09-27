import { initializeDatabase } from '@/database/init';
import authRoutes from '@/routes/auth.routes';
import notificationRoutes from '@/routes/notification.routes';
import studentRoutes from '@/routes/student';
import academicYearRoutes from '@/routes/super_admin/academic-year.routes';
import gradeRoutes from '@/routes/super_admin/grade.routes';
import newsRoutes from '@/routes/super_admin/news.routes';
import subscriptionPackageRoutes from '@/routes/super_admin/subscription-package.routes';
import teacherRoutes from '@/routes/teacher';
import teacherSearchRoutes from '@/routes/teacher-search.routes';
import courseRoutes from '@/routes/teacher/course.routes';
import subjectRoutes from '@/routes/teacher/subject.routes';
import userOnesignalRoutes from '@/routes/user-onesignal.routes';
import { notificationCronService } from '@/services/notification-cron.service';
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
const PORT: number = parseInt(process.env['PORT'] || '3000', 10);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration
app.use(cors({
  origin: process.env['NODE_ENV'] === 'production'
    ? ['https://yourdomain.com'] // Replace with your frontend domain
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'],
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
    message: 'عدد الطلبات كبير جداً',
    errors: ['حاول مرة أخرى لاحقاً']
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
    message: 'الخادم يعمل بنجاح',
    timestamp: new Date().toISOString(),
    environment: process.env['NODE_ENV'] || 'development'
  });
});

// Serve static files with CORS
app.use('/public', cors({
  origin: true,
  credentials: false,
  methods: ['GET'],
  allowedHeaders: ['Content-Type']
}), express.static(path.join(__dirname, '../public')));

app.use('/uploads', cors({
  origin: true,
  credentials: false,
  methods: ['GET'],
  allowedHeaders: ['Content-Type']
}), (_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static(path.join(__dirname, '../public/uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/teacher-search', teacherSearchRoutes);
app.use('/api/subscription-packages', subscriptionPackageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/user', userOnesignalRoutes);

// =====================================================
// Course Enrollment System Routes
// =====================================================

// Student enrollment routes
app.use('/api/student/enrollment', studentRoutes);

// Teacher enrollment routes
app.use('/api/teacher/enrollment', teacherRoutes);

// =====================================================
// Error handling middleware
// =====================================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'المسار غير موجود',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Global error handler:', error);

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'حدث خطأ في الخادم',
    ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack })
  });
});

// =====================================================
// Database initialization and server startup
// =====================================================

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    // Start notification cron service
    notificationCronService.start();
    // Start server
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
      console.log(`🔗 Health check: http://192.168.68.103:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});

// Start the server
startServer();

import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { initializeDatabase } from './database/init';
import authRoutes from './routes/auth.routes';
import notificationRoutes from './routes/notification.routes';
import studentRoutes from './routes/student';
import academicYearRoutes from './routes/super_admin/academic-year.routes';
import gradeRoutes from './routes/super_admin/grade.routes';
import newsRoutes from './routes/super_admin/news.routes';
import subscriptionPackageRoutes from './routes/super_admin/subscription-package.routes';
import teacherRoutes from './routes/teacher';
import teacherSearchRoutes from './routes/teacher-search.routes';
import courseRoutes from './routes/teacher/course.routes';
import subjectRoutes from './routes/teacher/subject.routes';
import userOnesignalRoutes from './routes/user-onesignal.routes';
import { notificationCronService } from './services/notification-cron.service';
import { NotificationService } from './services/notification.service';

// =====================================================
// 🔹 Load Environment Variables
// =====================================================
dotenv.config();
const app = express();
const PORT: number = parseInt(process.env['PORT'] || '3000', 10);
const NODE_ENV: string = process.env['NODE_ENV'] || 'development';

// =====================================================
// 🔹 CORS Configuration
// =====================================================
const allowedOrigins = [
  'https://mulhimiq.com',
  'https://www.mulhimiq.com',
  'https://api.mulhimiq.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// allow preflight requests
app.options('*', cors());

// =====================================================
// 🔹 Security Middleware
// =====================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // disable CSP to prevent blocking images/scripts
  })
);

// =====================================================
// 🔹 Rate Limiting (Anti-DDoS)
// =====================================================
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10), // 15 min
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '1000', 10),     // max requests
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// =====================================================
// 🔹 Core Middleware
// =====================================================
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(compression());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));

// =====================================================
// 🔹 Static Files (uploads/public)
// =====================================================
app.use(
  '/public',
  cors({ origin: true, methods: ['GET'] }),
  express.static(path.join(__dirname, '../public'))
);

app.use(
  '/uploads',
  cors({ origin: true, methods: ['GET'] }),
  express.static(path.join(__dirname, '../public/uploads'))
);

// =====================================================
// 🔹 Health Check Endpoint
// =====================================================
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: '🚀 Server running successfully',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// =====================================================
// 🔹 Initialize OneSignal Service
// =====================================================
try {
  const oneSignalAppId =
    process.env['ONESIGNAL_APP_ID'] ||
    process.env['ONESIGNAL_APP_ID_WEB'] ||
    '';
  const oneSignalRestApiKey = process.env['ONESIGNAL_REST_API_KEY'] || '';
  const notificationService = new NotificationService({
    appId: oneSignalAppId,
    restApiKey: oneSignalRestApiKey,
  });
  app.set('notificationService', notificationService);
  console.log('✅ NotificationService initialized');
} catch (e) {
  console.warn('⚠️ NotificationService not initialized:', e);
}

// =====================================================
// 🔹 API Routes
// =====================================================
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
// 🔹 Error Handling
// =====================================================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'المسار غير موجود',
    path: req.originalUrl,
  });
});

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Global error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'حدث خطأ في الخادم',
      ...(NODE_ENV === 'development' && { stack: error.stack }),
    });
  }
);

// =====================================================
// 🔹 Start Server and Initialize DB
// =====================================================
async function startServer() {
  try {
    await initializeDatabase();
    notificationCronService.start();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// =====================================================
// 🔹 Graceful Shutdown
// =====================================================
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// =====================================================
// 🔹 Launch!
// =====================================================
startServer();

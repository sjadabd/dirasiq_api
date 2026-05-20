import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import pinoHttp from 'pino-http';

import { initializeDatabase } from './database/init';
import authRoutes from './routes/auth.routes';
import notificationRoutes from './routes/notification.routes';
import waylRoutes from './routes/payments/wayl.routes';
import publicNewsRoutes from './routes/public/news.routes';
import studentRoutes from './routes/student';
import academicYearRoutes from './routes/super_admin/academic-year.routes';
import superAdminDashboardRoutes from './routes/super_admin/dashboard.routes';
import internalRoutes from './routes/internal.routes';
import gradeRoutes from './routes/super_admin/grade.routes';
import newsRoutes from './routes/super_admin/news.routes';
import superAdminSettingsRoutes from './routes/super_admin/settings.routes';
import subscriptionPackageRoutes from './routes/super_admin/subscription-package.routes';
import superAdminTeacherRoutes from './routes/super_admin/teacher.routes';
import teacherRoutes from './routes/teacher';
import teacherSearchRoutes from './routes/teacher-search.routes';
import courseRoutes from './routes/teacher/course.routes';
import subjectRoutes from './routes/teacher/subject.routes';
import userOnesignalRoutes from './routes/user-onesignal.routes';
import { notificationCronService } from './services/notification-cron.service';
import { NotificationService } from './services/notification.service';

import { requestId } from './middleware/request-id.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { ok } from './utils/response.util';

// =====================================================
// 🔹 Load Environment Variables
// =====================================================
dotenv.config();
const app = express();
app.set('etag', false);
app.set('trust proxy', 1);
const PORT: number = parseInt(process.env['PORT'] || '3000', 10);
const NODE_ENV: string = process.env['NODE_ENV'] || 'development';

// =====================================================
// 🔹 Request ID (must precede logger / routes)
// =====================================================
app.use(requestId);

// =====================================================
// 🔹 Structured request logger (pino-http)
//
// One JSON line per request, correlated with the X-Request-ID set above.
// Emitted on response finish; includes status, response time, method, and url.
// =====================================================
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as express.Request).id,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Quiet down the per-request message; we still get method, url, status.
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    // Strip noisy fields from the auto-serialized req/res objects.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);

// =====================================================
// 🔹 Secure and Explicit CORS Configuration
// =====================================================
const allowedOrigins = [
  'https://mulhimiq.com',
  'https://www.mulhimiq.com',
  'https://api.mulhimiq.com',
  'http://localhost:5174',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'CORS rejected');
      return callback(new Error('CORS not allowed for this origin'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  })
);

// NOTE: a manual `res.header('Access-Control-Allow-Origin', req.headers.origin || '*')`
// block previously lived here. It defeated the allowlist above — any Origin would
// receive a permissive CORS header. Removed 2026-05-15 (Phase 0).

// =====================================================
// 🔹 Security Middleware (Helmet) — Phase 0
// =====================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: NODE_ENV === 'production' ? [] : null,
      },
    },
  })
);

// =====================================================
// 🔹 Compression
// =====================================================
app.use(compression());

// =====================================================
// 🔹 Inject content_url into every JSON response
//
// Preserved from the pre-Phase-1 era: dashboard + Flutter clients read
// `content_url` from the top level of every response to resolve relative
// asset paths. The wrapper attaches it after the canonical envelope is
// built, so it lives outside ApiResponse.data and stays backwards-compatible.
// =====================================================
// content_url is derived from the live request origin so the same code
// returns http://localhost:3000 in dev and https://api.mulhimiq.com in
// production without any env config. Set APP_URL to override (e.g. behind
// a reverse proxy where the public hostname differs from req.get('host')).
//
// We emit content_url WITHOUT a trailing slash because every stored asset
// path begins with one (e.g. "/uploads/news/x.svg"). Concatenating
// content_url + image_url then yields a single-slash URL.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data: any) => {
    if (typeof data === 'object' && data !== null) {
      const override = process.env['APP_URL']?.trim();
      const raw = override || `${req.protocol}://${req.get('host')}`;
      data.content_url = raw.replace(/\/+$/, '');
    }
    return originalJson(data);
  };
  next();
});

// =====================================================
// 🔹 Rate Limiting (global; per-endpoint stricter limits land in Phase 1.x)
// =====================================================
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10),
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '1000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
  },
});
app.use(limiter);

// =====================================================
// 🔹 Core Middleware
// =====================================================
app.use(
  express.json({
    limit: '1000mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf?.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1000mb' }));

// =====================================================
// 🔹 Static Files
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
// 🔹 Delete Account Info Page
// =====================================================
app.get('/delete-account', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/delete-account.html'));
});

// =====================================================
// 🔹 Health Check
// =====================================================
app.get('/health', (_req, res) => {
  res.status(200).json(
    ok(
      {
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
      },
      'Server is running'
    )
  );
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
  logger.info('NotificationService initialized');
} catch (e) {
  logger.warn({ err: e }, 'NotificationService not initialized');
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
app.use('/api/public/news', publicNewsRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/teacher-search', teacherSearchRoutes);
app.use('/api/subscription-packages', subscriptionPackageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/user', userOnesignalRoutes);
app.use('/api/super-admin/dashboard', superAdminDashboardRoutes);
app.use('/api/super-admin/teachers', superAdminTeacherRoutes);
app.use('/api/super-admin/settings', superAdminSettingsRoutes);
app.use('/api/payments/wayl', waylRoutes);

// Header-gated internal endpoints consumed by other in-house services
// (currently only `dirasiq_chat`). Never reached by end-user clients.
app.use('/api/internal', internalRoutes);

// =====================================================
// 🔹 404 + Global Error Handler (must be LAST)
// =====================================================
app.use('*', notFoundHandler);
app.use(errorHandler);

// =====================================================
// 🔹 Start Server and Initialize DB
// =====================================================
async function startServer() {
  try {
    await initializeDatabase();
    notificationCronService.start();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, `Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// =====================================================
// 🔹 Graceful Shutdown
// =====================================================
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// Only start if invoked directly — keeps `import app from './index'` in tests
// from spinning up the server.
if (require.main === module) {
  startServer();
}

export default app;

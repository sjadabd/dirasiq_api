"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const init_1 = require("./database/init");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const student_1 = __importDefault(require("./routes/student"));
const academic_year_routes_1 = __importDefault(require("./routes/super_admin/academic-year.routes"));
const grade_routes_1 = __importDefault(require("./routes/super_admin/grade.routes"));
const news_routes_1 = __importDefault(require("./routes/super_admin/news.routes"));
const subscription_package_routes_1 = __importDefault(require("./routes/super_admin/subscription-package.routes"));
const teacher_1 = __importDefault(require("./routes/teacher"));
const teacher_search_routes_1 = __importDefault(require("./routes/teacher-search.routes"));
const course_routes_1 = __importDefault(require("./routes/teacher/course.routes"));
const subject_routes_1 = __importDefault(require("./routes/teacher/subject.routes"));
const user_onesignal_routes_1 = __importDefault(require("./routes/user-onesignal.routes"));
const notification_cron_service_1 = require("./services/notification-cron.service");
const notification_service_1 = require("./services/notification.service");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env['PORT'] || '3000', 10);
const NODE_ENV = process.env['NODE_ENV'] || 'development';
const allowedOrigins = [
    'https://mulhimiq.com',
    'https://www.mulhimiq.com',
    'https://api.mulhimiq.com',
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`❌ Blocked CORS request from: ${origin}`);
        return callback(new Error('CORS not allowed for this origin'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', (0, cors_1.default)());
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
}));
app.use((0, morgan_1.default)(NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use((0, compression_1.default)());
const APP_URL = process.env['APP_URL'] || 'https://api.mulhimiq.com/';
app.use((_req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
        if (typeof data === 'object' && data !== null) {
            data.content_url = APP_URL;
        }
        return originalJson(data);
    };
    next();
});
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000', 10),
    max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '1000', 10),
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use(express_1.default.json({ limit: '15mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '15mb' }));
app.use('/public', (0, cors_1.default)({ origin: true, methods: ['GET'] }), express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/uploads', (0, cors_1.default)({ origin: true, methods: ['GET'] }), express_1.default.static(path_1.default.join(__dirname, '../public/uploads')));
app.get('/health', (_req, res) => {
    res.status(200).json({
        success: true,
        message: '🚀 Server running successfully',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
    });
});
try {
    const oneSignalAppId = process.env['ONESIGNAL_APP_ID'] ||
        process.env['ONESIGNAL_APP_ID_WEB'] ||
        '';
    const oneSignalRestApiKey = process.env['ONESIGNAL_REST_API_KEY'] || '';
    const notificationService = new notification_service_1.NotificationService({
        appId: oneSignalAppId,
        restApiKey: oneSignalRestApiKey,
    });
    app.set('notificationService', notificationService);
    console.log('✅ NotificationService initialized');
}
catch (e) {
    console.warn('⚠️ NotificationService not initialized:', e);
}
app.use('/api/auth', auth_routes_1.default);
app.use('/api/student', student_1.default);
app.use('/api/teacher', teacher_1.default);
app.use('/api/academic-years', academic_year_routes_1.default);
app.use('/api/subjects', subject_routes_1.default);
app.use('/api/grades', grade_routes_1.default);
app.use('/api/news', news_routes_1.default);
app.use('/api/courses', course_routes_1.default);
app.use('/api/teacher-search', teacher_search_routes_1.default);
app.use('/api/subscription-packages', subscription_package_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/user', user_onesignal_routes_1.default);
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'المسار غير موجود',
        path: req.originalUrl,
    });
});
app.use((error, _req, res, _next) => {
    console.error('Global error:', error);
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'حدث خطأ في الخادم',
        ...(NODE_ENV === 'development' && { stack: error.stack }),
    });
});
async function startServer() {
    try {
        await (0, init_1.initializeDatabase)();
        notification_cron_service_1.notificationCronService.start();
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
startServer();
//# sourceMappingURL=index.js.map
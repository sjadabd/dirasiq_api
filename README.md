# Dirasiq API

API احترافي لمنصة دراسيق التعليمية مبني باستخدام Node.js و TypeScript و PostgreSQL.

## 🚀 المميزات

- **مصادقة آمنة**: JWT tokens مع إدارة جلسات متقدمة
- **ثلاثة أنواع من المستخدمين**: سوبر أدمن، معلم، طالب
- **تحقق من البريد الإلكتروني**: للمعلمين مع إعادة إرسال الرمز
- **إعادة تعيين كلمة المرور**: عبر البريد الإلكتروني
- **حماية متقدمة**: Rate limiting, Helmet, CORS
- **هيكلية احترافية**: فصل المسؤوليات والكود النظيف
- **TypeScript**: نوعية قوية للكود
- **PostgreSQL**: قاعدة بيانات قوية وموثوقة
- **🌍 ميزات الموقع المتقدمة**: خدمة جغرافية متكاملة مع OpenCage

## 📋 المتطلبات

- Node.js (v16 أو أحدث)
- PostgreSQL (v12 أو أحدث)
- npm أو yarn

## 🛠️ التثبيت

1. **استنساخ المشروع**
```bash
git clone <repository-url>
cd dirasiq_api
```

2. **تثبيت التبعيات**
```bash
npm install
```

3. **إعداد المتغيرات البيئية**
```bash
cp env.example .env
```

4. **تعديل ملف .env**
```env
# Server Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dirasiq_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=4h

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Geocoding Configuration (OpenCage)
OPENCAGE_API_KEY=your_opencage_api_key_here

# Timezone
TZ=Asia/Baghdad
```

5. **إنشاء قاعدة البيانات**
```sql
CREATE DATABASE dirasiq_db;
```

6. **تهيئة قاعدة البيانات**
```bash
npm run db:init
```

7. **تشغيل المشروع**
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 📁 هيكلية المشروع

```
src/
├── config/           # إعدادات التطبيق
│   ├── database.ts   # إعدادات قاعدة البيانات
│   └── email.ts      # إعدادات البريد الإلكتروني
├── controllers/      # Controllers
│   └── auth.controller.ts
├── database/         # قاعدة البيانات
│   ├── migrations/   # ملفات الترحيل
│   └── init.ts       # تهيئة قاعدة البيانات
├── middleware/       # Middleware
│   └── auth.middleware.ts
├── models/          # Models
│   ├── user.model.ts
│   └── token.model.ts
├── routes/          # Routes
│   └── auth.routes.ts
├── services/        # Services
│   └── auth.service.ts
├── types/           # TypeScript Types
│   └── index.ts
└── index.ts         # نقطة البداية
```

## 🔐 API Endpoints

### المصادقة (Authentication)

#### تسجيل سوبر أدمن
```http
POST /api/auth/register/super-admin
Content-Type: application/json

{
  "name": "Admin Name",
  "email": "admin@example.com",
  "password": "Password123"
}
```

#### تسجيل معلم
```http
POST /api/auth/register/teacher
Content-Type: application/json

{
  "name": "أحمد محمد",
  "email": "teacher@example.com",
  "password": "Password123",
  "phone": "+966501234567",
  "address": "الرياض، المملكة العربية السعودية",
  "bio": "مدرس رياضيات مع خبرة 5 سنوات",
  "experienceYears": 5,
  "visitorId": "fp_visitor_id_from_frontend",
  "deviceInfo": "Mozilla/5.0..."
}
```

#### تسجيل الدخول
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123"
}
```

#### تسجيل الخروج
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

#### تحقق من البريد الإلكتروني
```http
POST /api/auth/verify-email
Content-Type: application/json

{
  "email": "teacher@example.com",
  "code": "123456"
}
```

#### إعادة إرسال رمز التحقق
```http
POST /api/auth/resend-verification
Content-Type: application/json

{
  "email": "teacher@example.com"
}
```

#### طلب إعادة تعيين كلمة المرور
```http
POST /api/auth/request-password-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### إعادة تعيين كلمة المرور
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewPassword123"
}
```

## 🔒 الأمان

- **JWT Tokens**: مع انتهاء الصلاحية في الساعة 4 صباحاً بتوقيت العراق
- **Rate Limiting**: حماية من الهجمات
- **Helmet**: حماية من الثغرات الأمنية
- **CORS**: إعدادات آمنة للطلبات المتقاطعة
- **Password Hashing**: تشفير كلمات المرور باستخدام bcrypt
- **Input Validation**: التحقق من المدخلات
- **SQL Injection Protection**: حماية من حقن SQL

## 🧪 الاختبار

```bash
# تشغيل الاختبارات
npm test

# تشغيل الاختبارات مع التغطية
npm run test:coverage
```

## 📝 السجلات (Logs)

- **Development**: Morgan dev format
- **Production**: Morgan combined format
- **Errors**: Console logging مع تفاصيل كاملة

## 🚀 النشر (Deployment)

### Docker (اختياري)
```bash
# بناء الصورة
docker build -t dirasiq-api .

# تشغيل الحاوية
docker run -p 3000:3000 dirasiq-api
```

### Production Checklist
- [ ] تعيين `NODE_ENV=production`
- [ ] تحديث `JWT_SECRET` بقيمة قوية
- [ ] إعداد قاعدة بيانات PostgreSQL للإنتاج
- [ ] تكوين البريد الإلكتروني للإنتاج
- [ ] إعداد SSL/TLS
- [ ] تكوين CORS للدومين الصحيح
- [ ] إعداد monitoring و logging

## 🤝 المساهمة

1. Fork المشروع
2. إنشاء branch جديد (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push إلى Branch (`git push origin feature/amazing-feature`)
5. فتح Pull Request

## 📄 الرخصة

هذا المشروع مرخص تحت رخصة MIT - انظر ملف [LICENSE](LICENSE) للتفاصيل.

## 📞 الدعم

للدعم والاستفسارات، يرجى التواصل عبر:
- البريد الإلكتروني: support@dirasiq.com
- GitHub Issues: [إنشاء issue جديد](https://github.com/dirasiq/api/issues)

---

**ملاحظة**: تأكد من تحديث جميع المتغيرات البيئية قبل تشغيل المشروع في الإنتاج.

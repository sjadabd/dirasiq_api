# وثائق API - Dirasiq

## نظرة عامة

Dirasiq API هو نظام مصادقة وإدارة مستخدمين متقدم مبني باستخدام Node.js و TypeScript و PostgreSQL.

**Base URL**: `https://api.dirasiq.com` (الإنتاج) أو `http://localhost:3000` (التطوير)

## المصادقة

جميع الطلبات المحمية تتطلب header `Authorization` مع Bearer token:

```
Authorization: Bearer <your-jwt-token>
```

## نمط الاستجابة

جميع الاستجابات تتبع النمط التالي:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // البيانات المطلوبة
  },
  "errors": []
}
```

في حالة الخطأ:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    "Detailed error message 1",
    "Detailed error message 2"
  ]
}
```

## رموز الحالة HTTP

- `200` - نجح الطلب
- `201` - تم إنشاء المورد بنجاح
- `400` - طلب غير صحيح
- `401` - غير مصرح
- `403` - محظور
- `404` - غير موجود
- `429` - طلبات كثيرة جداً
- `500` - خطأ في الخادم

---

## 🔐 المصادقة (Authentication)

### تسجيل سوبر أدمن

**POST** `/api/auth/register/super-admin`

إنشاء حساب سوبر أدمن جديد (يمكن إنشاء واحد فقط).

**Request Body:**
```json
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "password": "Password123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Super admin registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Admin Name",
      "email": "admin@example.com",
      "userType": "super_admin",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt-token"
  }
}
```

### تسجيل معلم

**POST** `/api/auth/register/teacher`

إنشاء حساب معلم جديد مع إرسال رمز التحقق عبر البريد الإلكتروني.

**Request Body:**
```json
{
  "name": "أحمد محمد",
  "email": "teacher@example.com",
  "password": "Password123",
  "phone": "+964501234567",
  "address": "العراق, بغداد",
  "bio": "مدرس رياضيات مع خبرة 5 سنوات",
  "experienceYears": 5,
  "gradeIds": [
    "99842b1c-d412-41df-99c1-3241bac62fd6",
    "bb851218-dbf2-4daa-8505-1defb7a8d230"
  ],
  "studyYear": "2024-2025",
  "latitude": 33.3687184,
  "longitude": 44.5115104
}
```

**ملاحظة**: عند إرسال `latitude` و `longitude`، سيقوم النظام تلقائياً بجلب تفاصيل الموقع الكاملة باستخدام خدمة الجغرافيا.

**Request Body:**
```json
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

**Response (201):**
```json
{
  "success": true,
  "message": "Teacher registered successfully. Please check your email for verification.",
  "data": {
    "user": {
      "id": "uuid",
      "name": "أحمد محمد",
      "email": "teacher@example.com",
      "userType": "teacher",
      "status": "pending",
      "phone": "+966501234567",
      "address": "الرياض، المملكة العربية السعودية",
      "bio": "مدرس رياضيات مع خبرة 5 سنوات",
      "experienceYears": 5,
      "visitorId": "fp_visitor_id_from_frontend",
      "deviceInfo": "Mozilla/5.0...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### تسجيل الدخول

**POST** `/api/auth/login`

تسجيل الدخول لجميع أنواع المستخدمين.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "User Name",
      "email": "user@example.com",
      "userType": "teacher",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "jwt-token"
  }
}
```

### تسجيل الخروج

**POST** `/api/auth/logout`

تسجيل الخروج وإلغاء التوكن.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### تحقق من البريد الإلكتروني

**POST** `/api/auth/verify-email`

تفعيل حساب المعلم باستخدام رمز التحقق.

**Request Body:**
```json
{
  "email": "teacher@example.com",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### إعادة إرسال رمز التحقق

**POST** `/api/auth/resend-verification`

إعادة إرسال رمز التحقق للمعلمين.

**Request Body:**
```json
{
  "email": "teacher@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification code sent successfully"
}
```

### طلب إعادة تعيين كلمة المرور

**POST** `/api/auth/request-password-reset`

إرسال رمز إعادة تعيين كلمة المرور عبر البريد الإلكتروني.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset code sent successfully"
}
```

### إعادة تعيين كلمة المرور

**POST** `/api/auth/reset-password`

إعادة تعيين كلمة المرور باستخدام الرمز المرسل.

**Request Body:**
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewPassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

## 📊 فحص الحالة

### فحص صحة الخادم

**GET** `/health`

فحص حالة الخادم وقاعدة البيانات.

**Response (200):**
```json
{
  "success": true,
  "message": "Server is running",
  "data": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "environment": "development",
    "database": "connected",
    "uptime": "1h 30m 45s"
  }
}
```

---

## 🔒 الأمان

### متطلبات كلمة المرور

- الحد الأدنى: 8 أحرف
- يجب أن تحتوي على حرف كبير واحد على الأقل
- يجب أن تحتوي على حرف صغير واحد على الأقل
- يجب أن تحتوي على رقم واحد على الأقل

### JWT Token

- **مدة الصلاحية**: 4 ساعات
- **انتهاء الصلاحية**: الساعة 4 صباحاً بتوقيت العراق
- **التخزين**: في قاعدة البيانات مع إمكانية إلغاء التوكن

### Rate Limiting

- **الحد**: 100 طلب لكل 15 دقيقة لكل IP
- **الاستثناءات**: فحص الحالة (health check)

---

## 📝 أمثلة الاستخدام

### مثال: تسجيل معلم جديد

```bash
curl -X POST http://localhost:3000/api/auth/register/teacher \
  -H "Content-Type: application/json" \
  -d '{
    "name": "أحمد محمد",
    "email": "ahmed@example.com",
    "password": "Password123",
    "phone": "+966501234567",
    "address": "الرياض، المملكة العربية السعودية",
    "bio": "مدرس رياضيات مع خبرة 5 سنوات",
    "experienceYears": 5
  }'
```

### مثال: تسجيل الدخول

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ahmed@example.com",
    "password": "Password123"
  }'
```

### مثال: استخدام التوكن

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🚨 رموز الخطأ الشائعة

| الكود | الوصف | الحل |
|-------|--------|------|
| `EMAIL_EXISTS` | البريد الإلكتروني مسجل مسبقاً | استخدم بريد إلكتروني مختلف |
| `INVALID_CREDENTIALS` | بيانات تسجيل الدخول غير صحيحة | تحقق من البريد الإلكتروني وكلمة المرور |
| `ACCOUNT_NOT_ACTIVE` | الحساب غير مفعل | تحقق من البريد الإلكتروني |
| `INVALID_TOKEN` | التوكن غير صحيح أو منتهي الصلاحية | سجل الدخول مرة أخرى |
| `RATE_LIMIT_EXCEEDED` | تجاوز حد الطلبات | انتظر 15 دقيقة |

---

## 🌍 ميزات الموقع المتقدمة

### نظرة عامة
تم إضافة ميزات متقدمة لإدارة بيانات الموقع للمستخدمين باستخدام خدمة جغرافية متكاملة.

### الحقول الجديدة
- `formattedAddress`: العنوان المُنسق بالكامل
- `country`: الدولة
- `city`: المدينة  
- `state`: المحافظة/الولاية
- `zipcode`: الرمز البريدي
- `streetName`: اسم الشارع
- `suburb`: الحي/الضاحية
- `locationConfidence`: مستوى الثقة في البيانات

### مثال: تسجيل معلم مع بيانات موقع متقدمة

```json
{
  "name": "أحمد محمد",
  "email": "teacher@example.com",
  "password": "Password123",
  "phone": "+964501234567",
  "address": "العراق, بغداد",
  "bio": "مدرس رياضيات مع خبرة 5 سنوات",
  "experienceYears": 5,
  "gradeIds": ["grade-id-1", "grade-id-2"],
  "studyYear": "2024-2025",
  "latitude": 33.3687184,
  "longitude": 44.5115104
}
```

**الاستجابة المتوقعة مع بيانات الموقع:**
```json
{
  "success": true,
  "message": "تم تسجيل المعلم بنجاح",
  "data": {
    "user": {
      "id": "uuid",
      "name": "أحمد محمد",
      "email": "teacher@example.com",
      "userType": "teacher",
      "status": "pending",
      "latitude": 33.3687184,
      "longitude": 44.5115104,
      "formattedAddress": "شارع فلسطين، حي الوحدة، بغداد، العراق",
      "country": "العراق",
      "city": "بغداد",
      "state": "محافظة بغداد",
      "zipcode": "10013",
      "streetName": "شارع فلسطين",
      "suburb": "حي الوحدة",
      "locationConfidence": 0.95,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### مزود الخدمة
- **OpenCage**: مزود رئيسي مع دعم ممتاز للغة العربية
- **اللغة**: العربية (العراق)
- **الدقة**: عالية مع مستوى ثقة

---

## 📞 الدعم

للمساعدة التقنية:
- البريد الإلكتروني: support@dirasiq.com
- GitHub Issues: [إنشاء issue جديد](https://github.com/dirasiq/api/issues)
- الوثائق: [رابط الوثائق](https://docs.dirasiq.com)

---

**آخر تحديث**: يناير 2024

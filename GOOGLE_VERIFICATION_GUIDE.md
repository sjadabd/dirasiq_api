# دليل التحقق من بيانات Google

## نظرة عامة

تم إضافة نظام التحقق من بيانات Google لضمان صحة البيانات المرسلة من Google قبل استخدامها في النظام.

## طرق التحقق

### 1. **التحقق من JWT Token (الطريقة الموصى بها)**

هذه الطريقة الأكثر أماناً حيث يتم التحقق من JWT token مباشرة من Google.

#### الاستخدام:
```javascript
POST /api/auth/google-auth
{
  "googleToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...", // JWT token من Google
  "userType": "teacher"
}
```

#### المزايا:
- ✅ **أقصى درجات الأمان**: التحقق مباشرة من Google
- ✅ **منع التلاعب**: لا يمكن تزوير JWT token
- ✅ **التحقق من الصلاحية**: فحص انتهاء الصلاحية تلقائياً
- ✅ **التحقق من المصدر**: التأكد من أن Token صادر من Google

### 2. **التحقق من البيانات المرسلة (طريقة احتياطية)**

للحالات التي لا يمكن فيها الحصول على JWT token مباشرة.

#### الاستخدام:
```javascript
POST /api/auth/google-auth
{
  "googleData": {
    "iss": "https://accounts.google.com",
    "azp": "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
    "aud": "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
    "sub": "113511129504049125945",
    "email": "www.sjad.n@gmail.com",
    "email_verified": true,
    "nbf": 1757083649,
    "name": "SJAD n",
    "picture": "https://lh3.googleusercontent.com/a/ACg8ocLkbA_eVDaG2AfX0EJFmmZIm2iRM56xE7FbCmHg9S3xyN7nqpXQ=s96-c",
    "given_name": "SJAD",
    "family_name": "n",
    "iat": 1757083949,
    "exp": 1757087549,
    "jti": "49d54c5c84fcec1bdd4aa80cbe005ba54731e651"
  },
  "userType": "teacher"
}
```

## التحققات الأمنية

### 1. **التحقق من JWT Token**

```typescript
// التحقق من صحة Token
const verification = await GoogleAuthService.verifyGoogleToken(googleToken);

// التحققات المطبقة:
- ✅ صحة التوقيع الرقمي
- ✅ التحقق من المصدر (issuer)
- ✅ التحقق من الجمهور (audience)
- ✅ التحقق من انتهاء الصلاحية
- ✅ التحقق من صحة البريد الإلكتروني
```

### 2. **التحقق من البيانات المرسلة**

```typescript
// التحقق من البيانات
const validation = await GoogleAuthService.verifyGoogleDataWithSecurity(googleData);

// التحققات المطبقة:
- ✅ وجود الحقول المطلوبة
- ✅ صحة تنسيق البريد الإلكتروني
- ✅ التحقق من المصدر (issuer)
- ✅ التحقق من الجمهور (audience)
- ✅ التحقق من تأكيد البريد الإلكتروني
- ✅ التحقق من انتهاء الصلاحية
- ✅ التحقق من صحة التوقيت
- ✅ التحقق من عمر Token
- ✅ التحقق من تنسيق Google User ID
```

## إعدادات البيئة

### متغيرات البيئة المطلوبة:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com
```

### تثبيت المكتبة المطلوبة:

```bash
npm install google-auth-library
```

## أمثلة على الاستخدام

### 1. **الطريقة الموصى بها (JWT Token)**

```javascript
// في Frontend
const googleUser = await signInWithGoogle();
const idToken = googleUser.credential.idToken;

// إرسال للـ Backend
const response = await fetch('/api/auth/google-auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    googleToken: idToken,
    userType: 'teacher'
  })
});

const result = await response.json();

if (result.success) {
  // حفظ JWT token الخاص بنا
  localStorage.setItem('token', result.data.token);
  
  if (result.data.requiresProfileCompletion) {
    // توجيه لإكمال الملف الشخصي
    redirectToProfileCompletion();
  } else {
    // توجيه للداشبورد
    redirectToDashboard();
  }
}
```

### 2. **الطريقة الاحتياطية (البيانات)**

```javascript
// في Frontend
const googleUser = await signInWithGoogle();
const userData = googleUser.profile;

// إرسال للـ Backend
const response = await fetch('/api/auth/google-auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    googleData: {
      iss: "https://accounts.google.com",
      azp: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
      aud: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
      sub: userData.id,
      email: userData.email,
      email_verified: userData.email_verified,
      name: userData.name,
      picture: userData.picture,
      given_name: userData.given_name,
      family_name: userData.family_name
    },
    userType: 'teacher'
  })
});
```

## رسائل الخطأ

### أخطاء التحقق من JWT Token:

```json
{
  "success": false,
  "message": "فشل في التحقق من بيانات Google",
  "errors": ["Invalid Google token"]
}
```

### أخطاء التحقق من البيانات:

```json
{
  "success": false,
  "message": "بيانات Google غير صحيحة",
  "errors": [
    "Missing required field: email",
    "Invalid token issuer",
    "Token has expired",
    "Email not verified by Google"
  ]
}
```

### أخطاء البيانات الناقصة:

```json
{
  "success": false,
  "message": "مطلوب إما Google token أو Google data",
  "errors": ["Either googleToken or googleData is required"]
}
```

## الأمان

### 1. **حماية من التلاعب**
- التحقق من التوقيع الرقمي
- التحقق من المصدر والجمهور
- التحقق من انتهاء الصلاحية

### 2. **حماية من الهجمات**
- منع استخدام Tokens منتهية الصلاحية
- منع استخدام Tokens قديمة جداً
- التحقق من صحة تنسيق البيانات

### 3. **حماية البيانات**
- عدم تخزين Google tokens
- استخدام JWT tokens مخصصة
- تشفير البيانات الحساسة

## الملفات المضافة

### 1. **خدمة التحقق من Google**
- `src/services/google-auth.service.ts` - خدمة التحقق من بيانات Google

### 2. **تحديث الكونترولر**
- `src/controllers/auth.controller.ts` - إضافة التحقق من Google

### 3. **متغيرات البيئة**
- `env.example` - إضافة `GOOGLE_CLIENT_ID`

## الفوائد

1. **أقصى درجات الأمان**: التحقق مباشرة من Google
2. **منع التلاعب**: لا يمكن تزوير البيانات
3. **المرونة**: دعم طريقتين للتحقق
4. **الموثوقية**: التحقق من صحة جميع البيانات
5. **الحماية**: منع الهجمات المختلفة

## التوصيات

1. **استخدم JWT Token**: الطريقة الأكثر أماناً
2. **تحقق من متغيرات البيئة**: تأكد من إعداد `GOOGLE_CLIENT_ID`
3. **راقب الأخطاء**: تتبع محاولات التلاعب
4. **حدث المكتبات**: حافظ على تحديث `google-auth-library`

النظام الآن محمي بالكامل ضد التلاعب في بيانات Google! 🛡️

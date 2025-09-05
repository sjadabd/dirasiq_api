# دليل تسجيل الدخول عبر Google OAuth

## نظرة عامة

تم تطوير نظام تسجيل الدخول عبر Google OAuth يتيح للمستخدمين تسجيل الدخول أو إنشاء حساب جديد باستخدام بيانات Google.

## الميزات

### 1. **التحقق من المستخدم الموجود**
- فحص البريد الإلكتروني في قاعدة البيانات
- التحقق من نوع المستخدم (معلم/طالب)
- تسجيل دخول مباشر إذا كان المستخدم موجود

### 2. **إنشاء حساب جديد**
- إنشاء حساب جديد بالبيانات الأساسية من Google
- إنشاء JWT token مخصص (وليس token Google)
- إشارة إلى ضرورة إكمال الملف الشخصي

### 3. **إكمال الملف الشخصي**
- مسار منفصل لإكمال البيانات المطلوبة
- تحقق من نوع المستخدم وإضافة البيانات المناسبة

## المسارات المتاحة

### 1. تسجيل الدخول عبر Google
```
POST /api/auth/google-auth
```

**المعاملات المطلوبة:**
```json
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
  "userType": "teacher" // أو "student"
}
```

**الاستجابة للمستخدم الموجود:**
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "user": {
      "id": "uuid",
      "name": "SJAD n",
      "email": "www.sjad.n@gmail.com",
      "userType": "teacher",
      "status": "active"
    },
    "token": "jwt_token_here",
    "isNewUser": false
  }
}
```

**الاستجابة للمستخدم الجديد:**
```json
{
  "success": true,
  "message": "تم إنشاء الحساب وتسجيل الدخول بنجاح",
  "data": {
    "user": {
      "id": "uuid",
      "name": "SJAD n",
      "email": "www.sjad.n@gmail.com",
      "userType": "teacher",
      "status": "active"
    },
    "token": "jwt_token_here",
    "isNewUser": true,
    "requiresProfileCompletion": true
  }
}
```

### 2. إكمال الملف الشخصي
```
POST /api/auth/complete-profile
Authorization: Bearer <jwt_token>
```

**للمعلم:**
```json
{
  "phone": "1234567890",
  "address": "العنوان الكامل",
  "bio": "نبذة عن المعلم",
  "experienceYears": 5,
  "gradeIds": ["grade-uuid-1", "grade-uuid-2"],
  "studyYear": "2024-2025"
}
```

**للطالب:**
```json
{
  "gradeId": "grade-uuid",
  "studyYear": "2024-2025",
  "studentPhone": "1234567890",
  "parentPhone": "0987654321",
  "schoolName": "اسم المدرسة",
  "gender": "male",
  "birthDate": "2010-01-01"
}
```

## تدفق العمل

### 1. **المستخدم الموجود**
```
1. المستخدم يختار "تسجيل الدخول عبر Google"
2. Google يعيد البيانات
3. النظام يفحص البريد الإلكتروني
4. المستخدم موجود → تسجيل دخول مباشر
5. إرجاع JWT token
```

### 2. **المستخدم الجديد**
```
1. المستخدم يختار "تسجيل الدخول عبر Google"
2. Google يعيد البيانات
3. النظام يفحص البريد الإلكتروني
4. المستخدم غير موجود → إنشاء حساب جديد
5. إرجاع JWT token مع requiresProfileCompletion: true
6. المستخدم يكمل الملف الشخصي
7. النظام يحدث البيانات
```

## الأمان

### 1. **التحقق من البيانات**
- التحقق من صحة بيانات Google
- التحقق من نوع المستخدم
- منع التلاعب في البيانات

### 2. **JWT Token**
- إنشاء token مخصص (وليس استخدام Google token)
- صلاحية 7 أيام
- تخزين في قاعدة البيانات

### 3. **التحقق من الصلاحيات**
- التحقق من نوع المستخدم عند إكمال الملف الشخصي
- منع الوصول غير المصرح به

## رسائل الخطأ

### أخطاء التحقق
```json
{
  "success": false,
  "message": "Invalid Google data structure",
  "errors": ["Missing required Google data fields"]
}
```

### خطأ نوع المستخدم
```json
{
  "success": false,
  "message": "نوع المستخدم لا يتطابق مع الحساب الموجود",
  "errors": ["User type mismatch with existing account"]
}
```

### خطأ إكمال الملف الشخصي
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": ["Phone is required", "Address is required"]
}
```

## مثال على الاستخدام

### 1. تسجيل الدخول للمعلم
```javascript
// إرسال بيانات Google
const response = await fetch('/api/auth/google-auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    googleData: googleUserData,
    userType: 'teacher'
  })
});

const result = await response.json();

if (result.success) {
  // حفظ token
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

### 2. إكمال الملف الشخصي
```javascript
// إكمال بيانات المعلم
const profileResponse = await fetch('/api/auth/complete-profile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    phone: '1234567890',
    address: 'العنوان الكامل',
    bio: 'نبذة عن المعلم',
    experienceYears: 5,
    gradeIds: ['grade-uuid-1'],
    studyYear: '2024-2025'
  })
});
```

## الملفات المحدثة

### 1. **الكونترولر**
- `src/controllers/auth.controller.ts` - إضافة `googleAuth` و `completeProfile`

### 2. **السيرفس**
- `src/services/auth.service.ts` - إضافة منطق Google OAuth

### 3. **المسارات**
- `src/routes/auth.routes.ts` - إضافة المسارات الجديدة

### 4. **الأنواع**
- `src/types/index.ts` - إضافة `GoogleAuthRequest`

## الفوائد

1. **سهولة الاستخدام**: تسجيل دخول سريع عبر Google
2. **الأمان**: استخدام JWT tokens مخصصة
3. **المرونة**: دعم المعلمين والطلاب
4. **التحكم**: إدارة كاملة للبيانات والصلاحيات
5. **التوافق**: متوافق مع النظام الحالي

## ملاحظات مهمة

- النظام لا يستخدم Google tokens مباشرة
- يتم إنشاء JWT tokens مخصصة
- البيانات الحساسة محمية
- النظام متوافق مع البنية الحالية
- يمكن إضافة المزيد من مزودي OAuth لاحقاً

# تحديث نظام التحقق من إكمال الملف الشخصي

## نظرة عامة
تم تحديث نظام المصادقة ليتحقق من إكمال بيانات المستخدم في **جميع** طرق تسجيل الدخول، وليس فقط Google OAuth.

## التحديثات المطبقة

### 1. تحديث دالة تسجيل الدخول العادي
تم إضافة التحقق من إكمال الملف الشخصي إلى دالة `login` في `AuthService`:

```typescript
// في src/services/auth.service.ts
static async login(data: LoginRequest): Promise<ApiResponse> {
  // ... التحقق من بيانات الدخول ...
  
  // التحقق من إكمال الملف الشخصي
  const isProfileComplete = this.isProfileComplete(user);
  
  // إنشاء التوكن
  const token = await this.generateToken(user);
  
  return {
    success: true,
    data: {
      user: this.sanitizeUser(user),
      token,
      isProfileComplete: isProfileComplete,        // ✅ جديد
      requiresProfileCompletion: !isProfileComplete // ✅ جديد
    }
  };
}
```

### 2. تحديث رسائل الخطأ
تم تصحيح رسائل التوكن لتكون أكثر وضوحاً:

```typescript
// في src/utils/messages.ts
TOKEN_REQUIRED: 'التوكن مطلوب',           // كان: 'الرمز مطلوب'
NO_TOKEN_PROVIDED: 'لم يتم توفير التوكن', // كان: 'لم يتم توفير رمز'
TOKEN_NOT_FOUND: 'التوكن غير موجود أو منتهي الصلاحية',
TOKEN_VERIFICATION_FAILED: 'فشل في التحقق من التوكن',
```

## الاستجابة الجديدة لجميع طرق تسجيل الدخول

### تسجيل الدخول العادي
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**الاستجابة:**
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "name": "اسم المستخدم",
      "userType": "teacher",
      // ... باقي بيانات المستخدم
    },
    "token": "jwt-token-here",
    "isProfileComplete": false,        // ✅ جديد
    "requiresProfileCompletion": true  // ✅ جديد
  }
}
```

### Google OAuth
```bash
POST /api/auth/google-auth
Content-Type: application/json

{
  "googleData": { /* بيانات Google */ },
  "userType": "teacher"
}
```

**الاستجابة:**
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "user": { /* بيانات المستخدم */ },
    "token": "jwt-token-here",
    "isNewUser": false,
    "isProfileComplete": true,         // ✅ موجود مسبقاً
    "requiresProfileCompletion": false // ✅ موجود مسبقاً
  }
}
```

## منطق التحقق من إكمال الملف الشخصي

### للمعلمين
```typescript
private static isProfileComplete(user: User): boolean {
  if (user.userType === UserType.TEACHER) {
    return !!(
      user.phone && user.phone.trim() !== '' &&
      user.address && user.address.trim() !== '' &&
      user.bio && user.bio.trim() !== '' &&
      user.experienceYears !== null && user.experienceYears !== undefined
    );
  }
  // ...
}
```

**الحقول المطلوبة للمعلم:**
- `phone` - رقم الهاتف
- `address` - العنوان
- `bio` - السيرة الذاتية
- `experienceYears` - سنوات الخبرة

### للطلاب
```typescript
private static isProfileComplete(user: User): boolean {
  if (user.userType === UserType.STUDENT) {
    return !!(
      user.studentPhone && user.studentPhone.trim() !== '' &&
      user.parentPhone && user.parentPhone.trim() !== '' &&
      user.schoolName && user.schoolName.trim() !== ''
    );
  }
  // ...
}
```

**الحقول المطلوبة للطالب:**
- `studentPhone` - رقم هاتف الطالب
- `parentPhone` - رقم هاتف ولي الأمر
- `schoolName` - اسم المدرسة

## استخدام المتغيرات في الواجهة الأمامية

### Vue.js مثال
```javascript
// في دالة تسجيل الدخول
async login(credentials) {
  try {
    const response = await authAPI.login(credentials);
    
    if (response.data.success) {
      const { user, token, isProfileComplete, requiresProfileCompletion } = response.data.data;
      
      // حفظ التوكن
      localStorage.setItem('token', token);
      
      // التحقق من إكمال الملف الشخصي
      if (requiresProfileCompletion) {
        // توجيه المستخدم لصفحة إكمال الملف الشخصي
        this.$router.push('/complete-profile');
      } else {
        // توجيه المستخدم للوحة التحكم
        this.$router.push('/dashboard');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
  }
}
```

### React مثال
```javascript
// في دالة تسجيل الدخول
const handleLogin = async (credentials) => {
  try {
    const response = await authAPI.login(credentials);
    
    if (response.data.success) {
      const { user, token, isProfileComplete, requiresProfileCompletion } = response.data.data;
      
      // حفظ التوكن
      localStorage.setItem('token', token);
      
      // التحقق من إكمال الملف الشخصي
      if (requiresProfileCompletion) {
        // توجيه المستخدم لصفحة إكمال الملف الشخصي
        navigate('/complete-profile');
      } else {
        // توجيه المستخدم للوحة التحكم
        navigate('/dashboard');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
  }
};
```

## إكمال الملف الشخصي

### للمعلمين
```bash
POST /api/auth/complete-profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "1234567890",
  "address": "العنوان الكامل",
  "bio": "السيرة الذاتية",
  "experienceYears": 5,
  "grades": ["grade1", "grade2"],
  "subjects": ["subject1", "subject2"]
}
```

### للطلاب
```bash
POST /api/auth/complete-profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "studentPhone": "1234567890",
  "parentPhone": "0987654321",
  "schoolName": "اسم المدرسة",
  "gradeId": "grade-id",
  "studyYear": "2024-2025"
}
```

**الاستجابة بعد إكمال الملف الشخصي:**
```json
{
  "success": true,
  "message": "تم تحديث الملف الشخصي بنجاح",
  "data": {
    "user": { /* بيانات المستخدم المحدثة */ },
    "isProfileComplete": true,         // ✅ تم التحديث
    "requiresProfileCompletion": false // ✅ تم التحديث
  }
}
```

## المزايا الجديدة

### 1. التحقق الشامل
- ✅ التحقق من إكمال الملف الشخصي في جميع طرق تسجيل الدخول
- ✅ استجابة موحدة تحتوي على `isProfileComplete` و `requiresProfileCompletion`

### 2. تجربة مستخدم محسنة
- ✅ توجيه تلقائي لصفحة إكمال الملف الشخصي عند الحاجة
- ✅ منع الوصول للوحة التحكم بدون إكمال البيانات الأساسية

### 3. مرونة في التطوير
- ✅ إمكانية تخصيص الحقول المطلوبة لكل نوع مستخدم
- ✅ سهولة إضافة حقول جديدة للتحقق

## اختبار النظام

### 1. اختبار تسجيل الدخول العادي
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }'
```

### 2. اختبار Google OAuth
```bash
curl -X POST http://localhost:3000/api/auth/google-auth \
  -H "Content-Type: application/json" \
  -d '{
    "googleData": { /* بيانات Google */ },
    "userType": "teacher"
  }'
```

### 3. اختبار إكمال الملف الشخصي
```bash
curl -X POST http://localhost:3000/api/auth/complete-profile \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "1234567890",
    "address": "العنوان",
    "bio": "السيرة الذاتية",
    "experienceYears": 5
  }'
```

## ملاحظات مهمة

1. **التوافق مع الإصدارات السابقة**: جميع الاستجابات تحتوي على الحقول الجديدة
2. **الأمان**: التحقق من صحة التوكن في جميع الطلبات المحمية
3. **الأداء**: التحقق يتم محلياً بدون استعلامات إضافية لقاعدة البيانات
4. **المرونة**: يمكن تخصيص الحقول المطلوبة بسهولة

## الدعم والمساعدة

إذا واجهت أي مشاكل أو تحتاج مساعدة إضافية، يرجى:
1. التحقق من رسائل الخطأ في وحدة التحكم
2. التأكد من صحة التوكن المرسل
3. التحقق من اكتمال البيانات المطلوبة
4. مراجعة هذا الدليل للتأكد من الاستخدام الصحيح

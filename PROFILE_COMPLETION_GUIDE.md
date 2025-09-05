# دليل التحقق من إكمال الملف الشخصي

## نظرة عامة

تم إضافة متغير `isProfileComplete` للتحقق من إكمال بيانات المستخدم عند تسجيل الدخول عبر Google.

## المتغيرات الجديدة

### 1. **isProfileComplete (Boolean)**
- ✅ **true**: الملف الشخصي مكتمل
- ❌ **false**: الملف الشخصي غير مكتمل

### 2. **requiresProfileCompletion (Boolean)**
- ✅ **true**: يحتاج لإكمال الملف الشخصي
- ❌ **false**: لا يحتاج لإكمال الملف الشخصي

## معايير إكمال الملف الشخصي

### للمعلم (Teacher):
```typescript
// الحقول المطلوبة:
- phone: رقم الهاتف (غير فارغ)
- address: العنوان (غير فارغ)
- bio: السيرة الذاتية (غير فارغ)
- experienceYears: سنوات الخبرة (ليس null أو undefined)
```

### للطالب (Student):
```typescript
// الحقول المطلوبة:
- studentPhone: رقم هاتف الطالب (غير فارغ)
- parentPhone: رقم هاتف ولي الأمر (غير فارغ)
- schoolName: اسم المدرسة (غير فارغ)
```

## الاستجابة الجديدة

### 1. **للمستخدم الموجود (Existing User)**

```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "user": {
      "id": "cd126915-0da6-4db8-b9ae-2898ed903a0b",
      "name": "SJAD n",
      "email": "www.sjad.n@gmail.com",
      "userType": "teacher",
      "phone": "07901234567",        // ✅ مكتمل
      "address": "بغداد، العراق",     // ✅ مكتمل
      "bio": "معلم رياضيات",         // ✅ مكتمل
      "experienceYears": 5           // ✅ مكتمل
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isNewUser": false,
    "isProfileComplete": true,        // ✅ الملف مكتمل
    "requiresProfileCompletion": false // ❌ لا يحتاج إكمال
  }
}
```

### 2. **للمستخدم الجديد (New User)**

```json
{
  "success": true,
  "message": "تم إنشاء الحساب وتسجيل الدخول بنجاح",
  "data": {
    "user": {
      "id": "new-user-id",
      "name": "SJAD n",
      "email": "www.sjad.n@gmail.com",
      "userType": "teacher",
      "phone": "",                    // ❌ فارغ
      "address": "",                  // ❌ فارغ
      "bio": "",                      // ❌ فارغ
      "experienceYears": 0            // ❌ فارغ
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isNewUser": true,
    "isProfileComplete": false,       // ❌ الملف غير مكتمل
    "requiresProfileCompletion": true  // ✅ يحتاج إكمال
  }
}
```

### 3. **بعد إكمال الملف الشخصي**

```json
{
  "success": true,
  "message": "تم تحديث الملف الشخصي بنجاح",
  "data": {
    "user": {
      "id": "user-id",
      "name": "SJAD n",
      "email": "www.sjad.n@gmail.com",
      "userType": "teacher",
      "phone": "07901234567",        // ✅ تم ملؤه
      "address": "بغداد، العراق",     // ✅ تم ملؤه
      "bio": "معلم رياضيات",         // ✅ تم ملؤه
      "experienceYears": 5           // ✅ تم ملؤه
    },
    "isProfileComplete": true,        // ✅ أصبح مكتملاً
    "requiresProfileCompletion": false // ❌ لا يحتاج إكمال
  }
}
```

## استخدام المتغيرات في Frontend

### 1. **Vue.js Example**

```vue
<template>
  <div>
    <!-- رسالة ترحيب -->
    <div v-if="user.isProfileComplete" class="welcome-complete">
      <h2>مرحباً {{ user.name }}!</h2>
      <p>ملفك الشخصي مكتمل</p>
    </div>
    
    <!-- رسالة إكمال الملف -->
    <div v-else class="profile-incomplete">
      <h2>مرحباً {{ user.name }}!</h2>
      <p>يرجى إكمال ملفك الشخصي</p>
      <button @click="completeProfile">إكمال الملف الشخصي</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const user = ref(null);
const isProfileComplete = ref(false);

const handleGoogleLogin = async (googleData) => {
  try {
    const response = await fetch('/api/auth/google-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleData, userType: 'teacher' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      user.value = result.data.user;
      isProfileComplete.value = result.data.isProfileComplete;
      
      // توجيه المستخدم حسب حالة الملف
      if (result.data.requiresProfileCompletion) {
        // توجيه لصفحة إكمال الملف
        router.push('/complete-profile');
      } else {
        // توجيه للداشبورد
        router.push('/dashboard');
      }
    }
  } catch (error) {
    console.error('Login error:', error);
  }
};
</script>
```

### 2. **React Example**

```jsx
import { useState, useEffect } from 'react';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);

  useEffect(() => {
    const handleGoogleLogin = async (googleData) => {
      try {
        const response = await fetch('/api/auth/google-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleData, userType: 'teacher' })
        });
        
        const result = await response.json();
        
        if (result.success) {
          setUser(result.data.user);
          setIsProfileComplete(result.data.isProfileComplete);
          
          // توجيه المستخدم
          if (result.data.requiresProfileCompletion) {
            navigate('/complete-profile');
          } else {
            navigate('/dashboard');
          }
        }
      } catch (error) {
        console.error('Login error:', error);
      }
    };
  }, []);

  return (
    <div>
      {isProfileComplete ? (
        <div className="welcome-complete">
          <h2>مرحباً {user?.name}!</h2>
          <p>ملفك الشخصي مكتمل</p>
        </div>
      ) : (
        <div className="profile-incomplete">
          <h2>مرحباً {user?.name}!</h2>
          <p>يرجى إكمال ملفك الشخصي</p>
          <button onClick={() => navigate('/complete-profile')}>
            إكمال الملف الشخصي
          </button>
        </div>
      )}
    </div>
  );
};
```

### 3. **JavaScript Vanilla Example**

```javascript
const handleGoogleLogin = async (googleData) => {
  try {
    const response = await fetch('/api/auth/google-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleData, userType: 'teacher' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      const { user, isProfileComplete, requiresProfileCompletion } = result.data;
      
      // حفظ البيانات
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('isProfileComplete', isProfileComplete);
      
      // توجيه المستخدم
      if (requiresProfileCompletion) {
        window.location.href = '/complete-profile.html';
      } else {
        window.location.href = '/dashboard.html';
      }
    }
  } catch (error) {
    console.error('Login error:', error);
  }
};

// استخدام البيانات المحفوظة
const user = JSON.parse(localStorage.getItem('user'));
const isProfileComplete = localStorage.getItem('isProfileComplete') === 'true';

if (isProfileComplete) {
  document.getElementById('welcome-message').innerHTML = 
    `<h2>مرحباً ${user.name}!</h2><p>ملفك الشخصي مكتمل</p>`;
} else {
  document.getElementById('welcome-message').innerHTML = 
    `<h2>مرحباً ${user.name}!</h2><p>يرجى إكمال ملفك الشخصي</p>`;
}
```

## منطق التحقق

### دالة التحقق من إكمال الملف:

```typescript
private static isProfileComplete(user: User): boolean {
  if (user.userType === UserType.TEACHER) {
    // التحقق من حقول المعلم
    return !!(
      user.phone &&
      user.phone.trim() !== '' &&
      user.address &&
      user.address.trim() !== '' &&
      user.bio &&
      user.bio.trim() !== '' &&
      user.experienceYears !== null &&
      user.experienceYears !== undefined
    );
  } else if (user.userType === UserType.STUDENT) {
    // التحقق من حقول الطالب
    return !!(
      user.studentPhone &&
      user.studentPhone.trim() !== '' &&
      user.parentPhone &&
      user.parentPhone.trim() !== '' &&
      user.schoolName &&
      user.schoolName.trim() !== ''
    );
  }
  return false;
}
```

## التدفق الكامل

### 1. **تسجيل الدخول للمستخدم الموجود**
```
Google Login → Check User → Check Profile → Return Status
```

### 2. **إنشاء مستخدم جديد**
```
Google Login → Create User → Profile Incomplete → Return Status
```

### 3. **إكمال الملف الشخصي**
```
Complete Profile → Update User → Check Profile → Return Status
```

## أمثلة على الاستخدام

### 1. **التحقق من حالة الملف**

```javascript
// في Frontend
if (result.data.isProfileComplete) {
  // الملف مكتمل - السماح بالوصول الكامل
  showFullDashboard();
} else {
  // الملف غير مكتمل - طلب إكمال الملف
  showProfileCompletionPrompt();
}
```

### 2. **توجيه المستخدم**

```javascript
// في Frontend
if (result.data.requiresProfileCompletion) {
  // توجيه لصفحة إكمال الملف
  window.location.href = '/complete-profile';
} else {
  // توجيه للداشبورد الرئيسي
  window.location.href = '/dashboard';
}
```

### 3. **عرض المحتوى المناسب**

```javascript
// في Frontend
const showContent = () => {
  if (user.isProfileComplete) {
    return <FullDashboardContent />;
  } else {
    return <ProfileCompletionPrompt />;
  }
};
```

## الخلاصة

✅ **تم إضافة متغير `isProfileComplete`** للتحقق من إكمال الملف الشخصي

✅ **تم إضافة متغير `requiresProfileCompletion`** لتوجيه المستخدم

✅ **التحقق يعمل للمعلمين والطلاب** حسب الحقول المطلوبة

✅ **التحديث التلقائي** بعد إكمال الملف الشخصي

✅ **سهولة الاستخدام في Frontend** مع أمثلة شاملة

الآن يمكن للـ Frontend التحقق من حالة إكمال الملف الشخصي وتوجيه المستخدم accordingly! 🎯

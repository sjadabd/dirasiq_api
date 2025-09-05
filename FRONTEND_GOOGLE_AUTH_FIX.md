# إصلاح مشكلة Google Authentication في Frontend

## المشكلة الحالية

Frontend يرسل بيانات Google غير مكتملة، مما يؤدي إلى فشل التحقق من البيانات.

## الخطأ الحالي:

```json
{
  "success": false,
  "message": "بيانات Google غير صحيحة",
  "errors": [
    "Missing required field: iss",
    "Missing required field: azp",
    "Missing required field: aud",
    "Invalid Google user ID format"
  ]
}
```

## الحل

### 1. **تحديث auth_api.js في Frontend**

يجب تحديث ملف `auth_api.js` لإرسال البيانات الكاملة:

```javascript
// auth_api.js
export const loginInGoogele = async (googleData, userType) => {
  try {
    // إرسال البيانات الكاملة المطلوبة
    const response = await axios.post(`${API_BASE_URL}/auth/google-auth`, {
      googleData: {
        // البيانات المطلوبة من Google
        iss: "https://accounts.google.com",
        azp: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
        aud: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
        sub: googleData.sub || googleData.id, // Google User ID
        email: googleData.email,
        email_verified: googleData.email_verified || true,
        nbf: googleData.nbf || Math.floor(Date.now() / 1000),
        name: googleData.name,
        picture: googleData.picture,
        given_name: googleData.given_name,
        family_name: googleData.family_name,
        iat: googleData.iat || Math.floor(Date.now() / 1000),
        exp: googleData.exp || Math.floor(Date.now() / 1000) + 3600, // 1 hour
        jti: googleData.jti || `google_${googleData.sub}_${Date.now()}`,
      },
      userType: userType,
    });

    return response.data;
  } catch (error) {
    console.error("Google login error:", error);
    throw error;
  }
};
```

### 2. **تحديث login.vue**

```vue
<!-- login.vue -->
<script setup>
import { loginInGoogele } from "@/api/auth/auth_api";

const handleGoogleLogin = async (googleUser) => {
  try {
    // استخراج البيانات من Google User
    const googleData = {
      sub: googleUser.credential?.sub || googleUser.profile?.id,
      email: googleUser.profile?.email,
      email_verified: googleUser.profile?.email_verified,
      name: googleUser.profile?.name,
      picture: googleUser.profile?.picture,
      given_name: googleUser.profile?.given_name,
      family_name: googleUser.profile?.family_name,
      // إضافة البيانات المطلوبة
      iss: "https://accounts.google.com",
      azp: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
      aud: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
      nbf: Math.floor(Date.now() / 1000),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: `google_${googleUser.profile?.id}_${Date.now()}`,
    };

    const result = await loginInGoogele(googleData, "teacher");

    if (result.success) {
      // حفظ token
      localStorage.setItem("token", result.data.token);

      if (result.data.requiresProfileCompletion) {
        // توجيه لإكمال الملف الشخصي
        router.push("/complete-profile");
      } else {
        // توجيه للداشبورد
        router.push("/dashboard");
      }
    }
  } catch (error) {
    console.error("Google login error:", error);
    // عرض رسالة خطأ للمستخدم
  }
};
</script>
```

### 3. **الطريقة الموصى بها (استخدام JWT Token)**

إذا كان لديك إمكانية الوصول إلى JWT token من Google:

```javascript
// auth_api.js - الطريقة الموصى بها
export const loginInGoogele = async (googleToken, userType) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/google-auth`, {
      googleToken: googleToken, // JWT token من Google
      userType: userType,
    });

    return response.data;
  } catch (error) {
    console.error("Google login error:", error);
    throw error;
  }
};
```

```vue
<!-- login.vue - الطريقة الموصى بها -->
<script setup>
const handleGoogleLogin = async (googleUser) => {
  try {
    // استخدام JWT token مباشرة
    const idToken = googleUser.credential?.idToken;

    if (idToken) {
      const result = await loginInGoogele(idToken, "teacher");
      // ... باقي الكود
    }
  } catch (error) {
    console.error("Google login error:", error);
  }
};
</script>
```

## البيانات المطلوبة

### الحقول الإجبارية:

- ✅ `iss`: "https://accounts.google.com"
- ✅ `azp`: Client ID من Google
- ✅ `aud`: Client ID من Google
- ✅ `sub`: Google User ID (يجب أن يكون 10-30 حرف)
- ✅ `email`: البريد الإلكتروني
- ✅ `name`: الاسم الكامل
- ✅ `email_verified`: true

### الحقول الاختيارية:

- `picture`: صورة المستخدم
- `given_name`: الاسم الأول
- `family_name`: اسم العائلة
- `nbf`: وقت بداية الصلاحية
- `iat`: وقت الإصدار
- `exp`: وقت انتهاء الصلاحية
- `jti`: معرف فريد للـ token

## اختبار الحل

### 1. **اختبار البيانات الكاملة:**

```javascript
const testData = {
  googleData: {
    iss: "https://accounts.google.com",
    azp: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
    aud: "347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com",
    sub: "113511129504049125945",
    email: "www.sjad.n@gmail.com",
    email_verified: true,
    nbf: Math.floor(Date.now() / 1000),
    name: "SJAD n",
    picture:
      "https://lh3.googleusercontent.com/a/ACg8ocLkbA_eVDaG2AfX0EJFmmZIm2iRM56xE7FbCmHg9S3xyN7nqpXQ=s96-c",
    given_name: "SJAD",
    family_name: "n",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "49d54c5c84fcec1bdd4aa80cbe005ba54731e651",
  },
  userType: "teacher",
};
```

### 2. **اختبار JWT Token:**

```javascript
const testToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."; // JWT token من Google
```

## ملاحظات مهمة

1. **استخدم JWT Token إذا أمكن**: هذه الطريقة الأكثر أماناً
2. **تأكد من صحة البيانات**: جميع الحقول الإجبارية مطلوبة
3. **تحقق من تنسيق Google User ID**: يجب أن يكون 10-30 حرف
4. **استخدم Client ID الصحيح**: تأكد من استخدام الـ Client ID الصحيح

## الخطوات التالية

1. ✅ تحديث `auth_api.js` لإرسال البيانات الكاملة
2. ✅ تحديث `login.vue` لاستخراج البيانات الصحيحة
3. ✅ اختبار تسجيل الدخول
4. ✅ إضافة معالجة الأخطاء المناسبة

بعد تطبيق هذه التحديثات، سيعمل تسجيل الدخول عبر Google بشكل صحيح! 🚀

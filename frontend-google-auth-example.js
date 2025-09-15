// مثال كامل لـ Google Authentication في Frontend
// ضع هذا الكود في ملف auth_api.js

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// الطريقة الموصى بها: استخدام JWT Token من Google
export const loginInGoogleWithToken = async (googleToken, userType) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/google-auth`, {
      googleToken: googleToken, // JWT token من Google
      userType: userType,
    });

    return response.data;
  } catch (error) {
    console.error('Google login error:', error);
    throw error;
  }
};

// الطريقة الاحتياطية: إرسال البيانات مباشرة
export const loginInGoogleWithData = async (googleUserData, userType) => {
  try {
    // إعداد البيانات المطلوبة
    const googleData = {
      // البيانات الإجبارية
      iss: 'https://accounts.google.com',
      azp: '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com',
      aud: '347174406018-8q0gaa0spce1hr7rsa1okge2or0sd6br.apps.googleusercontent.com',
      sub: googleUserData.sub || googleUserData.id, // Google User ID
      email: googleUserData.email,
      email_verified: googleUserData.email_verified !== false, // افتراض true إذا لم يتم تحديده
      name: googleUserData.name,

      // البيانات الاختيارية
      picture: googleUserData.picture,
      given_name: googleUserData.given_name,
      family_name: googleUserData.family_name,

      // التوقيتات (استخدام القيم الحالية إذا لم تكن متوفرة)
      nbf: googleUserData.nbf || Math.floor(Date.now() / 1000),
      iat: googleUserData.iat || Math.floor(Date.now() / 1000),
      exp: googleUserData.exp || Math.floor(Date.now() / 1000) + 3600, // ساعة واحدة
      jti:
        googleUserData.jti ||
        `google_${googleUserData.sub || googleUserData.id}_${Date.now()}`,
    };

    const response = await axios.post(`${API_BASE_URL}/auth/google-auth`, {
      googleData: googleData,
      userType: userType,
    });

    return response.data;
  } catch (error) {
    console.error('Google login error:', error);
    throw error;
  }
};

// دالة مساعدة لاستخراج البيانات من Google User Object
export const extractGoogleData = googleUser => {
  // إذا كان لديك JWT token
  if (googleUser.credential?.idToken) {
    return {
      type: 'token',
      data: googleUser.credential.idToken,
    };
  }

  // إذا كان لديك بيانات المستخدم
  if (googleUser.profile) {
    return {
      type: 'data',
      data: {
        sub: googleUser.profile.id,
        email: googleUser.profile.email,
        email_verified: googleUser.profile.email_verified,
        name: googleUser.profile.name,
        picture: googleUser.profile.picture,
        given_name: googleUser.profile.given_name,
        family_name: googleUser.profile.family_name,
      },
    };
  }

  // إذا كان لديك بيانات مباشرة
  if (googleUser.sub || googleUser.id) {
    return {
      type: 'data',
      data: googleUser,
    };
  }

  throw new Error('Invalid Google user data format');
};

// دالة رئيسية للتعامل مع جميع أنواع بيانات Google
export const loginInGoogle = async (googleUser, userType) => {
  try {
    const extracted = extractGoogleData(googleUser);

    if (extracted.type === 'token') {
      return await loginInGoogleWithToken(extracted.data, userType);
    } else {
      return await loginInGoogleWithData(extracted.data, userType);
    }
  } catch (error) {
    console.error('Google login error:', error);
    throw error;
  }
};

// مثال للاستخدام في Vue.js
export const handleGoogleLogin = async (googleUser, userType = 'teacher') => {
  try {
    const result = await loginInGoogle(googleUser, userType);

    if (result.success) {
      // حفظ token في localStorage
      localStorage.setItem('token', result.data.token);

      // توجيه المستخدم حسب الحالة
      if (result.data.requiresProfileCompletion) {
        // توجيه لإكمال الملف الشخصي
        return { redirect: '/complete-profile', user: result.data.user };
      } else {
        // توجيه للداشبورد
        return { redirect: '/dashboard', user: result.data.user };
      }
    } else {
      // عرض رسالة خطأ
      console.error('Login failed:', result.message);
      return { error: result.message };
    }
  } catch (error) {
    console.error('Google login error:', error);
    return { error: 'حدث خطأ أثناء تسجيل الدخول' };
  }
};

// مثال للاستخدام في React
export const useGoogleLogin = () => {
  const login = async (googleUser, userType = 'teacher') => {
    try {
      const result = await loginInGoogle(googleUser, userType);

      if (result.success) {
        localStorage.setItem('token', result.data.token);
        return { success: true, data: result.data };
      } else {
        return { success: false, error: result.message };
      }
    } catch (error) {
      return { success: false, error: 'حدث خطأ أثناء تسجيل الدخول' };
    }
  };

  return { login };
};

// مثال للاستخدام في vanilla JavaScript
export const setupGoogleLogin = (buttonId, userType = 'teacher') => {
  const button = document.getElementById(buttonId);

  if (button) {
    button.addEventListener('click', async () => {
      try {
        // هنا يجب استدعاء Google Sign-In
        // const googleUser = await signInWithGoogle();
        // const result = await handleGoogleLogin(googleUser, userType);
      } catch (error) {
        console.error('Google login error:', error);
      }
    });
  }
};

// تصدير جميع الدوال
export default {
  loginInGoogleWithToken,
  loginInGoogleWithData,
  loginInGoogle,
  handleGoogleLogin,
  useGoogleLogin,
  setupGoogleLogin,
  extractGoogleData,
};

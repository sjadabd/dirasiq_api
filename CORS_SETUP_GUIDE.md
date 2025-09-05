# دليل إعداد CORS للوصول من Frontend

## نظرة عامة

تم إعداد CORS (Cross-Origin Resource Sharing) للسماح للـ Frontend على `http://localhost:5173` بالوصول إلى API.

## الإعدادات المطبقة

### 1. **CORS Configuration في `src/index.ts`**

```typescript
// CORS configuration
const allowedOrigins = process.env['NODE_ENV'] === 'production'
  ? ['https://yourdomain.com'] // Replace with your frontend domain
  : [
      'http://localhost:3000', 
      'http://localhost:3001', 
      'http://localhost:5173',
      process.env['FRONTEND_URL'] || 'http://localhost:5173'
    ].filter((origin, index, self) => self.indexOf(origin) === index); // Remove duplicates

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
}));
```

### 2. **Preflight Requests Handling**

```typescript
// Handle preflight requests
app.options('*', cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

### 3. **Manual CORS Headers**

```typescript
// Additional CORS middleware for manual header setting
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Expose-Headers', 'Authorization');
  
  next();
});
```

## متغيرات البيئة

### في `env.example`:

```env
# CORS Configuration
FRONTEND_URL=http://localhost:5173
```

### في ملف `.env` الخاص بك:

```env
FRONTEND_URL=http://localhost:5173
```

## المنافذ المسموحة

### Development Mode:
- ✅ `http://localhost:3000` (Backend default)
- ✅ `http://localhost:3001` (Alternative backend)
- ✅ `http://localhost:5173` (Vite default)
- ✅ `http://localhost:8080` (إذا تم تحديده في FRONTEND_URL)

### Production Mode:
- ✅ `https://yourdomain.com` (يجب تحديثه لاسم النطاق الحقيقي)

## الطرق المسموحة

- ✅ `GET`
- ✅ `POST`
- ✅ `PUT`
- ✅ `DELETE`
- ✅ `PATCH`
- ✅ `OPTIONS` (للـ preflight requests)

## Headers المسموحة

### Request Headers:
- ✅ `Content-Type`
- ✅ `Authorization`
- ✅ `X-Requested-With`

### Response Headers:
- ✅ `Authorization` (exposed)

## إعدادات الأمان

### 1. **Credentials Support**
```typescript
credentials: true
```
- يسمح بإرسال cookies و authentication headers

### 2. **Origin Validation**
```typescript
if (origin && allowedOrigins.includes(origin)) {
  res.header('Access-Control-Allow-Origin', origin);
}
```
- التحقق من صحة Origin قبل السماح بالوصول

### 3. **Method Validation**
- فقط الطرق المحددة مسموحة
- منع الطرق الخطيرة

## اختبار CORS

### 1. **اختبار Preflight Request**

```bash
# باستخدام curl
curl -X OPTIONS \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v http://localhost:3000/api/auth/google-auth
```

### 2. **اختبار من Frontend**

```javascript
// في Frontend
fetch('http://localhost:3000/api/auth/google-auth', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // مهم للـ cookies
  body: JSON.stringify({
    googleData: { /* ... */ },
    userType: 'teacher'
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

### 3. **اختبار باستخدام Axios**

```javascript
// في Frontend
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  withCredentials: true, // مهم للـ cookies
  headers: {
    'Content-Type': 'application/json',
  }
});

// استخدام API
api.post('/auth/google-auth', {
  googleData: { /* ... */ },
  userType: 'teacher'
})
.then(response => console.log(response.data))
.catch(error => console.error('Error:', error));
```

## استكشاف الأخطاء

### 1. **خطأ CORS في المتصفح**

```
Access to fetch at 'http://localhost:3000/api/auth/google-auth' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**الحل:**
- تأكد من أن `http://localhost:5173` موجود في `allowedOrigins`
- تأكد من إعادة تشغيل السيرفر بعد التغييرات

### 2. **خطأ Preflight Request**

```
Response to preflight request doesn't pass access control check
```

**الحل:**
- تأكد من وجود `app.options('*', cors(...))`
- تأكد من أن الطريقة والـ headers مسموحة

### 3. **خطأ Credentials**

```
The value of the 'Access-Control-Allow-Credentials' header is 'true' 
but the 'Access-Control-Allow-Origin' header is '*'
```

**الحل:**
- لا تستخدم `*` مع `credentials: true`
- استخدم قائمة محددة من الـ origins

## إعدادات إضافية للـ Frontend

### 1. **Vite Configuration**

```javascript
// vite.config.js
export default {
  server: {
    port: 5173,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  }
}
```

### 2. **Axios Configuration**

```javascript
// api/config.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' 
    ? 'https://yourdomain.com/api' 
    : 'http://localhost:3000/api',
  withCredentials: true,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

## الإنتاج

### 1. **تحديث Allowed Origins**

```typescript
// في src/index.ts
const allowedOrigins = process.env['NODE_ENV'] === 'production'
  ? [
      'https://yourdomain.com',
      'https://www.yourdomain.com',
      'https://app.yourdomain.com'
    ]
  : [
      'http://localhost:3000', 
      'http://localhost:3001', 
      'http://localhost:5173'
    ];
```

### 2. **متغيرات البيئة للإنتاج**

```env
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
```

## الخلاصة

✅ **CORS مُعد بشكل صحيح** للسماح بالوصول من `http://localhost:5173`

✅ **جميع الطرق والـ headers مسموحة**

✅ **Credentials مدعومة** للـ authentication

✅ **Preflight requests مُعالجة**

✅ **أمان محفوظ** مع التحقق من الـ origins

الآن يمكن للـ Frontend على `http://localhost:5173` الوصول إلى API بدون مشاكل CORS! 🚀

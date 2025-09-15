# دليل استخدام API للإشعارات

## 🔐 المصادقة (Authentication)

جميع طلبات API تتطلب رمز مصادقة في الـ header:

```bash
Authorization: Bearer <your_jwt_token>
```

### الحصول على رمز المصادقة:

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
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## 📱 تسجيل OneSignal Player ID

### 1. في Frontend (JavaScript):

```javascript
// بعد تسجيل الدخول
const token = localStorage.getItem('authToken');

// الحصول على OneSignal Player ID
OneSignal.getUserId().then(playerId => {
  if (playerId) {
    // إرسال Player ID إلى الخادم
    fetch('/api/user/onesignal-player-id', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        oneSignalPlayerId: playerId
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log('OneSignal Player ID registered successfully');
      }
    });
  }
});
```

### 2. في React Native:

```javascript
import OneSignal from 'react-native-onesignal';

// بعد تسجيل الدخول
const token = await AsyncStorage.getItem('authToken');

OneSignal.getDeviceState().then(deviceState => {
  if (deviceState.userId) {
    fetch('http://your-api-url/api/user/onesignal-player-id', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        oneSignalPlayerId: deviceState.userId
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log('OneSignal Player ID registered:', data);
    });
  }
});
```

### 3. اختبار API مباشرة:

```bash
# 1. تسجيل الدخول أولاً
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }'

# 2. استخدام الـ token المُستلم
curl -X PUT http://localhost:3000/api/user/onesignal-player-id \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "oneSignalPlayerId": "test-player-id-123"
  }'
```

## 🔔 إرسال الإشعارات

### 1. إرسال إشعار لجميع المستخدمين:

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-all \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "إشعار عام",
    "message": "هذا إشعار لجميع المستخدمين",
    "type": "system_announcement",
    "priority": "high"
  }'
```

### 2. إرسال إشعار للمعلمين فقط:

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "إشعار للمعلمين",
    "message": "هذا إشعار للمعلمين فقط",
    "type": "teacher_message",
    "priority": "medium"
  }'
```

### 3. إرسال إشعار لمستخدمين محددين:

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-specific \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "إشعار مخصص",
    "message": "هذا إشعار لمستخدمين محددين",
    "type": "teacher_message",
    "priority": "high",
    "recipientType": "specific_teachers",
    "recipientIds": ["user-id-1", "user-id-2"]
  }'
```

## 📊 مراقبة الإشعارات

### 1. عرض إحصائيات الإشعارات (للسوبر أدمن):

```bash
curl -X GET http://localhost:3000/api/notifications/statistics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. عرض إشعارات المستخدم:

```bash
curl -X GET "http://localhost:3000/api/notifications/user/my-notifications?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. عرض جميع الإشعارات (للسوبر أدمن):

```bash
curl -X GET "http://localhost:3000/api/notifications?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🧪 اختبار النظام

### 1. إنشاء حجز جديد (سيؤدي إلى إشعار تلقائي):

```bash
curl -X POST http://localhost:3000/api/student/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer STUDENT_JWT_TOKEN" \
  -d '{
    "courseId": "course-id-here",
    "studentMessage": "أريد حجز هذه الدورة"
  }'
```

### 2. التحقق من سجلات الخادم:

```bash
# في terminal الخادم، ستظهر رسائل مثل:
# ✅ New booking notification sent to teacher [teacher-id] for booking [booking-id]
# أو
# No valid player IDs found for user IDs: [ 'teacher-id' ]
```

## 🔧 استكشاف الأخطاء

### 1. خطأ 401 Unauthorized:

**السبب:** رمز المصادقة مفقود أو غير صحيح

**الحل:**
- تأكد من إرسال `Authorization: Bearer <token>` في الـ header
- تأكد من صحة الـ token
- سجل دخول جديد إذا انتهت صلاحية الـ token

### 2. خطأ 403 Forbidden:

**السبب:** المستخدم لا يملك الصلاحيات المطلوبة

**الحل:**
- تأكد من نوع المستخدم (teacher, student, super_admin)
- استخدم حساب له الصلاحيات المطلوبة

### 3. "No valid player IDs found":

**السبب:** المستخدمون لا يملكون OneSignal Player IDs

**الحل:**
- سجل OneSignal Player IDs للمستخدمين
- تأكد من تهيئة OneSignal في Frontend

## 📝 أمثلة كاملة

### Frontend React Example:

```javascript
class NotificationService {
  constructor() {
    this.baseURL = 'http://localhost:3000/api';
    this.token = localStorage.getItem('authToken');
  }

  async registerOneSignalPlayerId(playerId) {
    const response = await fetch(`${this.baseURL}/user/onesignal-player-id`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ oneSignalPlayerId: playerId })
    });
    
    return response.json();
  }

  async sendNotificationToTeachers(title, message) {
    const response = await fetch(`${this.baseURL}/notifications/send-to-teachers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        title,
        message,
        type: 'teacher_message',
        priority: 'high'
      })
    });
    
    return response.json();
  }
}

// الاستخدام
const notificationService = new NotificationService();

// تسجيل OneSignal Player ID
OneSignal.getUserId().then(playerId => {
  if (playerId) {
    notificationService.registerOneSignalPlayerId(playerId);
  }
});
```

---

**تذكر:** دائماً تأكد من إرسال رمز المصادقة في الـ header! 🔐

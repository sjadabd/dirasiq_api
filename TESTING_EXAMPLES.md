# أمثلة اختبار API للإشعارات

## 🚀 اختبار سريع باستخدام curl

### 1. تسجيل الدخول والحصول على Token:

```bash
# تسجيل دخول معلم
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }'

# استجابة:
# {
#   "success": true,
#   "data": {
#     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#     "user": { ... }
#   }
# }
```

### 2. تسجيل OneSignal Player ID:

```bash
# استبدل YOUR_TOKEN_HERE بالـ token المُستلم من الخطوة السابقة
curl -X PUT http://localhost:3000/api/user/onesignal-player-id \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "oneSignalPlayerId": "test-player-id-12345"
  }'

# استجابة ناجحة:
# {
#   "success": true,
#   "message": "OneSignal player ID updated successfully"
# }
```

### 3. اختبار إرسال إشعار:

```bash
# إرسال إشعار للمعلمين
curl -X POST http://localhost:3000/api/notifications/send-to-teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "title": "اختبار الإشعارات",
    "message": "هذا اختبار لنظام الإشعارات",
    "type": "teacher_message",
    "priority": "high"
  }'
```

### 4. إنشاء حجز جديد (لاختبار الإشعارات التلقائية):

```bash
# تسجيل دخول طالب
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "password123"
  }'

# إنشاء حجز جديد (سيؤدي إلى إشعار تلقائي للمعلم)
curl -X POST http://localhost:3000/api/student/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer STUDENT_TOKEN_HERE" \
  -d '{
    "courseId": "course-id-here",
    "studentMessage": "أريد حجز هذه الدورة للاختبار"
  }'
```

## 📱 اختبار باستخدام Postman

### 1. إعداد Environment Variables:

```json
{
  "base_url": "http://localhost:3000/api",
  "teacher_token": "YOUR_TEACHER_TOKEN",
  "student_token": "YOUR_STUDENT_TOKEN",
  "admin_token": "YOUR_ADMIN_TOKEN"
}
```

### 2. Collection للإشعارات:

#### تسجيل OneSignal Player ID:
```
PUT {{base_url}}/user/onesignal-player-id
Headers:
  Authorization: Bearer {{teacher_token}}
  Content-Type: application/json

Body:
{
  "oneSignalPlayerId": "test-player-id-12345"
}
```

#### إرسال إشعار للمعلمين:
```
POST {{base_url}}/notifications/send-to-teachers
Headers:
  Authorization: Bearer {{teacher_token}}
  Content-Type: application/json

Body:
{
  "title": "إشعار اختبار",
  "message": "هذا إشعار اختبار للمعلمين",
  "type": "teacher_message",
  "priority": "high"
}
```

#### عرض إحصائيات الإشعارات:
```
GET {{base_url}}/notifications/statistics
Headers:
  Authorization: Bearer {{admin_token}}
```

## 🧪 اختبار JavaScript في المتصفح

### 1. فتح Developer Console في المتصفح:

```javascript
// تسجيل الدخول
async function login(email, password) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('authToken', data.data.token);
    console.log('Login successful:', data.data.user);
    return data.data.token;
  }
}

// تسجيل OneSignal Player ID
async function registerOneSignalPlayerId(playerId) {
  const token = localStorage.getItem('authToken');
  const response = await fetch('http://localhost:3000/api/user/onesignal-player-id', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ oneSignalPlayerId: playerId })
  });
  
  const data = await response.json();
  console.log('OneSignal registration result:', data);
  return data;
}

// إرسال إشعار
async function sendNotification(title, message) {
  const token = localStorage.getItem('authToken');
  const response = await fetch('http://localhost:3000/api/notifications/send-to-teachers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      title,
      message,
      type: 'teacher_message',
      priority: 'high'
    })
  });
  
  const data = await response.json();
  console.log('Notification result:', data);
  return data;
}

// الاستخدام
login('teacher@example.com', 'password123')
  .then(token => {
    console.log('Token:', token);
    // تسجيل OneSignal Player ID
    return registerOneSignalPlayerId('test-player-id-12345');
  })
  .then(() => {
    // إرسال إشعار
    return sendNotification('اختبار', 'هذا اختبار للإشعارات');
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

## 🔍 مراقبة النتائج

### 1. في سجلات الخادم:

```bash
# ستظهر رسائل مثل:
✅ OneSignal notification sent successfully
# أو
No valid player IDs found for user IDs: [ 'user-id' ]
```

### 2. في قاعدة البيانات:

```sql
-- التحقق من OneSignal Player IDs
SELECT id, name, onesignal_player_id 
FROM users 
WHERE onesignal_player_id IS NOT NULL;

-- عرض الإشعارات الأخيرة
SELECT id, title, type, status, created_at 
FROM notifications 
ORDER BY created_at DESC 
LIMIT 5;
```

### 3. في OneSignal Dashboard:

- انتقل إلى [OneSignal Dashboard](https://app.onesignal.com)
- تحقق من قسم "Notifications" لرؤية الإشعارات المرسلة
- تحقق من قسم "Audience" لرؤية المستخدمين المسجلين

## ⚠️ نصائح مهمة

1. **تأكد من إرسال Authorization header** في جميع الطلبات
2. **استخدم tokens صحيحة** من تسجيل الدخول
3. **تحقق من نوع المستخدم** (teacher, student, admin) للصلاحيات
4. **راجع سجلات الخادم** لمعرفة تفاصيل الأخطاء
5. **اختبر OneSignal Player IDs** قبل إرسال الإشعارات

---

**الآن يمكنك اختبار النظام بالكامل! 🚀**

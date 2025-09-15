# دليل استكشاف أخطاء OneSignal

## 🔍 الأخطاء الشائعة وحلولها

### 1. خطأ "Creating a User requires at least one Alias or Subscription"

**السبب:** OneSignal يتطلب إما `include_player_ids` أو `included_segments` أو `include_external_user_ids` عند إرسال الإشعارات.

**الحل:**
```javascript
// تأكد من وجود player IDs صحيحة
const validPlayerIds = playerIds.filter(id => id && id.trim().length > 0);
if (validPlayerIds.length === 0) {
  console.warn('No valid player IDs found');
  return false;
}

// أو استخدم segments
const notification = {
  app_id: appId,
  included_segments: ['All'], // أو ['Active Users', 'Inactive Users']
  // ... باقي البيانات
};
```

### 2. خطأ "No valid player IDs found"

**السبب:** المستخدمون لا يملكون OneSignal Player IDs مُسجلة.

**الحل:**
1. **تأكد من تسجيل Player ID:**
```bash
PUT /api/user/onesignal-player-id
Authorization: Bearer <token>
{
  "oneSignalPlayerId": "player-id-from-onesignal"
}
```

2. **تحقق من قاعدة البيانات:**
```sql
SELECT id, name, onesignal_player_id 
FROM users 
WHERE onesignal_player_id IS NOT NULL;
```

3. **في Frontend، تأكد من تهيئة OneSignal:**
```javascript
// React Web
OneSignal.getUserId().then(userId => {
  if (userId) {
    // إرسال إلى الخادم
    updateOneSignalPlayerId(userId);
  }
});

// React Native
OneSignal.getDeviceState().then(deviceState => {
  if (deviceState.userId) {
    // إرسال إلى الخادم
    updateOneSignalPlayerId(deviceState.userId);
  }
});
```

### 3. خطأ "Invalid App ID"

**السبب:** `ONESIGNAL_APP_ID` غير صحيح أو غير مُعرّف.

**الحل:**
1. **تحقق من متغيرات البيئة:**
```bash
# في ملف .env
ONESIGNAL_APP_ID=your_actual_app_id
ONESIGNAL_REST_API_KEY=your_actual_rest_api_key
```

2. **تحقق من OneSignal Dashboard:**
   - انتقل إلى [OneSignal Dashboard](https://app.onesignal.com)
   - انسخ App ID من Settings > Keys & IDs

### 4. خطأ "Invalid REST API Key"

**السبب:** `ONESIGNAL_REST_API_KEY` غير صحيح.

**الحل:**
1. **احصل على REST API Key:**
   - انتقل إلى OneSignal Dashboard
   - Settings > Keys & IDs
   - انسخ REST API Key

2. **تأكد من الصلاحيات:**
   - REST API Key يجب أن يكون له صلاحية "Send Notifications"

### 5. خطأ "Player ID not found"

**السبب:** Player ID غير موجود في OneSignal أو منتهي الصلاحية.

**الحل:**
1. **تحقق من صحة Player ID:**
```javascript
// في Frontend
OneSignal.getUserId().then(userId => {
  console.log('Current Player ID:', userId);
});
```

2. **أعد تسجيل الجهاز:**
```javascript
// إعادة تهيئة OneSignal
OneSignal.init({
  appId: "YOUR_APP_ID",
  autoRegister: true
});
```

## 🛠️ أدوات التشخيص

### 1. فحص سجلات الخادم

```bash
# مراقبة سجلات الإشعارات
tail -f logs/notification.log

# أو في التطوير
npm run dev
```

### 2. فحص قاعدة البيانات

```sql
-- عرض المستخدمين مع OneSignal Player IDs
SELECT 
  id, 
  name, 
  email, 
  user_type,
  onesignal_player_id,
  created_at
FROM users 
WHERE onesignal_player_id IS NOT NULL
ORDER BY created_at DESC;

-- عرض الإشعارات الأخيرة
SELECT 
  id,
  title,
  type,
  status,
  recipient_type,
  created_at
FROM notifications 
ORDER BY created_at DESC 
LIMIT 10;
```

### 3. اختبار OneSignal API مباشرة

```bash
# اختبار إرسال إشعار
curl -X POST \
  https://onesignal.com/api/v1/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic YOUR_REST_API_KEY" \
  -d '{
    "app_id": "YOUR_APP_ID",
    "included_segments": ["All"],
    "headings": {"en": "Test Notification"},
    "contents": {"en": "This is a test notification"}
  }'
```

## 📊 مراقبة الأداء

### 1. OneSignal Dashboard

- **Notifications:** عرض الإشعارات المرسلة
- **Audience:** عدد المستخدمين المسجلين
- **Delivery:** معدل التسليم
- **Opens:** معدل فتح الإشعارات

### 2. سجلات التطبيق

```javascript
// إضافة logging مفصل
console.log('OneSignal App ID:', process.env.ONESIGNAL_APP_ID);
console.log('Player IDs:', validPlayerIds);
console.log('Notification payload:', notification);
```

## 🔧 نصائح للتحسين

### 1. معالجة الأخطاء

```javascript
try {
  const response = await oneSignal.createNotification(notification);
  if (response.statusCode === 200) {
    console.log('✅ Notification sent successfully');
  } else {
    console.error('❌ Notification failed:', response.body);
  }
} catch (error) {
  console.error('❌ OneSignal API Error:', error.response?.data || error.message);
}
```

### 2. التحقق من البيانات

```javascript
// التحقق من صحة البيانات قبل الإرسال
const validateNotification = (notification) => {
  if (!notification.app_id) {
    throw new Error('App ID is required');
  }
  if (!notification.include_player_ids && !notification.included_segments) {
    throw new Error('Either player IDs or segments are required');
  }
  if (!notification.headings || !notification.contents) {
    throw new Error('Headings and contents are required');
  }
};
```

### 3. إعادة المحاولة

```javascript
const sendNotificationWithRetry = async (notification, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await oneSignal.createNotification(notification);
      if (response.statusCode === 200) {
        return true;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return false;
};
```

## 📞 الدعم

إذا استمرت المشاكل:

1. **تحقق من OneSignal Status:** [status.onesignal.com](https://status.onesignal.com)
2. **راجع OneSignal Documentation:** [documentation.onesignal.com](https://documentation.onesignal.com)
3. **تحقق من سجلات الخادم** للحصول على تفاصيل أكثر
4. **اختبر API مباشرة** باستخدام curl أو Postman

---

**تذكر:** معظم مشاكل OneSignal تكون بسبب إعدادات خاطئة أو Player IDs مفقودة. تأكد من اتباع الخطوات بالترتيب! 🚀

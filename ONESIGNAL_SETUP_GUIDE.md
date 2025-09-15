# دليل إعداد OneSignal للإشعارات

## 📱 نظرة عامة

هذا الدليل يوضح كيفية تفعيل نظام الإشعارات التلقائية باستخدام OneSignal.

## 🔧 الخطوات المطلوبة

### 1. إعداد OneSignal في Frontend

#### أ. تثبيت OneSignal SDK

```bash
# React Native
npm install react-native-onesignal

# React Web
npm install onesignal-ngx

# Flutter
flutter pub add onesignal_flutter

# iOS Native
pod 'OneSignal', '>= 3.0.0', '< 4.0'

# Android Native
implementation 'com.onesignal:OneSignal:[4.0.0, 4.99.99]'
```

#### ب. تهيئة OneSignal

```javascript
// React Web
import OneSignal from 'onesignal-ngx';

OneSignal.init({
  appId: "YOUR_ONESIGNAL_APP_ID",
  autoRegister: true,
  notifyButton: {
    enable: true,
  },
});

// React Native
import OneSignal from 'react-native-onesignal';

OneSignal.setAppId("YOUR_ONESIGNAL_APP_ID");
```

### 2. تسجيل OneSignal Player ID

#### أ. في Frontend - عند تسجيل الدخول

```javascript
// React Web
OneSignal.getUserId().then(userId => {
  if (userId) {
    // إرسال Player ID إلى الخادم
    fetch('/api/user/onesignal-player-id', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ oneSignalPlayerId: userId })
    });
  }
});

// React Native
OneSignal.getDeviceState().then(deviceState => {
  if (deviceState.userId) {
    // إرسال Player ID إلى الخادم
    fetch('/api/user/onesignal-player-id', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ oneSignalPlayerId: deviceState.userId })
    });
  }
});
```

#### ب. في Backend - API متاح

```bash
PUT /api/user/onesignal-player-id
Authorization: Bearer <token>
Content-Type: application/json

{
  "oneSignalPlayerId": "player-id-from-onesignal"
}
```

**ملاحظة:** تم إضافة حقل `onesignal_player_id` مخصص في جدول المستخدمين لتخزين OneSignal Player IDs بشكل منفصل وواضح.

### 3. إعداد متغيرات البيئة

```bash
# في ملف .env
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_REST_API_KEY=your_onesignal_rest_api_key
```

### 4. اختبار النظام

#### أ. إنشاء حجز جديد

```bash
POST /api/student/bookings
Authorization: Bearer <student_token>
Content-Type: application/json

{
  "courseId": "course-id",
  "studentMessage": "أريد حجز هذه الدورة"
}
```

#### ب. التحقق من الإشعارات

```bash
# عرض إحصائيات الإشعارات
GET /api/notifications/statistics
Authorization: Bearer <admin_token>

# عرض إشعارات المستخدم
GET /api/notifications/user/my-notifications
Authorization: Bearer <user_token>
```

## 🔍 استكشاف الأخطاء

### مشكلة: "No valid player IDs found"

**السبب:** المستخدم لا يملك OneSignal Player ID مُسجل

**الحل:**
1. تأكد من تهيئة OneSignal في Frontend
2. تأكد من إرسال Player ID إلى الخادم
3. تحقق من تسجيل Player ID في قاعدة البيانات

### مشكلة: الإشعارات لا تصل

**السبب:** إعدادات OneSignal غير صحيحة

**الحل:**
1. تحقق من `ONESIGNAL_APP_ID` و `ONESIGNAL_REST_API_KEY`
2. تأكد من صحة Player IDs
3. تحقق من إعدادات OneSignal Dashboard

## 📊 مراقبة النظام

### 1. سجلات الخادم

```bash
# مراقبة سجلات الإشعارات
tail -f logs/notification.log

# أو في التطوير
npm run dev
```

### 2. OneSignal Dashboard

- انتقل إلى [OneSignal Dashboard](https://app.onesignal.com)
- تحقق من إحصائيات الإشعارات
- راجع سجل الإرسال

### 3. قاعدة البيانات

```sql
-- عرض الإشعارات الأخيرة
SELECT * FROM notifications 
ORDER BY created_at DESC 
LIMIT 10;

-- عرض إحصائيات الإشعارات
SELECT 
  status,
  COUNT(*) as count
FROM notifications 
GROUP BY status;
```

## 🚀 نصائح للتحسين

### 1. تحسين الأداء

- استخدم `collapse_id` لتجميع الإشعارات المتشابهة
- اضبط `ttl` (Time To Live) حسب نوع الإشعار
- استخدم `priority` للإشعارات المهمة

### 2. تحسين تجربة المستخدم

- أضف أيقونات مخصصة للإشعارات
- استخدم `deep linking` للانتقال لصفحات محددة
- أضف أزرار تفاعل في الإشعارات

### 3. مراقبة الأداء

- تتبع معدل فتح الإشعارات
- مراقبة معدل النقر على الإشعارات
- تحليل سلوك المستخدمين

## 📞 الدعم

إذا واجهت أي مشاكل:

1. تحقق من سجلات الخادم
2. راجع OneSignal Dashboard
3. تأكد من إعدادات البيئة
4. اختبر API endpoints

---

**النظام جاهز للاستخدام! 🎉**

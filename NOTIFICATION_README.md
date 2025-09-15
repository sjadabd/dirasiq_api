# نظام الإشعارات - OneSignal

## نظرة عامة

تم إنشاء نظام إشعارات شامل باستخدام OneSignal يتيح إرسال الإشعارات إلى جميع المستخدمين أو مجموعات محددة منهم.

## الميزات

- ✅ إرسال إشعارات لجميع المستخدمين
- ✅ إرسال إشعارات للمعلمين فقط
- ✅ إرسال إشعارات للطلاب فقط
- ✅ إرسال إشعارات لمستخدمين محددين
- ✅ 15 نوع مختلف من الإشعارات
- ✅ 4 مستويات أولوية
- ✅ قوالب جاهزة للإشعارات
- ✅ جدولة الإشعارات
- ✅ تتبع حالة الإشعارات
- ✅ إحصائيات مفصلة
- ✅ معالجة تلقائية للإشعارات المعلقة

## أنواع الإشعارات

1. **تنبيه واجب منزلي** - homework_reminder
2. **تحديث الدورة** - course_update
3. **تأكيد الحجز** - booking_confirmation
4. **إلغاء الحجز** - booking_cancellation
5. **تذكير بالدفع** - payment_reminder
6. **إعلان النظام** - system_announcement
7. **تحديث الدرجات** - grade_update
8. **واجب مستحق** - assignment_due
9. **تذكير بالحصة** - class_reminder
10. **رسالة من المعلم** - teacher_message
11. **إشعار للأهل** - parent_notification
12. **انتهاء الاشتراك** - subscription_expiry
13. **دورة جديدة متاحة** - new_course_available
14. **إكمال الدورة** - course_completion
15. **طلب تقييم** - feedback_request

## الإعداد

### 1. تثبيت التبعيات

```bash
npm install onesignal-node node-cron @types/node-cron
```

### 2. إضافة متغيرات البيئة

```env
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_REST_API_KEY=your_onesignal_rest_api_key
```

### 3. تشغيل قاعدة البيانات

```bash
npm run db:init
```

## الاستخدام السريع

### إرسال إشعار لجميع المستخدمين

```bash
POST /api/notifications/send-to-all
{
  "title": "إعلان مهم",
  "message": "سيتم إجراء تحديث على النظام غداً",
  "type": "system_announcement",
  "priority": "high"
}
```

### إرسال تذكير واجب منزلي

```bash
POST /api/notifications/homework-reminder
{
  "title": "تنبيه واجب منزلي - الرياضيات",
  "message": "لديك واجب منزلي جديد",
  "studentIds": ["student-id-1", "student-id-2"],
  "courseName": "الرياضيات",
  "subjectName": "الجبر",
  "dueDate": "2024-01-20"
}
```

### الحصول على إشعارات المستخدم

```bash
GET /api/notifications/user/my-notifications?page=1&limit=10
```

## الملفات المضافة

- `src/models/notification.model.ts` - نموذج الإشعارات
- `src/services/notification.service.ts` - خدمة OneSignal
- `src/controllers/notification.controller.ts` - وحدة التحكم
- `src/routes/notification.routes.ts` - مسارات API
- `src/services/notification-cron.service.ts` - خدمة المعالجة التلقائية
- `src/database/migrations/013_create_notifications_tables.sql` - جداول قاعدة البيانات

## الصلاحيات

- **Super Admin**: جميع الصلاحيات
- **Teacher**: إرسال إشعارات للطلاب والدورات
- **Student**: عرض إشعاراته فقط

## التوثيق الكامل

راجع الملفات التالية للتفاصيل الكاملة:
- `NOTIFICATION_SYSTEM_GUIDE.md` - دليل شامل
- `NOTIFICATION_API_EXAMPLES.md` - أمثلة API

## الدعم

للمساعدة أو الاستفسارات، راجع التوثيق أو اتصل بفريق التطوير.

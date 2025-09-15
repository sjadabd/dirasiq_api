# دليل نظام الإشعارات - OneSignal

## نظرة عامة

تم إنشاء نظام إشعارات شامل باستخدام OneSignal يتيح إرسال الإشعارات إلى:
- جميع المستخدمين
- المعلمين فقط
- الطلاب فقط
- مستخدمين محددين
- مجموعات محددة من المستخدمين

## أنواع الإشعارات المتاحة

### 1. تنبيه واجب منزلي (homework_reminder)
```json
{
  "title": "تنبيه واجب منزلي - الرياضيات",
  "message": "لديك واجب منزلي جديد في مادة الرياضيات من المعلم أحمد. الموعد النهائي: 2024-01-15",
  "type": "homework_reminder",
  "priority": "high"
}
```

### 2. تحديث الدورة (course_update)
```json
{
  "title": "تحديث في الدورة - الفيزياء",
  "message": "تم تحديث الدورة الفيزياء من قبل المعلم سارة. تم إضافة فصل جديد عن الميكانيكا",
  "type": "course_update",
  "priority": "medium"
}
```

### 3. تأكيد الحجز (booking_confirmation)
```json
{
  "title": "تأكيد حجز - الكيمياء",
  "message": "تم تأكيد حجزك في الدورة الكيمياء مع المعلم محمد. موعد الحصة: 2024-01-20 10:00",
  "type": "booking_confirmation",
  "priority": "medium"
}
```

### 4. إلغاء الحجز (booking_cancellation)
```json
{
  "title": "إلغاء حجز - الأحياء",
  "message": "تم إلغاء حجزك في الدورة الأحياء. يرجى إعادة الحجز في وقت آخر",
  "type": "booking_cancellation",
  "priority": "high"
}
```

### 5. تذكير بالدفع (payment_reminder)
```json
{
  "title": "تذكير بالدفع - الرياضيات",
  "message": "تذكير: يرجى دفع رسوم الدورة الرياضيات قبل 2024-01-25 لتجنب إلغاء الحجز",
  "type": "payment_reminder",
  "priority": "high"
}
```

### 6. إعلان النظام (system_announcement)
```json
{
  "title": "إعلان نظام - صيانة مجدولة",
  "message": "سيتم إجراء صيانة على النظام يوم الأحد من 2:00 صباحاً إلى 4:00 صباحاً",
  "type": "system_announcement",
  "priority": "medium"
}
```

### 7. تحديث الدرجات (grade_update)
```json
{
  "title": "تحديث الدرجات - الفيزياء",
  "message": "تم تحديث درجاتك في مادة الفيزياء من الدورة الأساسية. الدرجة الجديدة: 95",
  "type": "grade_update",
  "priority": "medium"
}
```

### 8. واجب مستحق (assignment_due)
```json
{
  "title": "واجب مستحق قريباً - الرياضيات",
  "message": "الواجب حل المعادلات في مادة الرياضيات مستحق خلال ساعتين",
  "type": "assignment_due",
  "priority": "high"
}
```

### 9. تذكير بالحصة (class_reminder)
```json
{
  "title": "تذكير بالحصة - الكيمياء",
  "message": "تذكير: حصة الكيمياء مع المعلم أحمد ستبدأ خلال 30 دقيقة",
  "type": "class_reminder",
  "priority": "medium"
}
```

### 10. رسالة من المعلم (teacher_message)
```json
{
  "title": "رسالة من المعلم - سارة",
  "message": "مرحباً! أريد أن أتأكد من فهمك للموضوع. هل لديك أي أسئلة؟",
  "type": "teacher_message",
  "priority": "medium"
}
```

### 11. إشعار للأهل (parent_notification)
```json
{
  "title": "تقرير أسبوعي - أحمد",
  "message": "تقرير أسبوعي عن أداء أحمد في الدورة. الدرجة: ممتاز، الحضور: 100%",
  "type": "parent_notification",
  "priority": "low"
}
```

### 12. انتهاء الاشتراك (subscription_expiry)
```json
{
  "title": "انتهاء الاشتراك قريباً",
  "message": "اشتراكك في المنصة سينتهي خلال 3 أيام. يرجى تجديد الاشتراك للاستمرار في الاستفادة من الخدمات",
  "type": "subscription_expiry",
  "priority": "high"
}
```

### 13. دورة جديدة متاحة (new_course_available)
```json
{
  "title": "دورة جديدة متاحة - البرمجة",
  "message": "دورة جديدة متاحة: البرمجة للمبتدئين مع المعلم علي. تعلم أساسيات البرمجة من الصفر",
  "type": "new_course_available",
  "priority": "low"
}
```

### 14. إكمال الدورة (course_completion)
```json
{
  "title": "تهانينا! إكمال الدورة - الرياضيات",
  "message": "تهانينا! لقد أكملت دورة الرياضيات بنجاح. الدرجة النهائية: 98",
  "type": "course_completion",
  "priority": "medium"
}
```

### 15. طلب تقييم (feedback_request)
```json
{
  "title": "طلب تقييم - دورة الفيزياء",
  "message": "نقدر رأيك! يرجى تقييم دورة الفيزياء لمساعدتنا في تحسين الخدمة",
  "type": "feedback_request",
  "priority": "low"
}
```

## أولويات الإشعارات

- **urgent**: عاجل (للأمور الحرجة)
- **high**: عالي (للأمور المهمة)
- **medium**: متوسط (للأمور العادية)
- **low**: منخفض (للأمور غير العاجلة)

## أنواع المستلمين

- **all**: جميع المستخدمين
- **teachers**: المعلمين فقط
- **students**: الطلاب فقط
- **specific_teachers**: معلمين محددين
- **specific_students**: طلاب محددين
- **parents**: أولياء الأمور

## أمثلة على الاستخدام

### 1. إرسال إشعار لجميع المستخدمين

```bash
POST /api/notifications/send-to-all
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "إعلان مهم",
  "message": "سيتم إجراء تحديث على النظام غداً",
  "type": "system_announcement",
  "priority": "high"
}
```

### 2. إرسال إشعار للمعلمين فقط

```bash
POST /api/notifications/send-to-teachers
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "اجتماع المعلمين",
  "message": "سيتم عقد اجتماع للمعلمين يوم الخميس الساعة 3:00 مساءً",
  "type": "system_announcement",
  "priority": "medium"
}
```

### 3. إرسال إشعار للطلاب فقط

```bash
POST /api/notifications/send-to-students
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "بداية الفصل الدراسي",
  "message": "مرحباً بكم في الفصل الدراسي الجديد! نتمنى لكم عاماً دراسياً موفقاً",
  "type": "system_announcement",
  "priority": "medium"
}
```

### 4. إرسال إشعار لمستخدمين محددين

```bash
POST /api/notifications/send-to-specific
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "رسالة شخصية",
  "message": "هذه رسالة خاصة لك",
  "type": "teacher_message",
  "priority": "medium",
  "recipientIds": ["user-id-1", "user-id-2"],
  "recipientType": "specific_students"
}
```

### 5. إرسال تذكير واجب منزلي

```bash
POST /api/notifications/homework-reminder
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "تنبيه واجب منزلي - الرياضيات",
  "message": "لديك واجب منزلي جديد في مادة الرياضيات",
  "studentIds": ["student-id-1", "student-id-2"],
  "courseName": "الرياضيات المتقدمة",
  "subjectName": "الجبر",
  "dueDate": "2024-01-20"
}
```

### 6. إرسال تحديث دورة

```bash
POST /api/notifications/course-update
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "تحديث في الدورة",
  "message": "تم إضافة فصل جديد",
  "studentIds": ["student-id-1"],
  "courseName": "الفيزياء",
  "updateMessage": "تم إضافة فصل عن الميكانيكا الكمية"
}
```

### 7. إرسال تأكيد حجز

```bash
POST /api/notifications/booking-confirmation
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "تأكيد الحجز",
  "message": "تم تأكيد حجزك",
  "studentId": "student-id-1",
  "courseName": "الكيمياء",
  "bookingDate": "2024-01-25 10:00"
}
```

### 8. استخدام قالب الإشعارات

```bash
POST /api/notifications/send-template
Authorization: Bearer <token>
Content-Type: application/json

{
  "templateName": "homework_reminder",
  "variables": {
    "course_name": "الرياضيات",
    "subject_name": "الجبر",
    "teacher_name": "أحمد محمد",
    "due_date": "2024-01-20"
  },
  "recipients": {
    "userIds": ["student-id-1", "student-id-2"]
  }
}
```

## الحصول على الإشعارات

### 1. الحصول على إشعارات المستخدم الحالي

```bash
GET /api/notifications/user/my-notifications?page=1&limit=10
Authorization: Bearer <token>
```

### 2. الحصول على جميع الإشعارات (للمدير فقط)

```bash
GET /api/notifications?page=1&limit=10&type=homework_reminder&status=sent
Authorization: Bearer <token>
```

### 3. الحصول على إحصائيات الإشعارات (للمدير فقط)

```bash
GET /api/notifications/statistics
Authorization: Bearer <token>
```

## تحديث حالة الإشعارات

### 1. تحديد الإشعار كمقروء

```bash
PUT /api/notifications/{notification-id}/read
Authorization: Bearer <token>
```

### 2. معالجة الإشعارات المعلقة (للمدير فقط)

```bash
POST /api/notifications/process-pending
Authorization: Bearer <token>
```

## إعداد OneSignal

### 1. إضافة متغيرات البيئة

```env
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_REST_API_KEY=your_onesignal_rest_api_key
```

### 2. الحصول على App ID و REST API Key

1. سجل في [OneSignal](https://onesignal.com/)
2. أنشئ تطبيق جديد
3. اذهب إلى Settings > Keys & IDs
4. انسخ App ID و REST API Key

## إعداد قاعدة البيانات

سيتم إنشاء الجداول التالية تلقائياً:

- `notifications`: جدول الإشعارات الرئيسي
- `user_notifications`: جدول تتبع قراءة الإشعارات
- `notification_templates`: جدول قوالب الإشعارات

## صلاحيات الوصول

- **Super Admin**: يمكنه إرسال جميع أنواع الإشعارات وعرض الإحصائيات
- **Teacher**: يمكنه إرسال الإشعارات للطلاب والدورات الخاصة به
- **Student**: يمكنه عرض إشعاراته فقط

## نصائح للاستخدام

1. استخدم الأولويات المناسبة لكل نوع إشعار
2. تجنب إرسال إشعارات كثيرة في وقت قصير
3. استخدم القوالب الجاهزة لتوفير الوقت
4. راجع الإحصائيات بانتظام لتحسين تجربة المستخدم
5. تأكد من صحة بيانات المستلمين قبل الإرسال

## استكشاف الأخطاء

### مشاكل شائعة:

1. **فشل في الإرسال**: تأكد من صحة OneSignal App ID و REST API Key
2. **عدم وصول الإشعارات**: تأكد من أن المستخدمين لديهم OneSignal Player IDs صحيحة
3. **أخطاء في قاعدة البيانات**: تأكد من تشغيل migrations قاعدة البيانات

### سجلات الأخطاء:

جميع الأخطاء يتم تسجيلها في console مع تفاصيل كاملة للمساعدة في التشخيص.

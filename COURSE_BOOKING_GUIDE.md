# دليل نظام حجوزات الكورسات

## نظرة عامة

تم إنشاء نظام حجوزات الكورسات للسماح للطلاب بحجز الكورسات من الأساتذة، والسماح للأساتذة بإدارة هذه الحجوزات.

## الميزات الرئيسية

### للطلاب:
- حجز كورس معين من أستاذ معين
- عرض جميع حجوزاتهم
- إلغاء الحجوزات
- إرسال رسائل مع طلب الحجز
- عرض إحصائيات الحجوزات

### للأساتذة:
- عرض جميع طلبات الحجز
- الموافقة على الحجوزات
- رفض الحجوزات مع سبب
- الرد على رسائل الطلاب
- إدارة الحجوزات

## هيكل قاعدة البيانات

### جدول `course_bookings`

| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | UUID | المعرف الفريد للحجز |
| `student_id` | UUID | معرف الطالب |
| `course_id` | UUID | معرف الكورس |
| `teacher_id` | UUID | معرف الأستاذ |
| `status` | VARCHAR(20) | حالة الحجز (pending, approved, rejected, cancelled) |
| `booking_date` | TIMESTAMP | تاريخ الحجز |
| `approved_at` | TIMESTAMP | تاريخ الموافقة |
| `rejected_at` | TIMESTAMP | تاريخ الرفض |
| `cancelled_at` | TIMESTAMP | تاريخ الإلغاء |
| `rejection_reason` | TEXT | سبب الرفض |
| `cancellation_reason` | TEXT | سبب الإلغاء |
| `student_message` | TEXT | رسالة الطالب |
| `teacher_response` | TEXT | رد الأستاذ |
| `is_deleted` | BOOLEAN | هل تم حذف الحجز |
| `created_at` | TIMESTAMP | تاريخ الإنشاء |
| `updated_at` | TIMESTAMP | تاريخ التحديث |

## API Endpoints

### للطلاب

#### إنشاء حجز جديد
```
POST /api/student/bookings
Authorization: Bearer <token>
Content-Type: application/json

{
  "courseId": "uuid",
  "studentMessage": "أريد الانضمام لهذا الكورس"
}
```

#### عرض جميع الحجوزات
```
GET /api/student/bookings?page=1&limit=10&status=pending
Authorization: Bearer <token>
```

#### عرض حجز معين
```
GET /api/student/bookings/:id
Authorization: Bearer <token>
```

#### إلغاء حجز
```
PATCH /api/student/bookings/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "سبب الإلغاء"
}
```

#### إعادة تفعيل حجز ملغي
```
PATCH /api/student/bookings/:id/reactivate
Authorization: Bearer <token>
```

**ملاحظة:** يمكن إعادة تفعيل الحجوزات الملغية من الطالب فقط، وليس الحجوزات الملغية من المعلم.

#### حذف حجز
```
DELETE /api/student/bookings/:id
Authorization: Bearer <token>
```

#### إحصائيات الحجوزات
```
GET /api/student/bookings/stats/summary
Authorization: Bearer <token>
```

### للأساتذة

#### عرض جميع الحجوزات
```
GET /api/teacher/bookings?page=1&limit=10&status=pending
Authorization: Bearer <token>
```

#### عرض حجز معين مع التفاصيل
```
GET /api/teacher/bookings/:id
Authorization: Bearer <token>
```

#### الموافقة على حجز
```
PATCH /api/teacher/bookings/:id/approve
Authorization: Bearer <token>
Content-Type: application/json

{
  "teacherResponse": "مرحباً بك في الكورس!"
}
```

#### رفض حجز
```
PATCH /api/teacher/bookings/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "rejectionReason": "الكورس ممتلئ",
  "teacherResponse": "عذراً، الكورس ممتلئ حالياً"
}
```

#### تحديث رد الأستاذ
```
PATCH /api/teacher/bookings/:id/response
Authorization: Bearer <token>
Content-Type: application/json

{
  "teacherResponse": "رد جديد من الأستاذ"
}
```

#### حذف حجز
```
DELETE /api/teacher/bookings/:id
Authorization: Bearer <token>
```

#### إحصائيات الحجوزات
```
GET /api/teacher/bookings/stats/summary
Authorization: Bearer <token>
```

## حالات الحجز

- **pending**: في انتظار رد الأستاذ
- **approved**: تمت الموافقة
- **rejected**: تم الرفض
- **cancelled**: تم الإلغاء

## إعادة تفعيل الحجوزات

### شروط إعادة التفعيل:
- ✅ الحجز يجب أن يكون في حالة "cancelled"
- ✅ الإلغاء يجب أن يكون من الطالب (وليس من المعلم)
- ✅ الكورس يجب أن يكون متاحاً وغير محذوف
- ✅ **يمكن إعادة التفعيل حتى لو انتهى الكورس** (مع إضافة ملاحظة للمعلم)

### معلومات إضافية في الاستجابة:
عند عرض الحجوزات، ستجد معلومات إضافية للحجوزات الملغية:

```json
{
  "id": "booking-uuid",
  "status": "cancelled",
  "cancelledBy": "student",
  "cancellationReason": "سبب الإلغاء",
  "cancelledAt": "2024-01-15T10:30:00Z",
  "canReactivate": true,
  "reactivationMessage": "يمكنك إعادة تفعيل هذا الحجز",
  "reactivationEndpoint": "/api/student/bookings/booking-uuid/reactivate"
}
```

### رسائل مختلفة حسب نوع الإلغاء:

**إذا كان الإلغاء من الطالب:**
```json
{
  "canReactivate": true,
  "reactivationMessage": "يمكنك إعادة تفعيل هذا الحجز",
  "reactivationEndpoint": "/api/student/bookings/{id}/reactivate",
  "reactivationNote": "سيتم إعادة التفعيل حتى لو انتهى الكورس، مع إضافة ملاحظة للمعلم",
  "reactivationSafe": true
}
```

**إذا كان الإلغاء من المعلم:**
```json
{
  "canReactivate": false,
  "reactivationMessage": "لا يمكن إعادة تفعيل هذا الحجز لأنه تم إلغاؤه من قبل المعلم"
}
```

## الحلول للمشاكل الشائعة

### مشكلة: لا يمكن إعادة تفعيل الحجز لكورس انتهى

**الحل الجديد:**
- ✅ **يمكن إعادة التفعيل** حتى لو انتهى الكورس
- ✅ **يتم إضافة ملاحظة** للمعلم أن الكورس انتهى
- ✅ **الطالب يمكنه التواصل** مع المعلم لترتيب بدائل
- ✅ **النظام آمن** - لا يسمح بإعادة التفعيل إلا للطلاب

**الاستجابة:**
```json
{
  "message": "تم إعادة تفعيل الحجز بنجاح مع ملاحظة مهمة",
  "data": { ... },
  "warning": {
    "message": "تم إعادة تفعيل الحجز لكورس منتهي",
    "note": "يرجى التواصل مع المعلم لترتيب مواعيد جديدة أو كورسات بديلة",
    "action": "contact_teacher"
  }
}
```

### مشكلة: لا يمكن حجز كورس مرتين

**الحل:**
- ✅ **إلغاء الحجز القديم** أولاً
- ✅ **إعادة تفعيل الحجز** (إذا كان ملغياً)
- ✅ **إنشاء حجز جديد** لكورس مختلف

## أمثلة الاستخدام

### مثال 1: طالب يحجز كورس

```javascript
// إنشاء حجز جديد
const response = await fetch('/api/student/bookings', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    courseId: 'course-uuid-here',
    studentMessage: 'أريد الانضمام لهذا الكورس في الرياضيات'
  })
});

const result = await response.json();
console.log('تم إنشاء الحجز:', result.data);
```

### مثال 2: أستاذ يوافق على حجز

```javascript
// الموافقة على حجز
const response = await fetch('/api/teacher/bookings/booking-uuid-here/approve', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    teacherResponse: 'مرحباً بك في الكورس! سنبدأ الأسبوع القادم.'
  })
});

const result = await response.json();
console.log('تمت الموافقة:', result.data);
```

### مثال 3: عرض حجوزات الطالب

```javascript
// عرض جميع الحجوزات
const response = await fetch('/api/student/bookings?status=pending', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

const result = await response.json();
console.log('الحجوزات المعلقة:', result.data);
```

## ملاحظات مهمة

1. **منع التكرار**: لا يمكن للطالب حجز نفس الكورس مرتين
2. **الصلاحيات**: كل مستخدم يمكنه الوصول فقط لحجوزاته
3. **الحذف الناعم**: يتم حذف الحجوزات بشكل ناعم (soft delete)
4. **التواريخ**: يتم تسجيل توقيت كل تغيير في حالة الحجز
5. **الرسائل**: يمكن للطالب والأستاذ تبادل الرسائل

## الأمان

- جميع المسارات تتطلب مصادقة (JWT token)
- التحقق من ملكية الحجز قبل أي تعديل
- حماية من SQL injection
- التحقق من صحة البيانات المدخلة

## استكشاف الأخطاء

### أخطاء شائعة:

1. **401 Unauthorized**: تأكد من إرسال token صحيح
2. **403 Forbidden**: تأكد من أن الحجز يخص المستخدم الحالي
3. **404 Not Found**: تأكد من صحة معرف الحجز
4. **409 Conflict**: الحجز موجود مسبقاً
5. **400 Bad Request**: تأكد من صحة البيانات المرسلة

## التطوير المستقبلي

- إشعارات فورية عند تغيير حالة الحجز
- نظام دفع متكامل
- تقييمات ومراجعات للكورسات
- نظام جدولة للدروس
- تقارير وإحصائيات متقدمة

# نظام إدارة سعة الطلاب في الاشتراكات

## نظرة عامة

تم تطوير نظام شامل لإدارة سعة الطلاب في اشتراكات المعلمين، يتضمن تتبع عدد الطلاب الحاليين والتحكم في قبول الحجوزات بناءً على السعة المتاحة.

## الميزات المضافة

### 1. حقل `current_students` في جدول `teacher_subscriptions`

- **الغرض**: تتبع عدد الطلاب الحاليين الذين تم قبولهم فعليًا ضمن الاشتراك
- **النوع**: INTEGER DEFAULT 0 NOT NULL
- **القيود**: 
  - لا يمكن أن يكون سالب (`CHECK (current_students >= 0)`)
  - يتم تحديثه تلقائيًا عند قبول/رفض/إلغاء الحجوزات

### 2. منطق التحكم عند قبول الحجز

#### التحقق من السعة
- قبل قبول أي حجز، يتم التحقق من:
  - وجود اشتراك فعال للمعلم
  - عدم انتهاء صلاحية الاشتراك
  - عدم تجاوز السعة القصوى (`current_students < max_students`)

#### تحديث العدد
- **عند القبول**: `current_students = current_students + 1`
- **عند الإلغاء بعد القبول**: `current_students = GREATEST(current_students - 1, 0)`
- **عند الرفض**: لا يتغير العدد (إذا لم يكن معتمدًا مسبقًا)

### 3. إجراءات الأمان

#### منع التلاعب
- منع تغيير `status` إلى `approved` إذا كان بالفعل `approved`
- منع قبول حجز تم رفضه مسبقًا
- منع تغيير `status` إلى `rejected` إذا كان بالفعل `rejected`

#### التحقق من الصلاحية
- التحقق من انتهاء صلاحية الاشتراك عند كل عملية قبول
- التحقق من السعة المتاحة قبل القبول

### 4. جدول `booking_usage_logs` (للتحليلات)

#### الغرض
تسجيل كل عملية قبول/رفض/إلغاء حجز للتحليلات والإحصائيات

#### الحقول الرئيسية
- `action_type`: نوع العملية (approved, rejected, cancelled, reactivated)
- `previous_status` / `new_status`: الحالة السابقة والجديدة
- `students_before` / `students_after`: عدد الطلاب قبل وبعد العملية
- `performed_by`: من قام بالعملية (teacher, student, system)
- `reason`: سبب العملية

## الملفات المحدثة

### 1. قاعدة البيانات
- `011_add_current_students_to_teacher_subscriptions.sql`: إضافة حقل `current_students`
- `012_create_booking_usage_logs_table.sql`: إنشاء جدول السجلات
- `run_all_migrations.sql`: تشغيل جميع المايجريشنز

### 2. النماذج (Models)
- `teacher-subscription.model.ts`: إضافة دوال إدارة `current_students`
- `course-booking.model.ts`: تحديث منطق التحكم وتسجيل الاستخدامات
- `booking-usage-log.model.ts`: نموذج جديد لإدارة سجلات الاستخدام

### 3. الأنواع (Types)
- `index.ts`: إضافة `currentStudents` إلى `TeacherSubscription`

## الدوال الجديدة

### في `TeacherSubscriptionModel`
- `incrementCurrentStudents()`: زيادة عدد الطلاب
- `decrementCurrentStudents()`: تقليل عدد الطلاب
- `canAddStudent()`: التحقق من إمكانية إضافة طالب
- `recalculateCurrentStudents()`: إعادة حساب العدد من الحجوزات

### في `CourseBookingModel`
- `logBookingUsage()`: تسجيل استخدام الحجز
- تحديث `updateStatus()`: إضافة التحقق من السعة وتسجيل الاستخدام
- تحديث دوال الإلغاء: إضافة تسجيل الاستخدام

### في `BookingUsageLogModel`
- `create()`: إنشاء سجل استخدام
- `findByTeacherId()`: جلب سجلات معلم
- `getTeacherUsageStats()`: إحصائيات استخدام المعلم

## رسائل الخطأ

### رسائل التحقق من السعة
- `"لا يوجد اشتراك فعال للمعلم"`
- `"انتهت صلاحية الاشتراك"`
- `"الباقة ممتلئة. لا يمكنك قبول طلاب إضافيين"`

### رسائل منع التلاعب
- `"الحجز معتمد بالفعل"`
- `"لا يمكن قبول حجز تم رفضه مسبقًا"`
- `"الحجز مرفوض بالفعل"`

## كيفية الاستخدام

### 1. تشغيل المايجريشنز
```sql
\i src/database/migrations/run_all_migrations.sql
```

### 2. التحقق من السعة قبل قبول حجز
```typescript
const capacityCheck = await TeacherSubscriptionModel.canAddStudent(teacherId);
if (!capacityCheck.canAdd) {
  throw new Error(capacityCheck.message);
}
```

### 3. جلب إحصائيات المعلم
```typescript
const stats = await BookingUsageLogModel.getTeacherUsageStats(teacherId);
console.log(`الطلاب الحاليين: ${stats.currentStudents}/${stats.maxStudents}`);
```

## الفوائد

1. **التحكم الدقيق**: منع تجاوز السعة المحددة في الباقة
2. **الأمان**: منع التلاعب في الحجوزات
3. **الشفافية**: تتبع دقيق لجميع العمليات
4. **التحليلات**: بيانات شاملة لاتخاذ القرارات
5. **الموثوقية**: ضمان صحة البيانات في جميع الأوقات

## ملاحظات مهمة

- جميع العمليات تتم في transactions لضمان الاتساق
- تسجيل الاستخدامات لا يؤثر على العملية الرئيسية (error handling)
- يتم إعادة حساب `current_students` تلقائيًا عند الحاجة
- النظام متوافق مع البنية الحالية ولا يؤثر على الوظائف الموجودة

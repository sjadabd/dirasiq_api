# نظام التسجيل في الكورسات - Course Enrollment System

## نظرة عامة

نظام متكامل لإدارة التسجيل في الكورسات بين الطلاب والمعلمين، مع نظام فواتير متقدم ونظام دفع بالاقساط.

## المميزات الرئيسية

### 🎯 للطلاب
- إرسال طلبات التسجيل في الكورسات
- متابعة حالة الطلبات
- عرض التسجيلات النشطة
- إدارة الفواتير والمدفوعات
- لوحة تحكم شخصية

### 👨‍🏫 للمعلمين
- استقبال وإدارة طلبات التسجيل
- الموافقة أو رفض الطلبات
- إنشاء فواتير متعددة (حجز، كورس، أقساط)
- مراقبة عدد الطلاب والحد الأقصى
- لوحة تحكم شاملة

### 💰 نظام الفواتير
- فواتير حجز اختيارية
- فواتير كورس مع خصومات
- نظام أقساط مرن
- دعم طرق دفع متعددة
- تتبع حالة المدفوعات

## البنية التقنية

### قاعدة البيانات
```sql
-- الجداول الرئيسية
course_enrollment_requests     -- طلبات التسجيل
student_course_enrollments     -- التسجيلات المقبولة
course_invoices               -- الفواتير
payment_installments          -- الأقساط
```

### الملفات
```
src/
├── models/                   # نماذج قاعدة البيانات
│   ├── course-enrollment-request.model.ts
│   ├── student-course-enrollment.model.ts
│   ├── course-invoice.model.ts
│   └── payment-installment.model.ts
├── services/                 # طبقة الخدمات
│   └── course-enrollment.service.ts
├── controllers/              # المتحكمات
│   ├── student/course-enrollment.controller.ts
│   └── teacher/course-enrollment.controller.ts
├── routes/                   # المسارات
│   ├── student/course-enrollment.routes.ts
│   └── teacher/course-enrollment.routes.ts
└── types/                    # التعريفات
    └── index.ts (محدث)
```

## دورة حياة الطلب

### 1. إرسال الطلب
```typescript
POST /api/student/enrollment-requests
{
  "courseId": "uuid",
  "studyYear": "2024-2025",
  "studentMessage": "أريد التسجيل في هذا الكورس"
}
```

### 2. مراجعة المعلم
```typescript
GET /api/teacher/enrollment-requests
```

### 3. الموافقة على الطلب
```typescript
PUT /api/teacher/enrollment-requests/:id/approve
{
  "courseStartDate": "2024-09-01",
  "courseEndDate": "2024-12-31",
  "totalCourseAmount": 100.00,
  "reservationAmount": 20.00  // اختياري
}
```

### 4. إنشاء الفواتير
- فاتورة حجز (إذا تم تحديد مبلغ الحجز)
- فاتورة الكورس (المبلغ المتبقي)

## API Endpoints

### للطلاب

#### طلبات التسجيل
- `POST /api/student/enrollment-requests` - إنشاء طلب جديد
- `GET /api/student/enrollment-requests` - عرض الطلبات
- `GET /api/student/enrollment-requests/:id` - عرض طلب محدد
- `DELETE /api/student/enrollment-requests/:id` - حذف طلب

#### التسجيلات
- `GET /api/student/enrollments` - عرض التسجيلات
- `GET /api/student/enrollments/:id` - عرض تسجيل محدد

#### الفواتير
- `GET /api/student/invoices` - عرض الفواتير
- `GET /api/student/invoices/:id` - عرض فاتورة محددة
- `PUT /api/student/invoices/:id/payment` - تحديث المدفوعات

#### لوحة التحكم
- `GET /api/student/dashboard` - بيانات لوحة التحكم

### للمعلمين

#### طلبات التسجيل
- `GET /api/teacher/enrollment-requests` - عرض الطلبات
- `GET /api/teacher/enrollment-requests/:id` - عرض طلب محدد
- `PUT /api/teacher/enrollment-requests/:id/approve` - الموافقة
- `PUT /api/teacher/enrollment-requests/:id/reject` - الرفض

#### التسجيلات
- `GET /api/teacher/enrollments` - عرض التسجيلات
- `GET /api/teacher/enrollments/:id` - عرض تسجيل محدد
- `PUT /api/teacher/enrollments/:id/status` - تحديث الحالة

#### الفواتير
- `POST /api/teacher/invoices/reservation` - إنشاء فاتورة حجز
- `POST /api/teacher/invoices/course` - إنشاء فاتورة كورس
- `POST /api/teacher/invoices/bulk` - إنشاء فواتير متعددة
- `GET /api/teacher/invoices` - عرض الفواتير
- `GET /api/teacher/invoices/:id` - عرض فاتورة محددة
- `PUT /api/teacher/invoices/:id` - تحديث الفاتورة
- `PUT /api/teacher/invoices/:id/payment` - تحديث المدفوعات

#### لوحة التحكم
- `GET /api/teacher/dashboard` - بيانات لوحة التحكم

## أنواع الفواتير

### 1. فاتورة الحجز (Reservation)
- مبلغ زهيد غير قابل للاسترجاع
- استحقاق خلال أسبوع
- اختيارية حسب رغبة المعلم

### 2. فاتورة الكورس (Course)
- المبلغ الإجمالي للكورس
- يمكن إضافة خصومات
- استحقاق خلال شهر

### 3. فاتورة الأقساط (Installment)
- تقسيم المبلغ على أقساط
- تواريخ استحقاق مختلفة
- مرونة في الدفع

## نظام الأقساط

### إنشاء أقساط
```typescript
POST /api/teacher/invoices/bulk
{
  "enrollmentIds": ["uuid1", "uuid2"],
  "invoiceType": "installment",
  "amountDue": 100.00,
  "dueDate": "2024-10-01",
  "installments": [
    {
      "installmentNumber": 1,
      "installmentAmount": 50.00,
      "dueDate": "2024-09-15"
    },
    {
      "installmentNumber": 2,
      "installmentAmount": 50.00,
      "dueDate": "2024-10-01"
    }
  ]
}
```

### حالات القسط
- `pending` - معلق
- `partial` - مدفوع جزئياً
- `paid` - مدفوع بالكامل
- `overdue` - متأخر

## مراقبة الحد الأقصى

### التحقق التلقائي
- يتحقق النظام من عدد الطلاب قبل قبول طالب جديد
- رسالة خطأ واضحة عند الوصول للحد الأقصى
- ربط بعدد الطلاب المسموح به في الباقة

### دالة التحقق
```sql
SELECT can_teacher_add_student('teacher-uuid');
-- Returns: true/false
```

## الرسائل والتنبيهات

### للطلاب
- تأكيد إرسال الطلب
- إشعار الموافقة/الرفض
- تنبيهات استحقاق الدفع
- تحديثات حالة التسجيل

### للمعلمين
- إشعارات طلبات جديدة
- تنبيهات الوصول للحد الأقصى
- تقارير المدفوعات
- إحصائيات التسجيلات

## الأمان والصلاحيات

### التحقق من الملكية
- الطالب يمكنه الوصول لطلباته فقط
- المعلم يمكنه الوصول لطلبات كورساته فقط
- التحقق من نوع المستخدم (Student/Teacher)

### Middleware الأمان
```typescript
router.use(authenticateToken);  // التحقق من الرمز
// التحقق من نوع المستخدم في كل دالة
```

## الأداء والتحسين

### الفهارس
- فهارس على المعرفات الرئيسية
- فهارس على التواريخ والحالات
- فهارس مركبة للاستعلامات المعقدة

### التريجرات
- تحديث تلقائي لحالة الفواتير
- تحديث تلقائي لحالة الأقساط
- التحقق من عدد الطلاب

## الاستخدام

### 1. تثبيت النظام
```bash
# تشغيل ملف الهجرة
npm run migrate:enrollment
```

### 2. تشغيل الخادم
```bash
npm run dev
```

### 3. اختبار النظام
```bash
# اختبار طلب التسجيل
curl -X POST http://localhost:3000/api/student/enrollment-requests \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"uuid","studyYear":"2024-2025"}'
```

## الدعم والصيانة

### المهام الدورية
- تحديث الطلبات منتهية الصلاحية
- تحديث التسجيلات منتهية الصلاحية
- تحديث الفواتير المتأخرة
- تحديث الأقساط المتأخرة

### المراقبة
- سجلات الأخطاء
- إحصائيات الأداء
- تقارير الاستخدام

## التطوير المستقبلي

### الميزات المقترحة
- نظام إشعارات متقدم
- تقارير مالية مفصلة
- نظام خصومات متطور
- تكامل مع بوابات الدفع
- تطبيق موبايل

### التحسينات التقنية
- Redis للتخزين المؤقت
- Elasticsearch للبحث
- WebSockets للتحديثات المباشرة
- نظام قوالب للفواتير

## المساهمة

### إرشادات التطوير
1. اتبع معايير الكود
2. اكتب اختبارات شاملة
3. حدث التوثيق
4. استخدم TypeScript
5. اتبع مبادئ SOLID

### الإبلاغ عن الأخطاء
- استخدم GitHub Issues
- وصف المشكلة بالتفصيل
- أرفق سجلات الأخطاء
- حدد خطوات التكرار

---

**تم تطوير هذا النظام بواسطة فريق Dirasiq API**
**الإصدار: 1.0.0**
**تاريخ الإصدار: ديسمبر 2024**

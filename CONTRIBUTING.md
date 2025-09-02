# Contributing to Dirasiq API

شكراً لك على اهتمامك بالمساهمة في مشروع Dirasiq API! هذا الدليل سيساعدك على البدء.

## 🚀 كيفية المساهمة

### 1. إعداد البيئة المحلية

```bash
# Fork المشروع
git clone https://github.com/YOUR_USERNAME/dirasiq_api.git
cd dirasiq_api

# تثبيت التبعيات
npm install

# إعداد المتغيرات البيئية
cp env.example .env
# قم بتعديل ملف .env

# إعداد قاعدة البيانات
npm run db:init
```

### 2. إرشادات التطوير

#### هيكلية الكود
- استخدم TypeScript لجميع الملفات الجديدة
- اتبع نمط التسمية camelCase للمتغيرات والدوال
- استخدم PascalCase للكلاسات والواجهات
- اتبع مبدأ فصل المسؤوليات (Separation of Concerns)

#### إرشادات الـ API
- استخدم أسماء باللغة الإنجليزية للـ endpoints
- اتبع نمط RESTful API
- استخدم HTTP status codes المناسبة
- اتبع نمط الاستجابة الموحد:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "errors": []
}
```

#### إرشادات قاعدة البيانات
- استخدم snake_case لأسماء الجداول والأعمدة
- اكتب migrations لكل تغيير في قاعدة البيانات
- استخدم prepared statements لتجنب SQL injection
- أضف indexes للأعمدة المستخدمة في البحث

### 3. إرشادات الـ Git

#### رسائل الـ Commit
استخدم نمط Conventional Commits:
```
type(scope): description

feat(auth): add email verification for teachers
fix(user): resolve password reset issue
docs(readme): update installation instructions
test(auth): add login endpoint tests
```

#### أنواع الـ Commits
- `feat`: ميزة جديدة
- `fix`: إصلاح خطأ
- `docs`: تحديث الوثائق
- `style`: تغييرات في التنسيق
- `refactor`: إعادة هيكلة الكود
- `test`: إضافة أو تحديث الاختبارات
- `chore`: تحديثات في البناء أو الأدوات

### 4. الاختبارات

#### كتابة الاختبارات
- اكتب اختبارات لكل endpoint جديد
- تأكد من تغطية الحالات الإيجابية والسلبية
- استخدم قاعدة بيانات منفصلة للاختبارات

```bash
# تشغيل الاختبارات
npm test

# تشغيل الاختبارات مع التغطية
npm run test:coverage
```

### 5. إرشادات الأمان

- لا تضع معلومات حساسة في الكود
- استخدم متغيرات بيئية للمعلومات الحساسة
- تحقق من المدخلات دائماً
- استخدم HTTPS في الإنتاج
- اتبع مبدأ أقل صلاحية (Least Privilege)

### 6. إرشادات الأداء

- استخدم connection pooling لقاعدة البيانات
- اضبط rate limiting
- استخدم compression للاستجابات
- اضبط caching حيثما أمكن
- راقب استخدام الذاكرة

### 7. عملية الـ Pull Request

1. **إنشاء Branch جديد**
```bash
git checkout -b feature/your-feature-name
```

2. **التطوير والاختبار**
```bash
# تطوير الميزة
# كتابة الاختبارات
npm test
npm run lint
```

3. **الـ Commit والـ Push**
```bash
git add .
git commit -m "feat(scope): description"
git push origin feature/your-feature-name
```

4. **إنشاء Pull Request**
- املأ قالب الـ PR
- اربط الـ issues ذات الصلة
- اطلب مراجعة من المطورين

### 8. قوالب الـ Pull Request

#### قالب إضافة ميزة جديدة
```markdown
## الوصف
وصف مختصر للميزة الجديدة

## نوع التغيير
- [ ] ميزة جديدة
- [ ] إصلاح خطأ
- [ ] تحسين الأداء
- [ ] تحديث الوثائق

## الاختبارات
- [ ] تم إضافة اختبارات جديدة
- [ ] جميع الاختبارات تمر بنجاح

## الوثائق
- [ ] تم تحديث README
- [ ] تم تحديث API documentation

## معلومات إضافية
أي معلومات إضافية مفيدة
```

### 9. إرشادات المراجعة

#### للمراجعين
- راجع الكود بعناية
- تحقق من الأمان
- تحقق من الأداء
- تحقق من قابلية الصيانة
- اكتب تعليقات مفيدة

#### للمطورين
- استجب للتعليقات بسرعة
- اشرح القرارات المعقدة
- كن منفتحاً للنقد البناء

### 10. الحصول على المساعدة

إذا كنت بحاجة إلى مساعدة:
- اقرأ الوثائق أولاً
- ابحث في الـ issues المفتوحة
- افتح issue جديد إذا لزم الأمر
- تواصل مع الفريق عبر GitHub Discussions

## 🎯 أهداف المشروع

- بناء API آمن وقابل للتطوير
- توفير تجربة مستخدم ممتازة
- الحفاظ على جودة عالية للكود
- بناء مجتمع نشط من المطورين

شكراً لك على مساهمتك! 🚀


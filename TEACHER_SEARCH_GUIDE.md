# دليل تشغيل ميزة الموقع والبحث عن المدرسين القريبين (العراق)

## 🎯 الهدف
تمكين الطلاب من البحث عن المدرسين القريبين بناءً على:
- موقعهم الجغرافي (إحداثيات)
- المحافظة/المدينة/المنطقة

## 🗄️ قاعدة البيانات

### الحقول المطلوبة في جدول `users`:
```sql
-- إضافة حقول الموقع التفصيلية
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS governorate VARCHAR(100),
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS district VARCHAR(100),
ADD COLUMN IF NOT EXISTS street VARCHAR(255),
ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) DEFAULT 'IQ',
ADD COLUMN IF NOT EXISTS postcode VARCHAR(10);
```

### المحافظات العراقية المدعومة:
- **بغداد**: العاصمة - الكرخ، الرصافة، الأعظمية، الزعفرانية
- **البصرة**: الميناء الرئيسي - الزبير، أبو الخصيب، القرنة
- **الموصل**: نينوى - الحمدانية، تلعفر، سنجار
- **أربيل**: إقليم كردستان - كويه، مخمور، خبات
- **السليمانية**: إقليم كردستان - بنجوين، قلادزي، رانية
- **دهوك**: إقليم كردستان - زاخو، عمادية
- **كركوك**: كركوك - داقوق، الحويجة
- **الأنبار**: الرمادي، الفلوجة، هيت، حديثة
- **النجف**: النجف الأشرف - الكوفة، المناذرة
- **كربلاء**: كربلاء المقدسة - عين التمر
- **بابل**: الحلة - المحمودية، المسيب، الهندية
- **واسط**: الكوت - بدرة، الزبيرية
- **صلاح الدين**: تكريت - بيجي، بلد، دجيل
- **ديالى**: بعقوبة - الخالص، بلدروز، خانقين
- **القادسية**: الديوانية - الشنافية
- **ذي قار**: الناصرية - الشطرة، الرفاعي
- **ميسان**: العمارة - المجر الكبير، الكحلاء

## 🔄 تدفق تسجيل المعلم

### 1. عند التسجيل:
- المعلم يرسل `latitude` و `longitude`
- النظام يعمل Reverse Geocoding باستخدام OpenStreetMap Nominatim
- يحصل على: المحافظة، المدينة، الناحية، الشارع
- يخزن البيانات في قاعدة البيانات

### 2. عند تحديث الموقع:
- نفس العملية السابقة
- تحديث البيانات المخزنة

### 3. معالجة الأخطاء:
- إذا فشل Reverse Geocoding: نكمل التسجيل مع الإحداثيات فقط
- الحقول النصية تبقى فارغة (NULL)

## 🔍 تدفق البحث للطالب

### السيناريو A: البحث بالإحداثيات (الأفضلية)
```
GET /api/teacher-search/search/coordinates?latitude=33.3152&longitude=44.3661&maxDistance=5&page=1&limit=10
```

**المعاملات:**
- `latitude` (مطلوب): خط العرض
- `longitude` (مطلوب): خط الطول  
- `maxDistance` (اختياري): المسافة القصوى بالكيلومتر (افتراضي: 5)
- `page` (اختياري): رقم الصفحة (افتراضي: 1)
- `limit` (اختياري): عدد النتائج (افتراضي: 10)

**النتيجة:**
```json
{
  "success": true,
  "message": "تم العثور على المدرسين",
  "data": {
    "teachers": [
      {
        "id": "uuid",
        "name": "أحمد محمد",
        "phone": "+964501234567",
        "address": "بغداد، العراق",
        "bio": "مدرس رياضيات مع خبرة 5 سنوات",
        "experienceYears": 5,
        "latitude": 33.3152,
        "longitude": 44.3661,
        "governorate": "بغداد",
        "city": "بغداد",
        "district": "الكرخ",
        "distance": 2.5
      }
    ]
  },
  "count": 1
}
```

### السيناريو B: البحث بأسماء المواقع
```
GET /api/teacher-search/search/location?governorate=بغداد&city=بغداد&page=1&limit=10
```

**المعاملات:**
- `governorate` (اختياري): المحافظة
- `city` (اختياري): المدينة
- `district` (اختياري): الناحية
- `page` (اختياري): رقم الصفحة
- `limit` (اختياري): عدد النتائج

**ملاحظة:** يجب تحديد موقع واحد على الأقل

## 📍 الحصول على المواقع المتاحة

### 1. الحصول على المحافظات:
```
GET /api/teacher-search/governorates
```

### 2. الحصول على مدن محافظة معينة:
```
GET /api/teacher-search/cities/بغداد
```

## 🛠️ الخدمات المستخدمة

### 1. LocationService
- `getLocationFromCoordinates()`: Reverse Geocoding
- `getAvailableGovernorates()`: المحافظات المتاحة
- `getAvailableCities()`: المدن المتاحة
- `calculateDistance()`: حساب المسافة

### 2. TeacherSearchService
- `searchTeachersByCoordinates()`: البحث بالإحداثيات
- `searchTeachersByLocation()`: البحث بأسماء المواقع
- `getAvailableGovernorates()`: المحافظات
- `getAvailableCities()`: المدن

## ⚠️ ملاحظات تشغيلية

### 1. حدود استخدام Nominatim:
- استدعاء الخدمة فقط عند التسجيل/التحديث
- إضافة User-Agent: `DirasiqApp/1.0`
- مهلة: 10 ثوانٍ
- لا تستدعي الخدمة عند كل بحث

### 2. التخزين المؤقت:
- يفضل تخزين نتائج الإحداثيات الشائعة
- تقليل الطلبات للخدمة الخارجية

### 3. معالجة الأخطاء:
- إذا فشل Reverse Geocoding: استمر مع الإحداثيات فقط
- لا توقف عملية التسجيل

## 🚀 مثال على الاستخدام

### 1. تسجيل معلم جديد:
```json
POST /api/auth/register/teacher
{
  "name": "أحمد محمد",
  "email": "ahmed@example.com",
  "password": "Password123",
  "phone": "+964501234567",
  "address": "بغداد، العراق",
  "bio": "مدرس رياضيات مع خبرة 5 سنوات",
  "experienceYears": 5,
  "gradeIds": ["uuid1", "uuid2"],
  "studyYear": "2024-2025",
  "latitude": 33.3152,
  "longitude": 44.3661
}
```

### 2. البحث عن مدرسين قريبين:
```json
GET /api/teacher-search/search/coordinates?latitude=33.3152&longitude=44.3661&maxDistance=10
```

### 3. البحث في محافظة معينة:
```json
GET /api/teacher-search/search/location?governorate=بغداد&city=بغداد
```

## 📱 استخدام في الواجهة الأمامية

### 1. الحصول على موقع المستخدم:
```javascript
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      // استخدام الإحداثيات للبحث
    },
    (error) => {
      // استخدام البحث بأسماء المواقع
    }
  );
}
```

### 2. البحث بالإحداثيات:
```javascript
const searchTeachers = async (lat, lon, maxDistance = 5) => {
  const response = await fetch(
    `/api/teacher-search/search/coordinates?latitude=${lat}&longitude=${lon}&maxDistance=${maxDistance}`
  );
  const result = await response.json();
  return result.data.teachers;
};
```

### 3. البحث بأسماء المواقع:
```javascript
const searchTeachersByLocation = async (governorate, city) => {
  const response = await fetch(
    `/api/teacher-search/search/location?governorate=${governorate}&city=${city}`
  );
  const result = await response.json();
  return result.data.teachers;
};

// مثال على البحث في بغداد
const searchTeachersInBaghdad = async () => {
  const teachers = await searchTeachersByLocation('بغداد', 'بغداد');
  console.log('المدرسون في بغداد:', teachers);
};

// مثال على البحث في البصرة
const searchTeachersInBasra = async () => {
  const teachers = await searchTeachersByLocation('البصرة', 'البصرة');
  console.log('المدرسون في البصرة:', teachers);
};
```

## 🔧 التطوير المستقبلي

### 1. تحسينات مقترحة:
- إضافة خوارزميات بحث متقدمة
- دعم البحث باللغة الإنجليزية
- إضافة خرائط تفاعلية
- دعم البحث بالوسوم والمهارات

### 2. خدمات إضافية:
- دعم خدمات Reverse Geocoding مدفوعة
- إضافة خدمات خرائط محلية
- دعم البحث الصوتي

---

**ملاحظة:** هذا الدليل يغطي الأساسيات. يمكن تطويره وإضافة ميزات أخرى حسب الحاجة.

## 🇮🇶 معلومات خاصة بالعراق

### الموقع الجغرافي:
- **العاصمة**: بغداد (33.3152°N, 44.3661°E)
- **المساحة**: حوالي 438,317 كم²
- **عدد المحافظات**: 19 محافظة
- **المناخ**: صحراوي في الجنوب، جبلي في الشمال

### المحافظات الرئيسية:
1. **بغداد** - العاصمة والمركز الإداري
2. **البصرة** - الميناء الرئيسي والمركز الاقتصادي
3. **الموصل** - المركز الثقافي والتاريخي
4. **أربيل** - عاصمة إقليم كردستان
5. **النجف** - المركز الديني الشيعي
6. **كربلاء** - المركز الديني المقدس

### التطبيقات العملية:
- **البحث عن مدرسين**: يمكن للطلاب البحث عن مدرسين في محافظتهم
- **التعليم عن بعد**: دعم التعليم في المناطق النائية
- **التواصل**: تسهيل التواصل بين الطلاب والمدرسين
- **التطوير**: دعم تطوير التعليم في جميع أنحاء العراق

### التحديات والحلول:
- **التغطية الجغرافية**: دعم جميع المحافظات العراقية
- **اللغة**: دعم كامل للغة العربية والكردية
- **البنية التحتية**: تحسين الاتصال بالإنترنت
- **التعليم**: رفع مستوى التعليم في جميع المناطق

# رابط موحد لجلب باقات الاشتراك

## نظرة عامة
تم إنشاء رابط موحد لجلب جميع باقات الاشتراك مع إمكانية الفلترة والبحث والترقيم.

## الرابط الأساسي
```
GET /api/subscription-packages
```

## المعاملات المدعومة

### معاملات إجبارية
- `page` (number): رقم الصفحة (افتراضي: 1)
- `limit` (number): عدد العناصر في الصفحة (افتراضي: 10، الحد الأقصى: 100)

### معاملات اختيارية (يمكن أن تكون null)
- `search` (string): البحث في الاسم والوصف (يمكن أن يكون null)
- `isActive` (boolean): فلترة حسب الحالة (true/false/null)
- `isFree` (boolean): فلترة حسب النوع (true/false/null)
- `sortBy` (JSON string): ترتيب النتائج (يمكن أن يكون null)
- `deleted` (boolean): عرض المحذوفة (افتراضي: false)

## أمثلة الاستخدام

### 1. جلب جميع الباقات (بدون فلترة)
```bash
GET /api/subscription-packages?page=1&limit=10&search=null&isActive=null&isFree=null
```

### 2. جلب الباقات النشطة فقط
```bash
GET /api/subscription-packages?page=1&limit=10&search=null&isActive=true&isFree=null
```

### 3. جلب الباقات المجانية فقط
```bash
GET /api/subscription-packages?page=1&limit=10&search=null&isActive=null&isFree=true
```

### 4. جلب الباقات المدفوعة فقط
```bash
GET /api/subscription-packages?page=1&limit=10&search=null&isActive=null&isFree=false
```

### 5. البحث في الباقات
```bash
GET /api/subscription-packages?page=1&limit=10&search=باقة&isActive=null&isFree=null
```

### 6. فلترة متعددة
```bash
GET /api/subscription-packages?page=1&limit=10&search=باقة&isActive=true&isFree=false
```

### 7. ترتيب النتائج
```bash
GET /api/subscription-packages?page=1&limit=10&search=null&isActive=null&isFree=null&sortBy={"key":"price","order":"asc"}
```

### 8. جلب الباقات المحذوفة
```bash
GET /api/subscription-packages?page=1&limit=10&search=null&isActive=null&isFree=null&deleted=true
```

## الاستجابة

### استجابة ناجحة
```json
{
  "success": true,
  "message": "تم العثور على باقات الاشتراك",
  "data": {
    "packages": [
      {
        "id": "uuid",
        "name": "الباقة الأساسية",
        "description": "وصف الباقة",
        "maxStudents": 10,
        "price": 0,
        "durationDays": 30,
        "isFree": true,
        "isActive": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "deletedAt": null
      }
    ],
    "total": 1,
    "totalPages": 1
  }
}
```

### استجابة خطأ
```json
{
  "success": false,
  "message": "رسالة الخطأ",
  "errors": ["تفاصيل الخطأ"]
}
```

## أمثلة على الاستخدام في الواجهة الأمامية

### JavaScript/Vue.js
```javascript
// دالة لجلب الباقات مع الفلترة
async function getSubscriptionPackages(filters = {}) {
  const params = new URLSearchParams({
    page: filters.page || 1,
    limit: filters.limit || 10,
    search: filters.search || 'null',
    isActive: filters.isActive || 'null',
    isFree: filters.isFree || 'null',
    deleted: filters.deleted || false
  });

  if (filters.sortBy) {
    params.append('sortBy', JSON.stringify(filters.sortBy));
  }

  try {
    const response = await fetch(`/api/subscription-packages?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching subscription packages:', error);
    throw error;
  }
}

// أمثلة على الاستخدام
// جلب جميع الباقات
const allPackages = await getSubscriptionPackages();

// جلب الباقات النشطة
const activePackages = await getSubscriptionPackages({
  isActive: true
});

// جلب الباقات المجانية
const freePackages = await getSubscriptionPackages({
  isFree: true
});

// البحث في الباقات
const searchResults = await getSubscriptionPackages({
  search: 'باقة'
});

// فلترة متعددة
const filteredPackages = await getSubscriptionPackages({
  isActive: true,
  isFree: false,
  search: 'باقة'
});
```

### React
```javascript
import { useState, useEffect } from 'react';

function SubscriptionPackagesList() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    search: null,
    isActive: null,
    isFree: null
  });

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: filters.page,
        limit: filters.limit,
        search: filters.search || 'null',
        isActive: filters.isActive || 'null',
        isFree: filters.isFree || 'null'
      });

      const response = await fetch(`/api/subscription-packages?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        setPackages(data.data.packages);
      }
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, [filters]);

  return (
    <div>
      {/* واجهة الفلترة */}
      <div className="filters">
        <input
          type="text"
          placeholder="البحث..."
          value={filters.search || ''}
          onChange={(e) => setFilters({...filters, search: e.target.value || null})}
        />
        
        <select
          value={filters.isActive || ''}
          onChange={(e) => setFilters({...filters, isActive: e.target.value || null})}
        >
          <option value="">جميع الحالات</option>
          <option value="true">نشط</option>
          <option value="false">غير نشط</option>
        </select>

        <select
          value={filters.isFree || ''}
          onChange={(e) => setFilters({...filters, isFree: e.target.value || null})}
        >
          <option value="">جميع الأنواع</option>
          <option value="true">مجاني</option>
          <option value="false">مدفوع</option>
        </select>
      </div>

      {/* قائمة الباقات */}
      {loading ? (
        <div>جاري التحميل...</div>
      ) : (
        <div className="packages-list">
          {packages.map(pkg => (
            <div key={pkg.id} className="package-card">
              <h3>{pkg.name}</h3>
              <p>{pkg.description}</p>
              <p>السعر: {pkg.isFree ? 'مجاني' : `${pkg.price} دينار`}</p>
              <p>الحد الأقصى للطلاب: {pkg.maxStudents}</p>
              <p>المدة: {pkg.durationDays} يوم</p>
              <span className={`status ${pkg.isActive ? 'active' : 'inactive'}`}>
                {pkg.isActive ? 'نشط' : 'غير نشط'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## خصائص الرابط الموحد

### 1. مرونة في الفلترة
- ✅ جميع المعاملات اختيارية
- ✅ يمكن استخدام `null` لتجاهل الفلترة
- ✅ دعم الفلترة المتعددة

### 2. البحث الذكي
- ✅ البحث في الاسم والوصف
- ✅ البحث غير حساس لحالة الأحرف
- ✅ دعم البحث الجزئي

### 3. الترقيم
- ✅ ترقيم الصفحات
- ✅ تحديد عدد العناصر في الصفحة
- ✅ إرجاع إجمالي عدد العناصر والصفحات

### 4. الترتيب
- ✅ ترتيب حسب أي حقل
- ✅ ترتيب تصاعدي أو تنازلي
- ✅ ترتيب افتراضي حسب تاريخ الإنشاء

### 5. الأمان
- ✅ يتطلب مصادقة (Super Admin فقط)
- ✅ التحقق من صحة المعاملات
- ✅ حماية من SQL Injection

## رسائل الخطأ الشائعة

### 1. معاملات غير صحيحة
```json
{
  "success": false,
  "message": "رقم الصفحة غير صحيح",
  "errors": ["رقم الصفحة غير صحيح"]
}
```

### 2. عدم وجود صلاحيات
```json
{
  "success": false,
  "message": "تم رفض الوصول",
  "errors": ["تم رفض الوصول"]
}
```

### 3. توكن غير صحيح
```json
{
  "success": false,
  "message": "التوكن غير موجود أو منتهي الصلاحية",
  "errors": ["التوكن غير موجود أو منتهي الصلاحية"]
}
```

## نصائح للاستخدام

1. **استخدم `null` بدلاً من حذف المعاملات** لضمان السلوك المتوقع
2. **حدد `limit` مناسب** لتجنب تحميل البيانات ببطء
3. **استخدم البحث** لتحسين تجربة المستخدم
4. **طبق الفلترة** لتقليل عدد النتائج
5. **استخدم الترقيم** للتعامل مع البيانات الكبيرة

## الدعم والمساعدة

إذا واجهت أي مشاكل:
1. تحقق من صحة التوكن
2. تأكد من صلاحيات Super Admin
3. تحقق من صحة المعاملات
4. راجع رسائل الخطأ في الاستجابة

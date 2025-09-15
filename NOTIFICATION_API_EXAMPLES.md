# أمثلة على استخدام API الإشعارات

## 1. إرسال إشعار لجميع المستخدمين

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-all \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "إعلان مهم",
    "message": "سيتم إجراء تحديث على النظام غداً من الساعة 2:00 صباحاً إلى 4:00 صباحاً",
    "type": "system_announcement",
    "priority": "high",
    "data": {
      "maintenance_date": "2024-01-20",
      "maintenance_start": "02:00",
      "maintenance_end": "04:00"
    }
  }'
```

## 2. إرسال إشعار للمعلمين فقط

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "اجتماع المعلمين",
    "message": "سيتم عقد اجتماع للمعلمين يوم الخميس الساعة 3:00 مساءً لمناقشة المناهج الجديدة",
    "type": "system_announcement",
    "priority": "medium",
    "data": {
      "meeting_date": "2024-01-25",
      "meeting_time": "15:00",
      "location": "قاعة الاجتماعات الرئيسية"
    }
  }'
```

## 3. إرسال إشعار للطلاب فقط

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "بداية الفصل الدراسي",
    "message": "مرحباً بكم في الفصل الدراسي الجديد! نتمنى لكم عاماً دراسياً موفقاً ومليئاً بالإنجازات",
    "type": "system_announcement",
    "priority": "medium",
    "data": {
      "semester_start": "2024-01-15",
      "welcome_message": "نرحب بكم في منصة دراسيق التعليمية"
    }
  }'
```

## 4. إرسال إشعار لمستخدمين محددين

```bash
curl -X POST http://localhost:3000/api/notifications/send-to-specific \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "رسالة شخصية",
    "message": "هذه رسالة خاصة لك من المعلم. يرجى مراجعة الواجب المطلوب",
    "type": "teacher_message",
    "priority": "medium",
    "recipientIds": ["user-id-1", "user-id-2", "user-id-3"],
    "recipientType": "specific_students",
    "data": {
      "assignment_id": "assignment-123",
      "due_date": "2024-01-22"
    }
  }'
```

## 5. إرسال تذكير واجب منزلي

```bash
curl -X POST http://localhost:3000/api/notifications/homework-reminder \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "تنبيه واجب منزلي - الرياضيات",
    "message": "لديك واجب منزلي جديد في مادة الرياضيات. يرجى إكماله قبل الموعد المحدد",
    "studentIds": ["student-id-1", "student-id-2"],
    "courseName": "الرياضيات المتقدمة",
    "subjectName": "الجبر الخطي",
    "dueDate": "2024-01-20 23:59"
  }'
```

## 6. إرسال تحديث دورة

```bash
curl -X POST http://localhost:3000/api/notifications/course-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "تحديث في الدورة - الفيزياء",
    "message": "تم إضافة فصل جديد عن الميكانيكا الكمية مع أمثلة عملية",
    "studentIds": ["student-id-1", "student-id-2", "student-id-3"],
    "courseName": "الفيزياء المتقدمة",
    "updateMessage": "تم إضافة فصل عن الميكانيكا الكمية مع أمثلة عملية وتطبيقات"
  }'
```

## 7. إرسال تأكيد حجز

```bash
curl -X POST http://localhost:3000/api/notifications/booking-confirmation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "تأكيد حجز - الكيمياء",
    "message": "تم تأكيد حجزك في الدورة. يرجى الحضور في الموعد المحدد",
    "studentId": "student-id-1",
    "courseName": "الكيمياء العضوية",
    "bookingDate": "2024-01-25 10:00"
  }'
```

## 8. استخدام قالب الإشعارات

```bash
curl -X POST http://localhost:3000/api/notifications/send-template \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "templateName": "homework_reminder",
    "variables": {
      "course_name": "الرياضيات",
      "subject_name": "التفاضل والتكامل",
      "teacher_name": "أحمد محمد علي",
      "due_date": "2024-01-20 23:59"
    },
    "recipients": {
      "userIds": ["student-id-1", "student-id-2", "student-id-3"]
    }
  }'
```

## 9. الحصول على إشعارات المستخدم الحالي

```bash
curl -X GET "http://localhost:3000/api/notifications/user/my-notifications?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 10. الحصول على جميع الإشعارات (للمدير فقط)

```bash
curl -X GET "http://localhost:3000/api/notifications?page=1&limit=10&type=homework_reminder&status=sent" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 11. الحصول على إحصائيات الإشعارات (للمدير فقط)

```bash
curl -X GET http://localhost:3000/api/notifications/statistics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 12. تحديد الإشعار كمقروء

```bash
curl -X PUT http://localhost:3000/api/notifications/notification-id-123/read \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 13. معالجة الإشعارات المعلقة (للمدير فقط)

```bash
curl -X POST http://localhost:3000/api/notifications/process-pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 14. حذف إشعار (للمدير فقط)

```bash
curl -X DELETE http://localhost:3000/api/notifications/notification-id-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 15. الحصول على إشعار محدد

```bash
curl -X GET http://localhost:3000/api/notifications/notification-id-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## أمثلة JavaScript/TypeScript

### استخدام fetch API

```javascript
// إرسال إشعار لجميع المستخدمين
async function sendNotificationToAll() {
  try {
    const response = await fetch('http://localhost:3000/api/notifications/send-to-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        title: 'إعلان مهم',
        message: 'سيتم إجراء تحديث على النظام غداً',
        type: 'system_announcement',
        priority: 'high'
      })
    });

    const data = await response.json();
    console.log('Notification sent:', data);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

// الحصول على إشعارات المستخدم
async function getUserNotifications(page = 1, limit = 10) {
  try {
    const response = await fetch(`http://localhost:3000/api/notifications/user/my-notifications?page=${page}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await response.json();
    console.log('User notifications:', data);
    return data;
  } catch (error) {
    console.error('Error fetching notifications:', error);
  }
}

// تحديد إشعار كمقروء
async function markNotificationAsRead(notificationId) {
  try {
    const response = await fetch(`http://localhost:3000/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await response.json();
    console.log('Notification marked as read:', data);
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}
```

### استخدام axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

// إرسال تذكير واجب منزلي
async function sendHomeworkReminder() {
  try {
    const response = await api.post('/notifications/homework-reminder', {
      title: 'تنبيه واجب منزلي - الرياضيات',
      message: 'لديك واجب منزلي جديد في مادة الرياضيات',
      studentIds: ['student-id-1', 'student-id-2'],
      courseName: 'الرياضيات المتقدمة',
      subjectName: 'الجبر',
      dueDate: '2024-01-20'
    });

    console.log('Homework reminder sent:', response.data);
  } catch (error) {
    console.error('Error sending homework reminder:', error);
  }
}

// الحصول على إحصائيات الإشعارات
async function getNotificationStatistics() {
  try {
    const response = await api.get('/notifications/statistics');
    console.log('Notification statistics:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching statistics:', error);
  }
}
```

## أمثلة React Hook

```javascript
import { useState, useEffect } from 'react';

// Hook للحصول على إشعارات المستخدم
function useUserNotifications(page = 1, limit = 10) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/notifications/user/my-notifications?page=${page}&limit=${limit}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        const data = await response.json();
        setNotifications(data.data.notifications);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [page, limit]);

  return { notifications, loading, error };
}

// Hook لإرسال الإشعارات
function useSendNotification() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendNotification = async (notificationData) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/notifications/send-to-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(notificationData)
      });

      const data = await response.json();
      return data;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { sendNotification, loading, error };
}
```

## نصائح للاستخدام

1. **تأكد من صحة JWT Token**: جميع الطلبات تتطلب token صحيح
2. **استخدم الأولويات المناسبة**: urgent للطوارئ، high للمهم، medium للعادي، low للغير عاجل
3. **تحقق من صلاحيات المستخدم**: بعض الطلبات تتطلب صلاحيات خاصة
4. **استخدم Pagination**: للحصول على قوائم طويلة من الإشعارات
5. **تعامل مع الأخطاء**: تحقق من response status و error messages
6. **استخدم القوالب**: لتوفير الوقت في إرسال الإشعارات المتكررة

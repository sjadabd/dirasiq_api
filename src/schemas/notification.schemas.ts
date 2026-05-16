// Zod schemas for /api/notifications/* (the admin/teacher notification hub).
//
// Mirrors the legacy `notificationValidation` rules from
// `notification.controller.ts` but expressed declaratively. The recipient
// modes match `NotificationModel`'s `RecipientType` enum.

import { z } from 'zod';

import {
  optionalString,
  optionalUuid,
  paginationQuerySchema,
  uuidSchema,
} from './common.schemas';

const notificationTypeSchema = z.enum([
  'course_update',
  'class_reminder',
  'payment_reminder',
  'assignment_due',
  'grade_update',
  'system_announcement',
  'teacher_message',
  'parent_notification',
  'booking_status',
]);

const notificationPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

const recipientTypeAnySchema = z.enum([
  'all',
  'teachers',
  'students',
  'parents',
  'specific_teachers',
  'specific_students',
  'specific_parents',
]);

const specificRecipientTypeSchema = z.enum([
  'specific_teachers',
  'specific_students',
  'specific_parents',
]);

const attachmentsSchema = z
  .object({
    pdfBase64: z.string().optional(),
    imagesBase64: z.array(z.string()).optional(),
  })
  .passthrough();

const baseNotificationBody = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(255, 'العنوان طويل جداً'),
  message: z.string().trim().min(1, 'الرسالة مطلوبة'),
  type: notificationTypeSchema.optional(),
  priority: notificationPrioritySchema.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  url: z.string().url('رابط غير صحيح').optional().or(z.literal('')),
  imageUrl: z.string().url('رابط الصورة غير صحيح').optional().or(z.literal('')),
  attachments: attachmentsSchema.optional(),
});

// POST /api/notifications/send-to-{all,teachers,students}
export const sendBroadcastNotificationSchema = baseNotificationBody;

// POST /api/notifications/send-to-specific
export const sendSpecificNotificationSchema = baseNotificationBody.extend({
  recipientIds: z.array(uuidSchema).min(1, 'يجب تحديد مستلم واحد على الأقل'),
  recipientType: specificRecipientTypeSchema.optional(),
});

// POST /api/notifications/send-template
export const sendTemplateNotificationSchema = z.object({
  templateName: z.string().trim().min(1, 'اسم القالب مطلوب'),
  variables: z.record(z.string(), z.unknown()),
  recipients: z.object({
    userIds: z.array(uuidSchema).optional(),
    userTypes: z.array(z.string()).optional(),
    allUsers: z.boolean().optional(),
  }),
});

// GET /api/notifications (super-admin only)
export const notificationsListQuerySchema = paginationQuerySchema.extend({
  type: notificationTypeSchema.optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']).optional(),
  priority: notificationPrioritySchema.optional(),
  recipientType: recipientTypeAnySchema.optional(),
  createdBy: optionalUuid,
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// GET /api/notifications/user/my-notifications
export const myNotificationsQuerySchema = paginationQuerySchema.extend({
  q: optionalString,
  type: notificationTypeSchema.optional(),
  courseId: optionalUuid,
  subType: optionalString,
});

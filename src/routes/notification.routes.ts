// /api/notifications — the centralised hub for the dashboard notification
// dispatcher and inbox.
//
// Role matrix:
//   - POST /send-to-{all,teachers,students,specific} → super-admin OR teacher
//   - POST /send-template                            → super-admin OR teacher
//   - GET  /                                          → super-admin
//   - GET  /statistics                                → super-admin
//   - POST /process-pending                           → super-admin
//   - DELETE /:id                                     → super-admin
//   - GET  /:id                                       → any authenticated user
//     (controller-side ownership is owed in Phase 1.C; for now any authed
//      user can fetch any notification by id, matching legacy behaviour)
//   - GET  /user/my-notifications                     → any authenticated user
//   - PUT  /user/mark-all-read                        → any authenticated user
//   - PUT  /:id/read                                  → any authenticated user

import { Router } from 'express';

import {
  NotificationController,
  allowAdminOnly,
  allowAdminOrTeacher,
} from '../controllers/notification.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/async-handler';
import { idParamSchema } from '../schemas/common.schemas';
import {
  myNotificationsQuerySchema,
  notificationsListQuerySchema,
  sendBroadcastNotificationSchema,
  sendSpecificNotificationSchema,
  sendTemplateNotificationSchema,
} from '../schemas/notification.schemas';

const router = Router();
const notificationController = new NotificationController();

router.use(authenticateToken);

// --- Broadcasts (admin or teacher) ---
router.post(
  '/send-to-all',
  allowAdminOrTeacher,
  validate({ body: sendBroadcastNotificationSchema }),
  asyncHandler(notificationController.sendToAll)
);

router.post(
  '/send-to-teachers',
  allowAdminOrTeacher,
  validate({ body: sendBroadcastNotificationSchema }),
  asyncHandler(notificationController.sendToTeachers)
);

router.post(
  '/send-to-students',
  allowAdminOrTeacher,
  validate({ body: sendBroadcastNotificationSchema }),
  asyncHandler(notificationController.sendToStudents)
);

router.post(
  '/send-to-specific',
  allowAdminOrTeacher,
  validate({ body: sendSpecificNotificationSchema }),
  asyncHandler(notificationController.sendToSpecificUsers)
);

router.post(
  '/send-template',
  allowAdminOrTeacher,
  validate({ body: sendTemplateNotificationSchema }),
  asyncHandler(notificationController.sendTemplateNotification)
);

// --- Admin-only listings + maintenance ---
router.get(
  '/',
  allowAdminOnly,
  validate({ query: notificationsListQuerySchema }),
  asyncHandler(notificationController.getNotifications)
);

router.get('/statistics', allowAdminOnly, asyncHandler(notificationController.getStatistics));

router.post(
  '/process-pending',
  allowAdminOnly,
  asyncHandler(notificationController.processPendingNotifications)
);

router.delete(
  '/:id',
  allowAdminOnly,
  validate({ params: idParamSchema }),
  asyncHandler(notificationController.deleteNotification)
);

// --- Self-service (any authenticated user) ---
router.get(
  '/user/my-notifications',
  validate({ query: myNotificationsQuerySchema }),
  asyncHandler(notificationController.getUserNotifications)
);

router.put(
  '/user/mark-all-read',
  asyncHandler(notificationController.markAllAsRead)
);

router.put(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(notificationController.markAsRead)
);

// Generic lookup (any authenticated user). Defined last so static paths win.
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(notificationController.getNotificationById)
);

export default router;

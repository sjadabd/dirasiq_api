import { Router } from 'express';

import { TeacherNotificationController } from '../../controllers/teacher/notification.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema, paginationQuerySchema } from '../../schemas/common.schemas';
import {
  teacherNotificationCreateSchema,
  teacherNotificationListQuerySchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: teacherNotificationListQuerySchema }),
  asyncHandler(TeacherNotificationController.listMyNotifications)
);

router.get(
  '/unread',
  validate({ query: paginationQuerySchema }),
  asyncHandler(TeacherNotificationController.listMyUnreadNotifications)
);

router.post(
  '/',
  validate({ body: teacherNotificationCreateSchema }),
  asyncHandler(TeacherNotificationController.createNotification)
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherNotificationController.deleteNotification)
);

export default router;

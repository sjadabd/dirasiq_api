import { Router } from 'express';

import { TeacherAnnouncementController } from '../../controllers/teacher/announcement.controller';
import { validate } from '../../middleware/validate.middleware';
import { idParamSchema, paginationQuerySchema } from '../../schemas/common.schemas';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get(
  '/',
  validate({ query: paginationQuerySchema }),
  asyncHandler(TeacherAnnouncementController.list),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAnnouncementController.getById),
);

export default router;

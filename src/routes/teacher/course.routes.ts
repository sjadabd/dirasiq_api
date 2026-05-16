import { Router } from 'express';

import { CourseController } from '../../controllers/teacher/course.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema, paginationQuerySchema } from '../../schemas/common.schemas';
import {
  courseCreateSchema,
  courseListQuerySchema,
  courseUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/',
  validate({ body: courseCreateSchema }),
  asyncHandler(CourseController.create)
);
router.get(
  '/',
  validate({ query: courseListQuerySchema }),
  asyncHandler(CourseController.getAll)
);
router.get('/names', asyncHandler(CourseController.listNamesForActiveYear));
router.get(
  '/deleted-not-expired',
  validate({ query: paginationQuerySchema }),
  asyncHandler(CourseController.getDeletedNotExpired)
);
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(CourseController.getById)
);
router.put(
  '/:id',
  validate({ params: idParamSchema, body: courseUpdateSchema }),
  asyncHandler(CourseController.update)
);
router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(CourseController.delete)
);
router.patch(
  '/:id/restore',
  validate({ params: idParamSchema }),
  asyncHandler(CourseController.restore)
);

export default router;

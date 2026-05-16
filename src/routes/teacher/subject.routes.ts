import { Router } from 'express';

import { SubjectController } from '../../controllers/teacher/subject.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  subjectCreateSchema,
  subjectListQuerySchema,
  subjectUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/',
  validate({ body: subjectCreateSchema }),
  asyncHandler(SubjectController.create)
);
router.get(
  '/',
  validate({ query: subjectListQuerySchema }),
  asyncHandler(SubjectController.getAll)
);
router.get('/all', asyncHandler(SubjectController.getAllSubjects));
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SubjectController.getById)
);
router.put(
  '/:id',
  validate({ params: idParamSchema, body: subjectUpdateSchema }),
  asyncHandler(SubjectController.update)
);
router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(SubjectController.delete)
);
router.patch(
  '/:id/restore',
  validate({ params: idParamSchema }),
  asyncHandler(SubjectController.restore)
);
router.delete(
  '/:id/hard',
  validate({ params: idParamSchema }),
  asyncHandler(SubjectController.hardDelete)
);

export default router;

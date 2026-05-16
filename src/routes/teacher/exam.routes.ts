import { Router } from 'express';

import { TeacherExamController } from '../../controllers/teacher/exam.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { examGradeParamsSchema, idParamSchema } from '../../schemas/common.schemas';
import {
  examCreateSchema,
  examGradeBodySchema,
  examListQuerySchema,
  examStudentsQuerySchema,
  examUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post('/', validate({ body: examCreateSchema }), asyncHandler(TeacherExamController.create));
router.get('/', validate({ query: examListQuerySchema }), asyncHandler(TeacherExamController.list));
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherExamController.getById)
);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: examUpdateSchema }),
  asyncHandler(TeacherExamController.update)
);
router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherExamController.remove)
);
router.get(
  '/:id/students',
  validate({ params: idParamSchema, query: examStudentsQuerySchema }),
  asyncHandler(TeacherExamController.students)
);
router.put(
  '/:examId/grade/:studentId',
  validate({ params: examGradeParamsSchema, body: examGradeBodySchema }),
  asyncHandler(TeacherExamController.grade)
);

export default router;

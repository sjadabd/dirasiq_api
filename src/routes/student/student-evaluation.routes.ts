import { Router } from 'express';

import { StudentStudentEvaluationController } from '../../controllers/student/student-evaluation.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import { studentEvaluationListQuerySchema } from '../../schemas/student.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: studentEvaluationListQuerySchema }),
  asyncHandler(StudentStudentEvaluationController.list)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentStudentEvaluationController.getById)
);

export default router;

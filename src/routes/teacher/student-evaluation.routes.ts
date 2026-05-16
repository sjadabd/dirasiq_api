import { Router } from 'express';

import { TeacherStudentEvaluationController } from '../../controllers/teacher/student-evaluation.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  evaluationBulkUpsertSchema,
  evaluationListQuerySchema,
  evaluationStudentsWithEvalQuerySchema,
  evaluationUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/bulk-upsert',
  validate({ body: evaluationBulkUpsertSchema }),
  asyncHandler(TeacherStudentEvaluationController.bulkUpsert)
);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: evaluationUpdateSchema }),
  asyncHandler(TeacherStudentEvaluationController.update)
);
router.get(
  '/',
  validate({ query: evaluationListQuerySchema }),
  asyncHandler(TeacherStudentEvaluationController.list)
);
router.get(
  '/students-with-eval',
  validate({ query: evaluationStudentsWithEvalQuerySchema }),
  asyncHandler(TeacherStudentEvaluationController.studentsWithEvaluation)
);
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherStudentEvaluationController.getById)
);

export default router;

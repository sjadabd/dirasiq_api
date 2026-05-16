import { Router } from 'express';

import { StudentExamController } from '../../controllers/student/exam.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  studentExamListQuerySchema,
  studentExamReportQuerySchema,
} from '../../schemas/student.schemas';

const router = Router();

// Static path first to avoid being shadowed by `:id`.
router.get(
  '/report/by-type',
  validate({ query: studentExamReportQuerySchema }),
  asyncHandler(StudentExamController.report)
);

router.get(
  '/',
  validate({ query: studentExamListQuerySchema }),
  asyncHandler(StudentExamController.list)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentExamController.getById)
);

router.get(
  '/:id/my-grade',
  validate({ params: idParamSchema }),
  asyncHandler(StudentExamController.myGrade)
);

export default router;

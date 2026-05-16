import { Router } from 'express';

import { TeacherReportController } from '../../controllers/teacher/report.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { financialReportQuerySchema } from '../../schemas/teacher.schemas';

const router = Router();

router.get(
  '/financial',
  validate({ query: financialReportQuerySchema }),
  asyncHandler(TeacherReportController.financial)
);

export default router;

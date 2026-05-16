import { Router } from 'express';

import { StudentSearchController } from '../../controllers/student/search.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { studentUnifiedSearchQuerySchema } from '../../schemas/student.schemas';

const router = Router();

router.get(
  '/unified',
  validate({ query: studentUnifiedSearchQuerySchema }),
  asyncHandler(StudentSearchController.unified)
);

export default router;

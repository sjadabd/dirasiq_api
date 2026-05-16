import { Router } from 'express';

import { StudentAssignmentController } from '../../controllers/student/assignment.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  studentAssignmentListQuerySchema,
  studentAssignmentSubmitBodySchema,
} from '../../schemas/student.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: studentAssignmentListQuerySchema }),
  asyncHandler(StudentAssignmentController.list)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(StudentAssignmentController.getById)
);

router.get(
  '/:id/submission',
  validate({ params: idParamSchema }),
  asyncHandler(StudentAssignmentController.mySubmission)
);

router.post(
  '/:id/submit',
  validate({ params: idParamSchema, body: studentAssignmentSubmitBodySchema }),
  asyncHandler(StudentAssignmentController.submit)
);

export default router;

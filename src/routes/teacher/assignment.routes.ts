import { Router } from 'express';

import { TeacherAssignmentController } from '../../controllers/teacher/assignment.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import {
  assignmentGradeParamsSchema,
  assignmentSubmissionParamsSchema,
  idParamSchema,
} from '../../schemas/common.schemas';
import {
  assignmentCreateSchema,
  assignmentGradeBodySchema,
  assignmentListQuerySchema,
  assignmentReceivedBodySchema,
  assignmentRecipientsBodySchema,
  assignmentUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/',
  validate({ body: assignmentCreateSchema }),
  asyncHandler(TeacherAssignmentController.create)
);
router.get(
  '/',
  validate({ query: assignmentListQuerySchema }),
  asyncHandler(TeacherAssignmentController.list)
);
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAssignmentController.getById)
);
router.get(
  '/:id/overview',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAssignmentController.overview)
);
router.get(
  '/:id/students',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAssignmentController.students)
);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: assignmentUpdateSchema }),
  asyncHandler(TeacherAssignmentController.update)
);
router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAssignmentController.remove)
);
router.put(
  '/:id/recipients',
  validate({ params: idParamSchema, body: assignmentRecipientsBodySchema }),
  asyncHandler(TeacherAssignmentController.setRecipients)
);
router.put(
  '/:assignmentId/grade/:studentId',
  validate({ params: assignmentGradeParamsSchema, body: assignmentGradeBodySchema }),
  asyncHandler(TeacherAssignmentController.grade)
);
router.put(
  '/:assignmentId/received/:studentId',
  validate({ params: assignmentGradeParamsSchema, body: assignmentReceivedBodySchema }),
  asyncHandler(TeacherAssignmentController.markReceived)
);
router.get(
  '/:id/recipients',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAssignmentController.recipients)
);
router.get(
  '/:assignmentId/submission/:studentId',
  validate({ params: assignmentSubmissionParamsSchema }),
  asyncHandler(TeacherAssignmentController.getStudentSubmission)
);

export default router;

import { Router } from 'express';

import { TeacherRosterController } from '../../controllers/teacher/roster.controller';
import { TeacherSessionController } from '../../controllers/teacher/session.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { courseIdParamSchema, idParamSchema } from '../../schemas/common.schemas';
import {
  rosterSessionNamesQuerySchema,
  sessionAttendanceQuerySchema,
  sessionAttendeesBodySchema,
  sessionBulkAttendanceBodySchema,
  sessionCreateSchema,
  sessionListQuerySchema,
  sessionUpdateSchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.post(
  '/',
  validate({ body: sessionCreateSchema }),
  asyncHandler(TeacherSessionController.createSession)
);

router.get(
  '/',
  validate({ query: sessionListQuerySchema }),
  asyncHandler(TeacherSessionController.listMySessions)
);

router.get(
  '/names',
  validate({ query: rosterSessionNamesQuerySchema }),
  asyncHandler(TeacherRosterController.listSessionNames)
);

router.get(
  '/courses/:courseId/confirmed-students',
  validate({ params: courseIdParamSchema }),
  asyncHandler(TeacherSessionController.getConfirmedStudentsByCourse)
);

router.get(
  '/:id/attendees',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherSessionController.listAttendees)
);
router.post(
  '/:id/attendees',
  validate({ params: idParamSchema, body: sessionAttendeesBodySchema }),
  asyncHandler(TeacherSessionController.addAttendees)
);
router.delete(
  '/:id/attendees',
  validate({ params: idParamSchema, body: sessionAttendeesBodySchema }),
  asyncHandler(TeacherSessionController.removeAttendees)
);

router.get(
  '/:id/attendance',
  validate({ params: idParamSchema, query: sessionAttendanceQuerySchema }),
  asyncHandler(TeacherSessionController.getSessionAttendanceByDate)
);
router.post(
  '/:id/attendance',
  validate({ params: idParamSchema, body: sessionBulkAttendanceBodySchema }),
  asyncHandler(TeacherSessionController.bulkSetSessionAttendance)
);

router.put(
  '/:id',
  validate({ params: idParamSchema, body: sessionUpdateSchema }),
  asyncHandler(TeacherSessionController.updateSession)
);
router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherSessionController.deleteSession)
);
router.post(
  '/:id/end',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherSessionController.endSessionAndNotify)
);

export default router;

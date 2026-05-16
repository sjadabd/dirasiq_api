import { Router } from 'express';

import { TeacherRosterController } from '../../controllers/teacher/roster.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { courseIdParamSchema, sessionIdParamSchema } from '../../schemas/common.schemas';
import {
  rosterListQuerySchema,
  rosterSessionNamesQuerySchema,
} from '../../schemas/teacher.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: rosterListQuerySchema }),
  asyncHandler(TeacherRosterController.listAllStudents)
);

router.get(
  '/by-course/:courseId',
  validate({ params: courseIdParamSchema }),
  asyncHandler(TeacherRosterController.listStudentsByCourse)
);

router.get(
  '/by-course/:courseId/paginated',
  validate({ params: courseIdParamSchema, query: rosterListQuerySchema }),
  asyncHandler(TeacherRosterController.listStudentsByCoursePaginated)
);

router.get(
  '/by-session/:sessionId',
  validate({ params: sessionIdParamSchema }),
  asyncHandler(TeacherRosterController.listStudentsBySession)
);

router.get(
  '/sessions/names',
  validate({ query: rosterSessionNamesQuerySchema }),
  asyncHandler(TeacherRosterController.listSessionNames)
);

router.get('/courses/names', asyncHandler(TeacherRosterController.listCourseNames));

export default router;

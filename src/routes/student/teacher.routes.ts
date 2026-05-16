import { Router } from 'express';

import { StudentTeacherController } from '../../controllers/student/teacher.controller';
import { TeacherProfileController } from '../../controllers/teacher/profile.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { teacherIdParamSchema } from '../../schemas/common.schemas';
import {
  suggestedTeachersQuerySchema,
  teacherSubjectsCoursesQuerySchema,
} from '../../schemas/student.schemas';

const router = Router();

router.get(
  '/suggested',
  validate({ query: suggestedTeachersQuerySchema }),
  asyncHandler(StudentTeacherController.getSuggestedTeachers)
);

router.get(
  '/:teacherId/subjects-courses',
  validate({ params: teacherIdParamSchema, query: teacherSubjectsCoursesQuerySchema }),
  asyncHandler(StudentTeacherController.getTeacherSubjectsAndCourses)
);

router.get(
  '/:teacherId/intro-video',
  validate({ params: teacherIdParamSchema }),
  asyncHandler(TeacherProfileController.getTeacherIntroVideo)
);

export default router;

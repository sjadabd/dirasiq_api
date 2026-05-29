// /api/teacher/my-grades — teacher self-service grade-set sync.
//
// Auth + role enforcement live at the parent router (`routes/teacher/index.ts`
// applies `authenticateToken + requireRole(TEACHER)`), so this file only
// declares the two endpoints and their input contracts.

import { Router } from 'express';

import { TeacherMyGradesController } from '../../controllers/teacher/my-grades.controller';
import { validate } from '../../middleware/validate.middleware';
import { teacherSyncMyGradesBodySchema } from '../../schemas/teacher.schemas';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get('/', asyncHandler(TeacherMyGradesController.list));

router.put(
  '/',
  validate({ body: teacherSyncMyGradesBodySchema }),
  asyncHandler(TeacherMyGradesController.sync)
);

export default router;

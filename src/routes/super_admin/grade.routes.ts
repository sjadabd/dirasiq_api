// /api/grades — mixed-role surface:
//   - GET /all-student     → fully public (used by the student-facing
//                             registration flow before the user has a token)
//   - GET /all             → any authenticated user (teacher + student dashboards)
//   - GET /my-grades       → any authenticated user
//   - GET /:id             → super-admin
//   - GET /                → super-admin
//   - GET /active          → super-admin
//   - POST / PUT / DELETE  → super-admin
//
// We attach middleware per-route instead of router-level so the public
// `/all-student` survives next to the protected routes.

import { Router } from 'express';

import { GradeController } from '../../controllers/super_admin/grade.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  gradeCreateSchema,
  gradeListQuerySchema,
  gradeUpdateSchema,
  userGradesQuerySchema,
} from '../../schemas/super-admin.schemas';

const router = Router();

const adminOnly = [authenticateToken, requireRole(UserType.SUPER_ADMIN)] as const;

// Public — list of active grades for the student registration screen.
router.get('/all-student', asyncHandler(GradeController.getAllActive));

// Any authenticated user.
router.get('/all', authenticateToken, asyncHandler(GradeController.getAllActive));
router.get(
  '/my-grades',
  authenticateToken,
  validate({ query: userGradesQuerySchema }),
  asyncHandler(GradeController.getUserGrades)
);

// Super-admin — full CRUD + active.
router.post(
  '/',
  ...adminOnly,
  validate({ body: gradeCreateSchema }),
  asyncHandler(GradeController.create)
);
router.get(
  '/',
  ...adminOnly,
  validate({ query: gradeListQuerySchema }),
  asyncHandler(GradeController.getAll)
);
router.get('/active', ...adminOnly, asyncHandler(GradeController.getActive));
router.get(
  '/:id',
  ...adminOnly,
  validate({ params: idParamSchema }),
  asyncHandler(GradeController.getById)
);
router.put(
  '/:id',
  ...adminOnly,
  validate({ params: idParamSchema, body: gradeUpdateSchema }),
  asyncHandler(GradeController.update)
);
router.delete(
  '/:id',
  ...adminOnly,
  validate({ params: idParamSchema }),
  asyncHandler(GradeController.delete)
);

export default router;

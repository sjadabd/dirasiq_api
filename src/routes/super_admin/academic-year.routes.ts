import { Router } from 'express';

import { AcademicYearController } from '../../controllers/super_admin/academic-year.controller';
import { authenticateToken, requireRole } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { UserType } from '../../types';
import { idParamSchema } from '../../schemas/common.schemas';
import {
  academicYearCreateSchema,
  academicYearListQuerySchema,
  academicYearUpdateSchema,
} from '../../schemas/super-admin.schemas';

const router = Router();

router.use(authenticateToken, requireRole(UserType.SUPER_ADMIN));

router.post(
  '/',
  validate({ body: academicYearCreateSchema }),
  asyncHandler(AcademicYearController.create)
);

// Static path before `:id`.
router.get('/active', asyncHandler(AcademicYearController.getActive));

router.get(
  '/',
  validate({ query: academicYearListQuerySchema }),
  asyncHandler(AcademicYearController.getAll)
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(AcademicYearController.getById)
);

router.put(
  '/:id',
  validate({ params: idParamSchema, body: academicYearUpdateSchema }),
  asyncHandler(AcademicYearController.update)
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(AcademicYearController.delete)
);

router.patch(
  '/:id/activate',
  validate({ params: idParamSchema }),
  asyncHandler(AcademicYearController.activate)
);

export default router;

// /api/teacher-search — PUBLIC discovery endpoints used by the marketing
// pages and by the Flutter onboarding "find a teacher" flow before the user
// has a token. No `authenticateToken` here — intentional. Validation by Zod
// on every route.

import { Router } from 'express';

import { TeacherSearchController } from '../controllers/teacher-search.controller';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../utils/async-handler';
import {
  governorateParamSchema,
  teacherSearchByCoordinatesQuerySchema,
  teacherSearchByLocationQuerySchema,
} from '../schemas/misc.schemas';

const router = Router();

router.get(
  '/search/coordinates',
  validate({ query: teacherSearchByCoordinatesQuerySchema }),
  asyncHandler(TeacherSearchController.searchByCoordinates)
);

router.get(
  '/search/location',
  validate({ query: teacherSearchByLocationQuerySchema }),
  asyncHandler(TeacherSearchController.searchByLocation)
);

router.get('/governorates', asyncHandler(TeacherSearchController.getGovernorates));

router.get(
  '/cities/:governorate',
  validate({ params: governorateParamSchema }),
  asyncHandler(TeacherSearchController.getCities)
);

export default router;

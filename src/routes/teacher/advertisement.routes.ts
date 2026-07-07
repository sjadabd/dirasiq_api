import { Router } from 'express';

import { TeacherAdvertisementController } from '../../controllers/teacher/advertisement.controller';
import { validate } from '../../middleware/validate.middleware';
import {
  advertisementCreateSchema,
  advertisementListQuerySchema,
  advertisementUpdateSchema,
} from '../../schemas/advertisement.schemas';
import { idParamSchema } from '../../schemas/common.schemas';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get(
  '/statistics',
  asyncHandler(TeacherAdvertisementController.statistics),
);

router.get(
  '/',
  validate({ query: advertisementListQuerySchema }),
  asyncHandler(TeacherAdvertisementController.list),
);

router.post(
  '/',
  validate({ body: advertisementCreateSchema }),
  asyncHandler(TeacherAdvertisementController.create),
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAdvertisementController.getById),
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: advertisementUpdateSchema }),
  asyncHandler(TeacherAdvertisementController.update),
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAdvertisementController.remove),
);

router.post(
  '/:id/submit',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAdvertisementController.submit),
);

router.post(
  '/:id/cancel',
  validate({ params: idParamSchema }),
  asyncHandler(TeacherAdvertisementController.cancel),
);

export default router;

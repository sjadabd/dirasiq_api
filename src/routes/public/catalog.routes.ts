// Reference-data routes exposed unauthenticated for the Flutter
// teacher-application form (pre-login dropdowns).

import { Router } from 'express';

import { PublicCatalogController } from '../../controllers/public/catalog.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get('/subjects', asyncHandler(PublicCatalogController.subjects));
router.get('/teaching-stages', asyncHandler(PublicCatalogController.teachingStages));

export default router;

// /api/teacher/commission-preview
//
// Single-endpoint router for the Phase 3 commission preview. Mounted at
// `/commission-preview` in routes/teacher/index.ts so the Phase 5
// dashboard wizard can call it directly.

import { Router } from 'express';

import { TeacherCommissionPreviewController } from '../../controllers/teacher/commission-preview.controller';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../utils/async-handler';
import { commissionPreviewQuerySchema } from '../../schemas/video-course.schemas';

const router = Router();

router.get(
  '/',
  validate({ query: commissionPreviewQuerySchema }),
  asyncHandler(TeacherCommissionPreviewController.preview)
);

export default router;

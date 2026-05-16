import { Router } from 'express';
import { TeacherAcademicYearController } from '../../controllers/teacher/academic-year.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get('/', asyncHandler(TeacherAcademicYearController.list));

export default router;

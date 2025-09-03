import { Router } from 'express';
import courseRoutes from './course.routes';

const router = Router();

// Student course routes
router.use('/courses', courseRoutes);

export default router;

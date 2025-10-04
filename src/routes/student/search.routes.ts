import { Router } from 'express';
import { authenticateToken, requireStudent } from '@/middleware/auth.middleware';
import { StudentSearchController } from '@/controllers/student/search.controller';

const router = Router();

router.use(authenticateToken, requireStudent);

// Unified search across teachers, courses, subjects
router.get('/unified', StudentSearchController.unified);

export default router;

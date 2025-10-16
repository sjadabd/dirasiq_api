import { Router } from 'express';
import { StudentSearchController } from '../../controllers/student/search.controller';
import { authenticateToken, requireStudent } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken, requireStudent);

// Unified search across teachers, courses, subjects
router.get('/unified', StudentSearchController.unified);

export default router;

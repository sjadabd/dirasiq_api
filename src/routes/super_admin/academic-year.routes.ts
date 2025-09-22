import { AcademicYearController } from '@/controllers/super_admin/academic-year.controller';
import { authenticateToken, requireSuperAdmin } from '@/middleware/auth.middleware';
import { Router } from 'express';

const router = Router();

// All routes require authentication and super admin access
router.use(authenticateToken);
router.use(requireSuperAdmin);

// Create new academic year
router.post('/', AcademicYearController.create);

// Get all academic years with pagination
router.get('/active', AcademicYearController.getActive);
router.get('/', AcademicYearController.getAll);

// Get academic year by ID
router.get('/:id', AcademicYearController.getById);

// Update academic year
router.put('/:id', AcademicYearController.update);

// Delete academic year
router.delete('/:id', AcademicYearController.delete);

// Activate academic year
router.patch('/:id/activate', AcademicYearController.activate);

export default router;

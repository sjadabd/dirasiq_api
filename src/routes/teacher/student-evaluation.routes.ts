import { Router } from 'express';
import { TeacherStudentEvaluationController } from '../../controllers/teacher/student-evaluation.controller';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';

const router = Router();

// Bulk upsert evaluations for multiple students on a specific date
router.post('/bulk-upsert', authenticateToken, requireTeacher, TeacherStudentEvaluationController.bulkUpsert);

// Update single evaluation
router.patch('/:id', authenticateToken, requireTeacher, TeacherStudentEvaluationController.update);

// List evaluations for the teacher (filters: studentId, from, to, page, limit)
router.get('/', authenticateToken, requireTeacher, TeacherStudentEvaluationController.list);

// List teacher's students with their evaluation for a specific date, filtered by courseId/sessionId
router.get('/students-with-eval', authenticateToken, requireTeacher, TeacherStudentEvaluationController.studentsWithEvaluation);

// Get single evaluation by id (teacher-owned)
router.get('/:id', authenticateToken, requireTeacher, TeacherStudentEvaluationController.getById);

export default router;

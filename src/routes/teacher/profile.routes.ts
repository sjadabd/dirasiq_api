import { Router } from 'express';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';
import { TeacherProfileController } from '../../controllers/teacher/profile.controller';

const router = Router();

router.use(authenticateToken, requireTeacher);

router.post('/intro-video', TeacherProfileController.uploadIntroVideo);
router.get('/intro-video', TeacherProfileController.getMyIntroVideo);

export default router;

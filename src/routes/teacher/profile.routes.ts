import { Router } from 'express';
import { authenticateToken, requireTeacher } from '../../middleware/auth.middleware';
import { TeacherProfileController } from '../../controllers/teacher/profile.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

router.use(authenticateToken, requireTeacher);

// Ensure temp upload directory exists
const tempDir = path.join(process.cwd(), 'tmp', 'uploads');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Multer configuration for video uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('video/')) return cb(null, true);
  cb(new Error('Only video files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 1024 * 1024 * 1024 } }); // 1GB

router.post('/intro-video', upload.single('video'), TeacherProfileController.uploadIntroVideo);
router.get('/intro-video', TeacherProfileController.getMyIntroVideo);

export default router;

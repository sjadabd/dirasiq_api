import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';

import { TeacherProfileController } from '../../controllers/teacher/profile.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

// Ensure temp upload directory exists
const tempDir = path.join(process.cwd(), 'tmp', 'uploads');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tempDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('video/')) return cb(null, true);
  cb(new Error('Only video files are allowed'));
};

// 1 GB cap on intro videos. Per-route override of the global 1000 MB body limit
// is acceptable; rationale: video upload is the only oversized payload path.
const upload = multer({ storage, fileFilter, limits: { fileSize: 1024 * 1024 * 1024 } });

router.post(
  '/intro-video',
  upload.single('video'),
  asyncHandler(TeacherProfileController.uploadIntroVideo)
);
router.get('/intro-video', asyncHandler(TeacherProfileController.getMyIntroVideo));

export default router;

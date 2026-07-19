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

// Spec: intro videos max 50MB (MP4, ≤60s). Bunny path streams direct to CDN.
const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

router.post(
  '/intro-video',
  upload.single('video'),
  asyncHandler(TeacherProfileController.uploadIntroVideo)
);
router.get('/intro-video', asyncHandler(TeacherProfileController.getMyIntroVideo));

// Phase 10.1.B.2 — Bunny Stream upload contract for the teacher's intro
// video. Body-less POST; the response carries everything the client needs
// to PUT the bytes directly to Bunny.
router.post(
  '/intro-video/bunny',
  asyncHandler(TeacherProfileController.startBunnyIntroVideoUpload)
);

router.post(
  '/intro-video/confirm-upload',
  asyncHandler(TeacherProfileController.confirmIntroVideoUpload)
);

router.post(
  '/intro-video/sync',
  asyncHandler(TeacherProfileController.syncIntroVideo)
);

export default router;

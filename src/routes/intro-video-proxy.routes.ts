// Mount: /api/intro-videos/:teacherId/…
// Public (ticket-auth) HLS proxy — no JWT. Same pattern as student video-course proxy.

import { Router } from 'express';

import { IntroVideoProxyController } from '../controllers/intro-video-proxy.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.get(
  '/:teacherId/manifest.m3u8',
  asyncHandler(IntroVideoProxyController.masterPlaylist),
);

router.get(
  '/:teacherId/variants/:quality/video.m3u8',
  asyncHandler(IntroVideoProxyController.childPlaylist),
);

export default router;

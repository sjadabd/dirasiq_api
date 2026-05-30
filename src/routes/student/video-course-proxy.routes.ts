// Mount point: /api/student/video-courses/:courseId/lessons/:lessonId/…
//
// PUBLIC routes — no JWT required. Auth is carried by an HMAC-signed
// `ticket` query param that PlaybackTicketService.issue() minted at
// `/playback-url` time. Mounted BEFORE the student router's
// `authenticateToken + requireRole(STUDENT)` middleware in
// `routes/student/index.ts` so an HLS player without auth headers can
// still load the manifest.
//
// Only manifest files (master + child variants) go through this proxy;
// the controller signs segment URLs as absolute Bunny URLs so the heavy
// video bytes flow directly from Bunny to the player.

import { Router } from 'express';

import { VideoCourseProxyController } from '../../controllers/student/video-course-proxy.controller';
import { asyncHandler } from '../../utils/async-handler';

const router = Router();

router.get(
  '/:courseId/lessons/:lessonId/manifest.m3u8',
  asyncHandler(VideoCourseProxyController.masterPlaylist),
);

router.get(
  '/:courseId/lessons/:lessonId/variants/:quality/video.m3u8',
  asyncHandler(VideoCourseProxyController.childPlaylist),
);

export default router;

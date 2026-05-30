// HLS manifest proxy for Phase 7 video playback.
//
// Bunny Stream signs URLs PER FILE — a token issued for `playlist.m3u8`
// does not authenticate `360p/video.m3u8` or any segment beneath it. The
// `token_path` directory mode is a Bunny CDN Pull Zone feature that
// Stream libraries do not honour (verified empirically during QA-04). The
// only way to keep Token Authentication on AND make HLS playback work
// without depending on the iframe embed is to serve the manifest from
// our own host with every child URL signed individually.
//
// Architecture (two-level proxy, segments-direct):
//
//   Player                         OUR API                       Bunny CDN
//   ──────                         ───────                       ─────────
//   GET /manifest.m3u8?ticket  ─►  validate ticket
//                                  fetch master  ────────────►   200 master.m3u8
//                                  rewrite child URLs to
//                                  point at our /variants/…
//                                  endpoint                  ◄── return rewritten
//                            ◄──── master to player
//
//   GET /variants/<q>/video.m3u8?ticket
//                              ─►  validate ticket
//                                  fetch child  ─────────────►   200 child.m3u8
//                                  rewrite each segment line to
//                                  ABSOLUTE Bunny URL with a
//                                  per-segment ?token=&expires=
//                            ◄──── return rewritten child
//
//   GET <segment .ts/.m4s> ────── direct to Bunny ──────────►   200 bytes
//
// Only the manifest files (a few KB each) traverse our API; the heavy
// segment bytes go directly Player → Bunny. Auth is carried by the
// HMAC-signed `ticket` query param (see PlaybackTicketService) which is
// validated on every manifest request without a DB lookup.

import type { Request, Response } from 'express';

import { ApiError, ErrorCodes } from '../../utils/api-error';
import {
  BunnyStreamService,
  signAssetPath,
} from '../../services/bunny-stream.service';
import { PlaybackTicketService } from '../../services/playback-ticket.service';
import { logger } from '../../utils/logger';

export class VideoCourseProxyController {
  /**
   * GET /api/student/video-courses/:courseId/lessons/:lessonId/manifest.m3u8?ticket=...
   *
   * Master playlist proxy. Player calls this URL; we fetch Bunny's real
   * master, rewrite every child variant line (`360p/video.m3u8` etc.) to
   * point back at our `/variants/:quality/video.m3u8` endpoint carrying
   * the same ticket.
   */
  static async masterPlaylist(req: Request, res: Response): Promise<void> {
    const courseId = (req.params['courseId'] ?? '') as string;
    const lessonId = (req.params['lessonId'] ?? '') as string;
    const ticket = (req.query['ticket'] as string) ?? '';

    const payload = PlaybackTicketService.verify(ticket, courseId, lessonId);
    if (!payload) {
      throw new ApiError(
        401,
        'تذكرة التشغيل غير صالحة أو منتهية',
        ErrorCodes.UNAUTHORIZED,
      );
    }

    const cfg = BunnyStreamService.config();
    if (!cfg) {
      throw new ApiError(
        503,
        'Bunny Stream غير مُهيأ',
        ErrorCodes.SERVICE_UNAVAILABLE,
      );
    }

    const masterText = await fetchSignedFromBunny({
      cfg,
      path: `/${payload.bunnyVideoId}/playlist.m3u8`,
      // 60s TTL is enough — we fetch it once per request, server-side.
      ttlSeconds: 60,
    });

    // Rewrite child variant URI lines. The master uses BARE RELATIVE
    // paths shaped like `<quality>/video.m3u8`; lines starting with `#`
    // are tags; empty lines are spacing. Anything else is a URI we must
    // rewrite.
    const proxyBase = req.originalUrl.split('?')[0]!.replace(/\/manifest\.m3u8$/, '');
    const rewritten = masterText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        // Expected shape: `<quality>/video.m3u8`. Defence in depth: anything
        // that doesn't match is logged + passed through unchanged so the
        // player at worst falls back to the unchanged URL.
        const m = trimmed.match(/^([A-Za-z0-9_-]+)\/video\.m3u8$/);
        if (!m) {
          logger.warn(
            { line: trimmed, lessonId },
            'video-proxy: master playlist line did not match expected child shape',
          );
          return line;
        }
        const quality = m[1]!;
        return `${proxyBase}/variants/${quality}/video.m3u8?ticket=${encodeURIComponent(ticket)}`;
      })
      .join('\n');

    sendManifest(res, rewritten);
  }

  /**
   * GET /api/student/video-courses/:courseId/lessons/:lessonId/variants/:quality/video.m3u8?ticket=...
   *
   * Child variant proxy. We fetch the real variant manifest from Bunny,
   * then rewrite each segment URI to an ABSOLUTE Bunny URL with a
   * per-file `?token=&expires=`. The player loads segments directly from
   * Bunny — only the manifest hits our API.
   */
  static async childPlaylist(req: Request, res: Response): Promise<void> {
    const courseId = (req.params['courseId'] ?? '') as string;
    const lessonId = (req.params['lessonId'] ?? '') as string;
    const quality = (req.params['quality'] ?? '') as string;
    const ticket = (req.query['ticket'] as string) ?? '';

    // Defence in depth: prevent path traversal via the `quality` param.
    if (!/^[A-Za-z0-9_-]+$/.test(quality)) {
      throw new ApiError(
        400,
        'معرف الجودة غير صالح',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const payload = PlaybackTicketService.verify(ticket, courseId, lessonId);
    if (!payload) {
      throw new ApiError(
        401,
        'تذكرة التشغيل غير صالحة أو منتهية',
        ErrorCodes.UNAUTHORIZED,
      );
    }

    const cfg = BunnyStreamService.config();
    if (!cfg) {
      throw new ApiError(
        503,
        'Bunny Stream غير مُهيأ',
        ErrorCodes.SERVICE_UNAVAILABLE,
      );
    }

    const childText = await fetchSignedFromBunny({
      cfg,
      path: `/${payload.bunnyVideoId}/${quality}/video.m3u8`,
      ttlSeconds: 60,
    });

    // Each non-tag line is a segment URI (RELATIVE to the child manifest's
    // own directory: `<quality>/`). Sign each as an absolute Bunny URL.
    // TTL = the longer of (remaining ticket lifetime, 5 min) so the
    // segments in this manifest stay valid until the master playlist
    // would need to be refreshed by the player.
    const ttlSeconds = Math.max(
      300,
      Math.floor((payload.expiresAt.getTime() - Date.now()) / 1000),
    );
    const rewritten = childText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        // Defence in depth: bail if the segment looks like an absolute URL
        // or contains `..`. We expect bare filenames here.
        if (
          trimmed.startsWith('http://') ||
          trimmed.startsWith('https://') ||
          trimmed.includes('..')
        ) {
          logger.warn(
            { line: trimmed, lessonId, quality },
            'video-proxy: child manifest segment line looks malformed',
          );
          return line;
        }
        const segmentPath = `/${payload.bunnyVideoId}/${quality}/${trimmed}`;
        const { url } = signAssetPath({
          path: segmentPath,
          ttlSeconds,
          cfg,
        });
        return url;
      })
      .join('\n');

    sendManifest(res, rewritten);
  }
}

/**
 * Fetch a Bunny asset with a freshly-minted per-file signed URL. Returns
 * the body text. Throws ApiError on any non-2xx — we never want to forward
 * a 4xx/5xx page from Bunny as if it were a valid manifest.
 */
async function fetchSignedFromBunny(args: {
  cfg: ReturnType<typeof BunnyStreamService.config> & object;
  path: string;
  ttlSeconds: number;
}): Promise<string> {
  const signed = signAssetPath({
    path: args.path,
    ttlSeconds: args.ttlSeconds,
    cfg: args.cfg,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await fetch(signed.url, { signal: ctrl.signal });
    if (!resp.ok) {
      const bodyPreview = await resp.text().then((t) => t.slice(0, 200)).catch(() => '');
      logger.warn(
        { status: resp.status, path: args.path, bodyPreview },
        'video-proxy: upstream Bunny fetch failed',
      );
      throw new ApiError(
        502,
        'تعذر الاتصال بخادم الفيديو',
        ErrorCodes.SERVICE_UNAVAILABLE,
      );
    }
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Send a rewritten HLS manifest with the right content type and no CDN cache. */
function sendManifest(res: Response, body: string): void {
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  // Per-student, per-ticket. Cache only on the client, briefly.
  res.setHeader('Cache-Control', 'private, max-age=30, must-revalidate');
  res.status(200).send(body);
}

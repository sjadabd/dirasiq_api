// HLS manifest proxy for teacher intro videos.
//
// Same reason as video-course proxy: Bunny Stream Token Authentication signs
// PER FILE. A token on playlist.m3u8 does not authorize 720p/video.m3u8 or
// segments — so direct signed master URLs fail in hls.js / Safari after the
// first request. We proxy master + child manifests and re-sign every child.

import type { Request, Response } from 'express';

import { ApiError, ErrorCodes } from '../utils/api-error';
import {
  BunnyStreamService,
  signAssetPath,
} from '../services/bunny-stream.service';
import { PlaybackTicketService } from '../services/playback-ticket.service';
import { logger } from '../utils/logger';

/** Synthetic courseId slot in the shared v1 playback ticket format. */
export const INTRO_VIDEO_TICKET_COURSE_ID = '__intro_video__';

export class IntroVideoProxyController {
  static async masterPlaylist(req: Request, res: Response): Promise<void> {
    const teacherId = (req.params['teacherId'] ?? '') as string;
    const ticket = (req.query['ticket'] as string) ?? '';

    const payload = PlaybackTicketService.verify(
      ticket,
      INTRO_VIDEO_TICKET_COURSE_ID,
      teacherId,
    );
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
      ttlSeconds: 60,
    });

    const proxyBase = req.originalUrl.split('?')[0]!.replace(/\/manifest\.m3u8$/, '');
    const rewritten = masterText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const m = trimmed.match(/^([A-Za-z0-9_-]+)\/video\.m3u8$/);
        if (!m) {
          logger.warn(
            { line: trimmed, teacherId },
            'intro-video-proxy: master line unexpected shape',
          );
          return line;
        }
        const quality = m[1]!;
        return `${proxyBase}/variants/${quality}/video.m3u8?ticket=${encodeURIComponent(ticket)}`;
      })
      .join('\n');

    sendManifest(res, rewritten);
  }

  static async childPlaylist(req: Request, res: Response): Promise<void> {
    const teacherId = (req.params['teacherId'] ?? '') as string;
    const quality = (req.params['quality'] ?? '') as string;
    const ticket = (req.query['ticket'] as string) ?? '';

    if (!/^[A-Za-z0-9_-]+$/.test(quality)) {
      throw new ApiError(400, 'معرف الجودة غير صالح', ErrorCodes.VALIDATION_ERROR);
    }

    const payload = PlaybackTicketService.verify(
      ticket,
      INTRO_VIDEO_TICKET_COURSE_ID,
      teacherId,
    );
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

    const ttlSeconds = Math.max(
      300,
      Math.floor((payload.expiresAt.getTime() - Date.now()) / 1000),
    );
    const rewritten = childText
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        if (
          trimmed.startsWith('http://') ||
          trimmed.startsWith('https://') ||
          trimmed.includes('..')
        ) {
          return line;
        }
        const segmentPath = `/${payload.bunnyVideoId}/${quality}/${trimmed}`;
        return signAssetPath({ path: segmentPath, ttlSeconds, cfg }).url;
      })
      .join('\n');

    sendManifest(res, rewritten);
  }
}

/**
 * Build a playable URL for an intro video.
 * Prefer the HLS manifest proxy (works with Bunny token auth). Fall back to
 * a signed progressive MP4 when PLAYBACK_TICKET_SECRET is unset.
 */
export function buildIntroPlaybackUrl(args: {
  teacherId: string;
  bunnyVideoId: string;
}): string | null {
  const cfg = BunnyStreamService.config();
  if (!cfg) return null;

  const canProxy = Boolean(process.env['PLAYBACK_TICKET_SECRET']?.trim());
  if (canProxy) {
    try {
      const { ticket } = PlaybackTicketService.issue({
        courseId: INTRO_VIDEO_TICKET_COURSE_ID,
        lessonId: args.teacherId,
        bunnyVideoId: args.bunnyVideoId,
        ttlSeconds: cfg.playbackTokenTtlSeconds,
      });
      const base = (process.env['APP_URL']?.trim() || 'https://api.mulhimiq.com')
        .replace(/\/+$/, '');
      return (
        `${base}/api/intro-videos/${encodeURIComponent(args.teacherId)}` +
        `/manifest.m3u8?ticket=${encodeURIComponent(ticket)}`
      );
    } catch (err) {
      logger.warn({ err }, 'intro-video: ticket issue failed; falling back to MP4');
    }
  }

  // Progressive MP4 — single-file token works without the HLS proxy.
  return signAssetPath({
    path: `/${args.bunnyVideoId}/play_720p.mp4`,
    ttlSeconds: cfg.playbackTokenTtlSeconds,
    cfg,
  }).url;
}

async function fetchSignedFromBunny(args: {
  cfg: NonNullable<ReturnType<typeof BunnyStreamService.config>>;
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

function sendManifest(res: Response, body: string): void {
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'private, max-age=30, must-revalidate');
  res.status(200).send(body);
}

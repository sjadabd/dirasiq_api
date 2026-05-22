// Bunny Stream — Phase 7 foundations.
//
// This module is intentionally a SKELETON in Phase 7. It owns nothing
// beyond:
//   - env-var sanity (`assertConfigured()` callable at boot or per request)
//   - construction of signed HLS playback URLs (signature stable, signing
//     algorithm: HMAC-SHA256 over libraryId + videoId + expiry)
//
// The actual upload pipeline, transcoding callbacks, and library/collection
// management land in Phase 9. The reason to introduce the skeleton in Phase
// 7 is so the env vars + secure-URL signing logic exist once and are
// reused by every later layer.
//
// Required env (production):
//   BUNNY_STREAM_LIBRARY_ID   — numeric library id
//   BUNNY_STREAM_API_KEY      — admin api key, used for upload + management
//   BUNNY_STREAM_CDN_HOSTNAME — e.g. "vz-12345.b-cdn.net" — the CDN host
//   BUNNY_STREAM_TOKEN_KEY    — the token authentication key (Bunny
//                               "Token Authentication" panel)
//
// Optional env:
//   BUNNY_PLAYBACK_TOKEN_TTL_SECONDS  — default 14400 (4h)
//   BUNNY_PLAYBACK_TOKEN_IP_LOCK      — "true" / "false" — bind token to IP

import crypto from 'crypto';

import { logger } from '../utils/logger';

export interface BunnyStreamConfig {
  libraryId: string;
  apiKey: string;
  cdnHostname: string;
  tokenKey: string;
  playbackTokenTtlSeconds: number;
  ipLockPlayback: boolean;
}

let cached: BunnyStreamConfig | null = null;

export class BunnyStreamService {
  /**
   * Loads + validates the config once. Returns null if any required env var
   * is missing — callers should treat that as "video features disabled" and
   * surface a clear admin-facing error, not crash the app.
   */
  static config(): BunnyStreamConfig | null {
    if (cached) return cached;

    const libraryId = process.env['BUNNY_STREAM_LIBRARY_ID'];
    const apiKey = process.env['BUNNY_STREAM_API_KEY'];
    const cdnHostname = process.env['BUNNY_STREAM_CDN_HOSTNAME'];
    const tokenKey = process.env['BUNNY_STREAM_TOKEN_KEY'];

    if (!libraryId || !apiKey || !cdnHostname || !tokenKey) {
      logger.warn(
        {
          hasLibraryId: Boolean(libraryId),
          hasApiKey: Boolean(apiKey),
          hasCdnHostname: Boolean(cdnHostname),
          hasTokenKey: Boolean(tokenKey),
        },
        'BunnyStreamService: env not fully configured — video features disabled',
      );
      return null;
    }

    cached = {
      libraryId,
      apiKey,
      cdnHostname,
      tokenKey,
      playbackTokenTtlSeconds: Number(process.env['BUNNY_PLAYBACK_TOKEN_TTL_SECONDS'] || 14400),
      ipLockPlayback: process.env['BUNNY_PLAYBACK_TOKEN_IP_LOCK'] === 'true',
    };
    return cached;
  }

  /** Cheap check used by routes that must short-circuit early. */
  static isConfigured(): boolean {
    return this.config() !== null;
  }

  /**
   * Build a signed HLS playback URL. The token authenticates the request
   * to Bunny's edge AND optionally locks it to a single IP for the
   * token's lifetime. The URL we return is what the player consumes.
   *
   * Signature algorithm (Bunny Stream Token Auth):
   *   token = HMAC_SHA256_hex(tokenKey, "videoId" + expiresUnix + optionalIp)
   *
   * We URL-base64 the token (RFC 4648 with - / _ and no =) per Bunny's spec.
   *
   * Returns null if Bunny isn't configured — caller must handle.
   */
  static buildSignedPlaybackUrl(args: {
    videoId: string;
    clientIp?: string;
  }): { url: string; expiresAt: Date } | null {
    const cfg = this.config();
    if (!cfg) return null;

    const expiresUnix = Math.floor(Date.now() / 1000) + cfg.playbackTokenTtlSeconds;
    const ipSegment = cfg.ipLockPlayback && args.clientIp ? args.clientIp : '';
    const message = `${args.videoId}${expiresUnix}${ipSegment}`;
    const hmac = crypto
      .createHmac('sha256', cfg.tokenKey)
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    const url = `https://${cfg.cdnHostname}/${args.videoId}/playlist.m3u8?token=${hmac}&expires=${expiresUnix}${
      cfg.ipLockPlayback && args.clientIp ? `&ip=${encodeURIComponent(args.clientIp)}` : ''
    }`;

    return { url, expiresAt: new Date(expiresUnix * 1000) };
  }
}

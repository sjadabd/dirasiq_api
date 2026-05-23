// Wire-level tests for Phase 10.1.A — video learning foundation.
//
// Same envelope-only pattern as the other Phase-1 tests in this suite:
// auth gates + validate() middleware run before any DB query, so these
// tests do not need TEST_DB_ENABLED. The exception is the few endpoints
// that hit the model on a happy-path read — those don't run here; they
// land in a separate gated suite when the test DB is available.

import request from 'supertest';

import app from '../index';
import {
  BunnyStreamService,
  mapBunnyStatusToInternal,
} from '../services/bunny-stream.service';
import { VideoLessonBunnyStatus } from '../types';

describe('Video Courses — Phase 10.1.A', () => {
  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------

  describe('GET /api/public/video-courses (anonymous list)', () => {
    it('responds 200 with the canonical envelope', async () => {
      const res = await request(app).get('/api/public/video-courses');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta?.pagination).toBeDefined();
    });

    it('rejects an out-of-range limit', async () => {
      const res = await request(app).get('/api/public/video-courses?limit=999');
      // common pagination schema caps `limit` at 100 — request becomes 400
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('query.limit');
    });

    it('rejects a non-UUID id on /api/public/video-courses/:id', async () => {
      const res = await request(app).get('/api/public/video-courses/not-a-uuid');
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('params.id');
    });
  });

  // -------------------------------------------------------------------------
  // Student surface — auth gate
  // -------------------------------------------------------------------------

  describe('Student endpoints — auth gate', () => {
    it('GET /api/student/video-courses without token → 401', async () => {
      const res = await request(app).get('/api/student/video-courses');
      expect(res.status).toBe(401);
      expect(res.body.errors[0].code).toBe('UNAUTHORIZED');
    });

    it('GET /api/student/video-courses/<uuid>/lessons/<uuid>/playback-url without token → 401', async () => {
      const res = await request(app).get(
        '/api/student/video-courses/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-1111-1111-111111111111/playback-url'
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Teacher surface — auth gate
  // -------------------------------------------------------------------------

  describe('Teacher endpoints — auth gate', () => {
    it('GET /api/teacher/video-courses without token → 401', async () => {
      const res = await request(app).get('/api/teacher/video-courses');
      expect(res.status).toBe(401);
    });

    it('GET /api/teacher/video-courses/<uuid> without token → 401', async () => {
      const res = await request(app).get(
        '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000'
      );
      expect(res.status).toBe(401);
    });

    it('GET /api/teacher/video-courses/<uuid>/lessons without token → 401', async () => {
      const res = await request(app).get(
        '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/lessons'
      );
      expect(res.status).toBe(401);
    });

    it('POST /api/teacher/video-courses without token → 401', async () => {
      const res = await request(app).post('/api/teacher/video-courses').send({});
      expect(res.status).toBe(401);
    });

    it('PATCH /api/teacher/video-courses/<uuid> without token → 401', async () => {
      const res = await request(app)
        .patch('/api/teacher/video-courses/00000000-0000-0000-0000-000000000000')
        .send({});
      expect(res.status).toBe(401);
    });

    it('DELETE /api/teacher/video-courses/<uuid> without token → 401', async () => {
      const res = await request(app).delete(
        '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000'
      );
      expect(res.status).toBe(401);
    });

    it('POST /api/teacher/video-courses/<uuid>/cover-image without token → 401', async () => {
      const res = await request(app)
        .post('/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/cover-image')
        .attach('file', Buffer.from([0xff, 0xd8, 0xff]), 'cover.jpg');
      expect(res.status).toBe(401);
    });

    // ----- Phase 10.1.B.1.c — lesson endpoints --------------------------

    it('POST /api/teacher/video-courses/<uuid>/lessons without token → 401', async () => {
      const res = await request(app)
        .post('/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/lessons')
        .send({ title: 'lesson 1' });
      expect(res.status).toBe(401);
    });

    it('POST /api/teacher/video-courses/<uuid>/lessons/reorder without token → 401', async () => {
      const res = await request(app)
        .post(
          '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/lessons/reorder'
        )
        .send({ lessonIds: ['11111111-1111-1111-1111-111111111111'] });
      expect(res.status).toBe(401);
    });

    it('PATCH /api/teacher/video-courses/:id/lessons/:lessonId without token → 401', async () => {
      const res = await request(app)
        .patch(
          '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-1111-1111-111111111111'
        )
        .send({ title: 'renamed' });
      expect(res.status).toBe(401);
    });

    it('DELETE /api/teacher/video-courses/:id/lessons/:lessonId without token → 401', async () => {
      const res = await request(app).delete(
        '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-1111-1111-111111111111'
      );
      expect(res.status).toBe(401);
    });

    it('POST /api/teacher/video-courses/:id/lessons/:lessonId/sync without token → 401', async () => {
      const res = await request(app).post(
        '/api/teacher/video-courses/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-1111-1111-111111111111/sync'
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Phase 10.1.B.2 — intro-video Bunny endpoints
  // -------------------------------------------------------------------------

  describe('Phase 10.1.B.2 — intro-video Bunny endpoints', () => {
    it('POST /api/teacher/profile/intro-video/bunny without token → 401', async () => {
      const res = await request(app).post('/api/teacher/profile/intro-video/bunny');
      expect(res.status).toBe(401);
    });

    it('GET /api/teacher/profile/intro-video without token → 401', async () => {
      const res = await request(app).get('/api/teacher/profile/intro-video');
      expect(res.status).toBe(401);
    });

    it('GET /api/student/teachers/<uuid>/intro-video without token → 401', async () => {
      const res = await request(app).get(
        '/api/student/teachers/00000000-0000-0000-0000-000000000000/intro-video'
      );
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Lesson reorder schema
  // -------------------------------------------------------------------------

  describe('Lesson reorder schema (10.1.B.1.c)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { videoLessonReorderSchema } = require('../schemas/video-course.schemas') as typeof import('../schemas/video-course.schemas');

    it('accepts a valid array of UUIDs', () => {
      const r = videoLessonReorderSchema.safeParse({
        lessonIds: [
          // RFC 4122 variant bit (17th nibble) must be 8/9/a/b — using
          // proper crypto.randomUUID()-shaped values for safe-parse.
          '550e8400-e29b-41d4-a716-446655440000',
          '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        ],
      });
      expect(r.success).toBe(true);
    });

    it('rejects an empty array', () => {
      const r = videoLessonReorderSchema.safeParse({ lessonIds: [] });
      expect(r.success).toBe(false);
    });

    it('rejects non-UUID entries', () => {
      const r = videoLessonReorderSchema.safeParse({ lessonIds: ['not-a-uuid'] });
      expect(r.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Super-admin surface — auth gate + validation
  // -------------------------------------------------------------------------

  describe('Super-admin endpoints — auth gate', () => {
    const dummyId = '00000000-0000-0000-0000-000000000000';

    it('GET /api/super-admin/video-courses without token → 401', async () => {
      const res = await request(app).get('/api/super-admin/video-courses');
      expect(res.status).toBe(401);
    });

    it('PATCH /:id/approve without token → 401', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/video-courses/${dummyId}/approve`)
        .send({});
      expect(res.status).toBe(401);
    });

    it('PATCH /:id/hide without token → 401', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/video-courses/${dummyId}/hide`)
        .send({});
      expect(res.status).toBe(401);
    });

    it('PATCH /:id/reject without token → 401', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/video-courses/${dummyId}/reject`)
        .send({ reviewNotes: 'why' });
      expect(res.status).toBe(401);
    });

    it('DELETE /:id without token → 401', async () => {
      const res = await request(app).delete(
        `/api/super-admin/video-courses/${dummyId}`
      );
      expect(res.status).toBe(401);
    });

    it('PATCH /:id/reject with junk token → 401, not validation 400 (auth before validate)', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/video-courses/${dummyId}/reject`)
        .set('Authorization', 'Bearer not-a-real-token')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.errors[0].code).toBe('TOKEN_INVALID');
    });
  });

  // -------------------------------------------------------------------------
  // Bunny webhook — signature gate
  // -------------------------------------------------------------------------

  describe('POST /api/webhooks/bunny/video-status', () => {
    it('rejects empty body → 400 + body.VideoGuid + body.Status', async () => {
      const res = await request(app)
        .post('/api/webhooks/bunny/video-status')
        .send({});
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining(['body.VideoGuid', 'body.Status'])
      );
    });

    it('rejects a payload with no signature header → 401', async () => {
      const res = await request(app)
        .post('/api/webhooks/bunny/video-status')
        .send({ VideoGuid: 'fake-guid-1234', Status: 4 });
      // No BUNNY_STREAM_WEBHOOK_SECRET in test env → verifyWebhookSignature
      // returns false → 401. Same shape if the env IS set but the header is
      // missing — the controller cannot distinguish the two and fails safe.
      expect(res.status).toBe(401);
      expect(res.body.errors[0].code).toBe('UNAUTHORIZED');
    });

    it('rejects a payload with a forged signature header → 401', async () => {
      const res = await request(app)
        .post('/api/webhooks/bunny/video-status')
        .set('Bunny-Webhook-Signature', 'sha256=deadbeef')
        .send({ VideoGuid: 'fake-guid-1234', Status: 4 });
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Bunny service — unit tests for the pure helpers
  // -------------------------------------------------------------------------

  describe('mapBunnyStatusToInternal', () => {
    it.each([
      [0, VideoLessonBunnyStatus.PENDING],
      [1, VideoLessonBunnyStatus.UPLOADED],
      [2, VideoLessonBunnyStatus.PROCESSING],
      [3, VideoLessonBunnyStatus.PROCESSING],
      [4, VideoLessonBunnyStatus.READY],
      [5, VideoLessonBunnyStatus.FAILED],
      [6, VideoLessonBunnyStatus.FAILED],
      [7, VideoLessonBunnyStatus.PROCESSING],
      [8, VideoLessonBunnyStatus.PROCESSING],
      [99, VideoLessonBunnyStatus.PROCESSING], // unknown → safe default
    ])('maps Bunny status %i → %s', (code, expected) => {
      expect(mapBunnyStatusToInternal(code)).toBe(expected);
    });
  });

  describe('BunnyStreamService.verifyWebhookSignature', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      // Provide a known webhook secret for these unit tests + reset the
      // service cache so the new env vars are picked up.
      process.env['BUNNY_STREAM_LIBRARY_ID'] = '12345';
      process.env['BUNNY_STREAM_API_KEY'] = 'fake-api-key';
      process.env['BUNNY_STREAM_CDN_HOSTNAME'] = 'vz-test.b-cdn.net';
      process.env['BUNNY_STREAM_TOKEN_KEY'] = 'fake-token-key';
      process.env['BUNNY_STREAM_WEBHOOK_SECRET'] = 'shhh';
      BunnyStreamService.resetCacheForTests();
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
      BunnyStreamService.resetCacheForTests();
    });

    it('returns true for a correctly HMAC-SHA256-signed body', () => {
      const rawBody = JSON.stringify({ VideoGuid: 'g', Status: 4 });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require('crypto') as typeof import('crypto');
      const sig = crypto
        .createHmac('sha256', 'shhh')
        .update(rawBody)
        .digest('hex');
      expect(
        BunnyStreamService.verifyWebhookSignature({
          rawBody,
          signatureHeader: sig,
        })
      ).toBe(true);
    });

    it('accepts the "sha256=<hex>" prefix variant', () => {
      const rawBody = JSON.stringify({ VideoGuid: 'g', Status: 4 });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require('crypto') as typeof import('crypto');
      const sig = crypto
        .createHmac('sha256', 'shhh')
        .update(rawBody)
        .digest('hex');
      expect(
        BunnyStreamService.verifyWebhookSignature({
          rawBody,
          signatureHeader: `sha256=${sig}`,
        })
      ).toBe(true);
    });

    it('returns false on a wrong signature', () => {
      const rawBody = JSON.stringify({ VideoGuid: 'g', Status: 4 });
      expect(
        BunnyStreamService.verifyWebhookSignature({
          rawBody,
          signatureHeader: 'deadbeef',
        })
      ).toBe(false);
    });

    it('returns false when the signature header is missing', () => {
      expect(
        BunnyStreamService.verifyWebhookSignature({
          rawBody: 'whatever',
          signatureHeader: undefined,
        })
      ).toBe(false);
    });

    it('returns false when the webhook secret env is unset (fails safe)', () => {
      delete process.env['BUNNY_STREAM_WEBHOOK_SECRET'];
      BunnyStreamService.resetCacheForTests();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const crypto = require('crypto') as typeof import('crypto');
      const rawBody = 'whatever';
      const sig = crypto
        .createHmac('sha256', 'shhh')
        .update(rawBody)
        .digest('hex');
      expect(
        BunnyStreamService.verifyWebhookSignature({
          rawBody,
          signatureHeader: sig,
        })
      ).toBe(false);
    });
  });
});

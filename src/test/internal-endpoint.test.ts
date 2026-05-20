// Wire-level tests for the /api/internal/* surface added in chat Phase 1.
//
// Verifies the X-Internal-Secret gate and Zod param validation. The actual
// DB lookup path (200 success) is exercised by the chat-service integration
// tests (which seed a real user); here we only confirm that requests are
// blocked correctly when the secret is missing/wrong, and that Zod rejects
// malformed UUIDs before the handler runs.

import request from 'supertest';
import app from '../index';

const SAMPLE_UUID = '00000000-0000-0000-0000-000000000001';

describe('Internal API gate (chat Phase 1)', () => {
  describe('GET /api/internal/users/:id/profile', () => {
    it('returns 401 UNAUTHORIZED when the X-Internal-Secret header is missing', async () => {
      const res = await request(app).get(`/api/internal/users/${SAMPLE_UUID}/profile`);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        errors: [{ code: 'UNAUTHORIZED' }],
      });
    });

    it('returns 401 UNAUTHORIZED when the X-Internal-Secret header is wrong', async () => {
      const res = await request(app)
        .get(`/api/internal/users/${SAMPLE_UUID}/profile`)
        .set('X-Internal-Secret', 'totally-wrong-secret');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errors?.[0]?.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 VALIDATION_ERROR for a non-UUID :id', async () => {
      // Order: internal-secret gate runs first, so we must pass it to reach
      // the Zod validator. Re-read the value at test time so the test stays
      // in sync with the env without hard-coding it.
      const secret = process.env['INTERNAL_API_SECRET'];
      if (!secret) {
        // Without the env, the route would return 503 — not the path we're
        // testing here. Skip rather than assert a misleading shape.
        return;
      }
      const res = await request(app)
        .get('/api/internal/users/not-a-uuid/profile')
        .set('X-Internal-Secret', secret);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors?.[0]?.field).toBe('params.id');
    });
  });
});

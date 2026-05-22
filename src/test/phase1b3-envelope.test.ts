// Wire-level tests for the Phase 1.B-3 surface:
//   - super-admin (`/api/super-admin/*`, `/api/academic-years/*`,
//     `/api/grades/*`, `/api/news/*`)
//   - notifications (`/api/notifications/*`)
//   - user OneSignal (`/api/user/onesignal-*`)
//   - teacher search (`/api/teacher-search/*` — PUBLIC)
//   - public news (`/api/public/news` — PUBLIC)
//   - Wayl webhook (`/api/payments/wayl/webhook` — PUBLIC)
//
// All tests run without a real database — they hit the auth / validation
// middleware which short-circuits before any DB query, except the public
// teacher-search and public news which exercise the DB and may return empty
// arrays.

import request from 'supertest';
import app from '../index';

describe('Phase 1.B-3 envelope (super-admin / notifications / payments / public / user / teacher-search)', () => {
  describe('Public endpoints survive without a token', () => {
    it('GET /api/public/news returns canonical envelope', async () => {
      const res = await request(app).get('/api/public/news');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, data: expect.any(Array) });
    });

    it('GET /api/teacher-search/governorates returns canonical envelope', async () => {
      const res = await request(app).get('/api/teacher-search/governorates');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/teacher-search/search/coordinates with no params → 400 VALIDATION_ERROR', async () => {
      const res = await request(app).get('/api/teacher-search/search/coordinates');
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeInstanceOf(Array);
      const fields = res.body.errors.map((e: { field: string }) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['query.latitude', 'query.longitude']));
    });

    it('GET /api/grades/all-student is public (no token)', async () => {
      const res = await request(app).get('/api/grades/all-student');
      // Either 200 with data (seeded) or success-shaped response from service.
      expect([200, 500]).toContain(res.status);
      // No auth error.
      if (res.status === 200) expect(res.body.success).toBe(true);
    });
  });

  describe('Auth gate sweep — every protected route returns 401 without a token', () => {
    it('blanket 401 across super-admin / notifications / user-onesignal', async () => {
      const getPaths = [
        '/api/super-admin/dashboard/stats',
        '/api/super-admin/teachers',
        '/api/super-admin/settings/booking-confirm-fee',
        '/api/academic-years',
        '/api/academic-years/active',
        '/api/news',
        '/api/grades',
        '/api/grades/all',
        '/api/grades/my-grades',
        // (Phase 7) /api/subscription-packages/* routes removed alongside
        // the subscription model.
        '/api/notifications',
        '/api/notifications/statistics',
        '/api/notifications/user/my-notifications',
        '/api/user/onesignal-status',
      ];
      const putPaths = ['/api/user/onesignal-player-id'];

      const getRes = await Promise.all(getPaths.map((p) => request(app).get(p)));
      const putRes = await Promise.all(putPaths.map((p) => request(app).put(p).send({})));
      const failed = [...getRes, ...putRes]
        .map((res, i) => ({
          path: [...getPaths, ...putPaths][i],
          status: res.status,
        }))
        .filter((r) => r.status !== 401);
      expect(failed).toEqual([]);
    });
  });

  describe('Wayl webhook stays public but validates referenceId', () => {
    it('returns 400 VALIDATION_ERROR when referenceId is missing', async () => {
      const res = await request(app)
        .post('/api/payments/wayl/webhook')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        errors: [
          { code: 'invalid_type', field: 'body.referenceId' },
        ],
      });
    });

    it('returns 401 "Missing signature" when referenceId is present but no signature header', async () => {
      const res = await request(app)
        .post('/api/payments/wayl/webhook')
        .set('Content-Type', 'application/json')
        .send({ referenceId: 'nonexistent-ref' });
      // Wayl-compatible legacy shape: `{success, message}` without errors[].
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, message: 'Missing signature' });
    });
  });
});

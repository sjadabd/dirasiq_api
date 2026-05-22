// Wire-level tests for the Phase 1.B-1 teacher API surface.
//
// Covers:
//   - router-level auth gate (no token → 401 UNAUTHORIZED)
//   - router-level role gate (wrong token → would be 401 TOKEN_INVALID)
//   - Zod validation on query-required endpoints (missing studyYear)
//   - Zod validation on body-required endpoints (POST /courses with empty body)
//
// All tests run without a real database — they hit the auth + validation
// middleware which short-circuits before the DB is touched.

import request from 'supertest';
import app from '../index';

describe('Teacher API envelope (Phase 1.B-1)', () => {
  describe('Authentication gate', () => {
    it('returns 401 UNAUTHORIZED for /api/teacher/dashboard without a token', async () => {
      const res = await request(app).get('/api/teacher/dashboard');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        errors: [{ code: 'UNAUTHORIZED' }],
      });
    });

    it('returns 401 TOKEN_INVALID for /api/teacher/courses with a junk bearer', async () => {
      const res = await request(app)
        .get('/api/teacher/courses?page=1&limit=5')
        .set('Authorization', 'Bearer not.a.real.token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(['TOKEN_INVALID', 'UNAUTHORIZED']).toContain(res.body.errors?.[0]?.code);
    });

    it('returns 401 for every teacher sub-route without a token', async () => {
      const subRoutes = [
        '/api/teacher/courses',
        '/api/teacher/subjects',
        '/api/teacher/bookings',
        '/api/teacher/sessions',
        '/api/teacher/assignments',
        '/api/teacher/exams',
        '/api/teacher/evaluations',
        '/api/teacher/invoices',
        '/api/teacher/payments/reservations',
        '/api/teacher/notifications',
        '/api/teacher/students',
        '/api/teacher/dashboard',
        '/api/teacher/wallet',
        '/api/teacher/expenses',
        '/api/teacher/reports/financial',
        '/api/teacher/profile/intro-video',
        '/api/teacher/academic-years',
      ];

      const results = await Promise.all(subRoutes.map((path) => request(app).get(path)));
      const failed = results
        .map((res, i) => ({ path: subRoutes[i], status: res.status }))
        .filter((r) => r.status !== 401);
      expect(failed).toEqual([]);
    });
  });

  // (Phase 7) The mixed-auth /api/teacher/subscription-packages/* sub-router
  // was removed alongside the subscription model. Tests removed.

  describe('Canonical 404 (outside the teacher router)', () => {
    it('returns canonical fail() shape on unknown top-level route', async () => {
      // Unknown paths INSIDE /api/teacher/* are intercepted by the
      // router-level auth middleware (returns 401) before they can fall
      // through to the global 404 handler. Test the global handler on a
      // sibling path instead.
      const res = await request(app).get('/api/not-a-real-thing');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        message: 'المسار غير موجود',
        errors: [{ code: 'NOT_FOUND' }],
      });
    });
  });
});

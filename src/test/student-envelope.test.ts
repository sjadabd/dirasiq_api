// Wire-level tests for the Phase 1.B-2 student API surface.
//
// Covers:
//   - router-level auth gate (no token → 401 UNAUTHORIZED)
//   - blanket-401 sweep across every student sub-route
//   - canonical envelope shape on 401 / 404 paths
//
// All tests run without a real database — they hit the auth / validation
// middleware which short-circuits before any DB query.

import request from 'supertest';
import app from '../index';

describe('Student API envelope (Phase 1.B-2)', () => {
  describe('Authentication gate', () => {
    it('returns 401 UNAUTHORIZED for /api/student/dashboard/overview without a token', async () => {
      const res = await request(app).get('/api/student/dashboard/overview');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        errors: [{ code: 'UNAUTHORIZED' }],
      });
    });

    it('returns 401 TOKEN_INVALID for /api/student/courses/suggested with a junk bearer', async () => {
      const res = await request(app)
        .get('/api/student/courses/suggested')
        .set('Authorization', 'Bearer not.a.real.token');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(['TOKEN_INVALID', 'UNAUTHORIZED']).toContain(res.body.errors?.[0]?.code);
    });

    it('returns 401 for every student sub-route without a token', async () => {
      const getPaths = [
        '/api/student/dashboard/overview',
        '/api/student/dashboard/weekly-schedule',
        '/api/student/courses/suggested',
        '/api/student/teachers/suggested',
        '/api/student/bookings',
        '/api/student/enrollments',
        '/api/student/enrollments/schedule',
        '/api/student/exams',
        '/api/student/exams/report/by-type',
        '/api/student/assignments',
        '/api/student/evaluations',
        '/api/student/invoices',
        '/api/student/attendance/by-course/00000000-0000-0000-0000-000000000000',
        '/api/student/search/unified',
      ];
      const postPaths = [
        '/api/student/bookings',
        '/api/student/attendance/check-in',
      ];

      const getResults = await Promise.all(getPaths.map((p) => request(app).get(p)));
      const postResults = await Promise.all(postPaths.map((p) => request(app).post(p).send({})));
      const failed = [...getResults, ...postResults]
        .map((res, i) => ({
          path: [...getPaths, ...postPaths][i],
          status: res.status,
        }))
        .filter((r) => r.status !== 401);
      expect(failed).toEqual([]);
    });
  });
});

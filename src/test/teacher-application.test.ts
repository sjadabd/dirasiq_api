// Wire-level tests for Phase 1 of the Teacher Application & Approval System.
//
// All assertions exercise auth / validation middleware which short-circuits
// before any DB query, so these tests run without TEST_DB_ENABLED.

import request from 'supertest';

import app from '../index';

describe('Teacher Applications — Phase 1', () => {
  describe('POST /api/teacher-applications (public submit)', () => {
    it('rejects an empty body with a populated VALIDATION_ERROR field list', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeInstanceOf(Array);

      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      // The schema requires these top-level fields; the validator should
      // surface a per-field error for each one.
      expect(fields).toEqual(
        expect.arrayContaining([
          'body.firstName',
          'body.lastName',
          'body.phone',
          'body.email',
          'body.password',
          'body.gender',
          'body.birthDate',
          'body.city',
          'body.area',
          'body.subject',
          'body.teachingStage',
          'body.yearsOfExperience',
          'body.hasPhysicalCourses',
          'body.estimatedStudentCount',
        ]),
      );
    });

    it('rejects an invalid email format with a single VALIDATION_ERROR on body.email', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          firstName: 'Ahmed',
          lastName: 'Salem',
          phone: '07700000000',
          email: 'not-an-email',
          password: 'Password1',
          gender: 'male',
          birthDate: '1990-01-15',
          city: 'Baghdad',
          area: 'Karkh',
          subject: 'Math',
          teachingStage: 'Secondary',
          yearsOfExperience: 5,
          hasPhysicalCourses: true,
          estimatedStudentCount: 50,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.email');
    });

    it('rejects an invalid gender enum value', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          firstName: 'Ahmed',
          lastName: 'Salem',
          phone: '07700000000',
          email: 'ahmed@example.com',
          password: 'Password1',
          gender: 'other',
          birthDate: '1990-01-15',
          city: 'Baghdad',
          area: 'Karkh',
          subject: 'Math',
          teachingStage: 'Secondary',
          yearsOfExperience: 5,
          hasPhysicalCourses: true,
          estimatedStudentCount: 50,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.gender');
    });

    it('rejects a phone shorter than 10 characters', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          firstName: 'Ahmed',
          lastName: 'Salem',
          phone: '0770',
          email: 'ahmed@example.com',
          password: 'Password1',
          gender: 'male',
          birthDate: '1990-01-15',
          city: 'Baghdad',
          area: 'Karkh',
          subject: 'Math',
          teachingStage: 'Secondary',
          yearsOfExperience: 5,
          hasPhysicalCourses: true,
          estimatedStudentCount: 50,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.phone');
    });
  });

  describe('Super-admin endpoints — auth gate', () => {
    it('GET /api/super-admin/teacher-applications without a token → 401', async () => {
      const res = await request(app).get('/api/super-admin/teacher-applications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].code).toBe('UNAUTHORIZED');
    });

    it('GET /api/super-admin/teacher-applications/<uuid> without a token → 401', async () => {
      const res = await request(app).get(
        '/api/super-admin/teacher-applications/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(401);
    });

    it('GET /api/super-admin/teacher-applications/not-a-uuid without a token → 401 (auth runs before validate)', async () => {
      const res = await request(app).get(
        '/api/super-admin/teacher-applications/not-a-uuid',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('Decision 1: /auth/register/teacher is super-admin only', () => {
    it('POST /api/auth/register/teacher without a token → 401', async () => {
      const res = await request(app)
        .post('/api/auth/register/teacher')
        .send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2 — workflow action routes
  // ---------------------------------------------------------------------------

  describe('Phase 2 actions — auth gate', () => {
    const dummyId = '00000000-0000-0000-0000-000000000000';

    it('PATCH /approve without a token → 401', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/teacher-applications/${dummyId}/approve`)
        .send({});
      expect(res.status).toBe(401);
    });

    it('PATCH /reject without a token → 401', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/teacher-applications/${dummyId}/reject`)
        .send({ rejectionReason: 'some reason' });
      expect(res.status).toBe(401);
    });

    it('PATCH /request-more-info without a token → 401', async () => {
      const res = await request(app)
        .patch(
          `/api/super-admin/teacher-applications/${dummyId}/request-more-info`,
        )
        .send({ adminNotes: 'need more info' });
      expect(res.status).toBe(401);
    });
  });

  describe('Phase 2 actions — junk token returns 401, not 400 (auth before validate)', () => {
    const dummyId = '00000000-0000-0000-0000-000000000000';

    it('PATCH /reject with a junk token → 401', async () => {
      const res = await request(app)
        .patch(`/api/super-admin/teacher-applications/${dummyId}/reject`)
        .set('Authorization', 'Bearer not-a-real-token')
        .send({});
      // Auth middleware runs first. 401 means the gate is correctly in front
      // of validate() — even an empty body cannot leak the validation errors.
      expect(res.status).toBe(401);
      expect(res.body.errors[0].code).toBe('TOKEN_INVALID');
    });
  });
});

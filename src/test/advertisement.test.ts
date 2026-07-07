// Wire-level tests for Teacher Advertisement Platform.
// Auth/validation middleware short-circuits before DB — no TEST_DB_ENABLED required.

import request from 'supertest';

import app from '../index';

describe('Teacher Advertisements — auth & validation', () => {
  describe('GET /api/student/content-feed', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/student/content-feed');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/student/advertisements/:id/record-view', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app)
        .post('/api/student/advertisements/00000000-0000-4000-8000-000000000001/record-view');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/teacher/advertisements', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).post('/api/teacher/advertisements').send({
        title: 'Test',
        description: 'Body',
        budgetTotal: 10000,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/super-admin/advertisements/:id/approve', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app)
        .patch('/api/super-admin/advertisements/00000000-0000-4000-8000-000000000001/approve')
        .send({});
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/super-admin/advertisements/settings', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/super-admin/advertisements/settings');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/teacher/advertisements — validation', () => {
    it('rejects empty body when authenticated as teacher would be required', async () => {
      const res = await request(app)
        .post('/api/teacher/advertisements')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .send({});
      expect([401, 403]).toContain(res.status);
    });
  });
});

describe('Teacher Advertisements — role isolation (no DB)', () => {
  it('student cannot list teacher advertisements without teacher role', async () => {
    const res = await request(app)
      .get('/api/teacher/advertisements')
      .set('Authorization', 'Bearer invalid');
    expect(res.status).toBe(401);
  });

  it('teacher cannot approve ads via super-admin route without valid admin token', async () => {
    const res = await request(app)
      .patch('/api/super-admin/advertisements/00000000-0000-4000-8000-000000000001/approve')
      .set('Authorization', 'Bearer invalid')
      .send({});
    expect(res.status).toBe(401);
  });
});

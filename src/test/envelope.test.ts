// Wire-level tests for the Phase 1 API response envelope and error pipeline.
//
// These tests exercise the canonical `ApiResponse<T>` shape and the Zod /
// ApiError / errorHandler chain without touching the database, so they can
// run on any developer machine. DB-dependent integration tests (login,
// registration round-trip) belong in a separate file once a local test DB
// is set up.

import request from 'supertest';
import app from '../index';

describe('API response envelope (Phase 1)', () => {
  describe('GET /health', () => {
    it('returns the canonical ApiResponse shape', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Server is running',
        data: {
          environment: expect.any(String),
          timestamp: expect.any(String),
        },
      });
      expect(res.body.errors).toBeUndefined();
    });

    it('echoes X-Request-ID header', async () => {
      const supplied = 'test-req-12345';
      const res = await request(app)
        .get('/health')
        .set('X-Request-ID', supplied);
      expect(res.headers['x-request-id']).toBe(supplied);
    });

    it('generates a fresh request id when none is provided', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('attaches content_url at the top level', async () => {
      const res = await request(app).get('/health');
      expect(res.body.content_url).toBeDefined();
    });
  });

  describe('404 not found', () => {
    it('returns the canonical fail() shape', async () => {
      const res = await request(app).get('/api/this-route-does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        message: 'المسار غير موجود',
        errors: [
          {
            code: 'NOT_FOUND',
            message: expect.stringContaining('Route not found:'),
          },
        ],
      });
    });
  });

  describe('Validation errors via Zod', () => {
    it('returns 400 with field-level errors on /api/auth/login with empty body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeInstanceOf(Array);
      const fields = res.body.errors.map((e: { field: string }) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['body.email', 'body.password']));
    });

    it('rejects an invalid email format with the Arabic message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatchObject({
        field: 'body.email',
        message: 'البريد الإلكتروني غير صحيح',
      });
    });
  });

  describe('Malformed JSON body', () => {
    // Regression: body-parser used to throw a SyntaxError that the global
    // error handler treated as a generic 500 INTERNAL_ERROR, leaking the raw
    // "Unexpected token ..." parse message. error.middleware now detects
    // body-parser's `entity.parse.failed` SyntaxError and rewrites it to the
    // canonical 400 VALIDATION_ERROR envelope with a `body` field hint.
    //
    // Shape note: ApiError.toResponseErrors() flattens `details.fields` into
    // one entry per field in `errors[]`, so the top-level errors[0].code is
    // the field's own code (`invalid_json`), not the parent VALIDATION_ERROR.
    it('returns 400 (not 500) with a body field hint for malformed JSON', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('not-json');
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        message: 'فشل في التحقق من البيانات',
        errors: [
          {
            code: 'invalid_json',
            field: 'body',
            message: 'Malformed JSON in request body',
          },
        ],
      });
    });
  });

  describe('Bootstrap-gated super-admin route', () => {
    it('returns 404 when BOOTSTRAP_TOKEN is unset', async () => {
      // .env.test does not set BOOTSTRAP_TOKEN; the route should 404.
      const res = await request(app)
        .post('/api/auth/register/super-admin')
        .send({ name: 'X', email: 'admin@example.com', password: 'Password123' });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});

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
      // The schema requires these always-required top-level fields. Note:
      // body.email + body.password are no longer asserted here — Phase 8
      // makes them auth-method-dependent (only required when
      // authProvider='email'); the dedicated Phase 8 tests below cover that
      // case explicitly.
      expect(fields).toEqual(
        expect.arrayContaining([
          'body.firstName',
          'body.lastName',
          'body.phone',
          'body.gender',
          'body.birthDate',
          'body.city',
          'body.area',
          'body.subject',
          'body.gradeIds',
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

  // ---------------------------------------------------------------------------
  // Phase 3 — file uploads + auth-gated reads
  // ---------------------------------------------------------------------------

  describe('Phase 3 — public upload (POST /:id/files)', () => {
    const dummyAid = '00000000-0000-0000-0000-000000000000';

    it('without X-Upload-Token → 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post(`/api/teacher-applications/${dummyAid}/files`)
        .attach('file', Buffer.from([0xff, 0xd8, 0xff]), 'tiny.jpg')
        .field('kind', 'profile_image');
      expect(res.status).toBe(401);
      expect(res.body.errors[0].code).toBe('UNAUTHORIZED');
    });

    it('with a junk X-Upload-Token → 401 TOKEN_INVALID', async () => {
      const res = await request(app)
        .post(`/api/teacher-applications/${dummyAid}/files`)
        .set('X-Upload-Token', 'not-a-real-jwt')
        .attach('file', Buffer.from([0xff, 0xd8, 0xff]), 'tiny.jpg')
        .field('kind', 'profile_image');
      expect(res.status).toBe(401);
      expect(res.body.errors[0].code).toBe('TOKEN_INVALID');
    });
  });

  describe('Phase 3 — super-admin file reads', () => {
    const dummyAid = '00000000-0000-0000-0000-000000000000';
    const dummyFid = '11111111-1111-1111-1111-111111111111';

    it('GET /:id/files without auth → 401', async () => {
      const res = await request(app).get(
        `/api/super-admin/teacher-applications/${dummyAid}/files`,
      );
      expect(res.status).toBe(401);
    });

    it('GET /:id/files/:fileId without auth → 401', async () => {
      const res = await request(app).get(
        `/api/super-admin/teacher-applications/${dummyAid}/files/${dummyFid}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('Phase 4 — submit accepts optional oneSignalPlayerId', () => {
    it('schema rejects only the genuinely-missing fields when oneSignalPlayerId is sent', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          firstName: 'Layla',
          lastName: 'Hassan',
          phone: '07700000123',
          email: 'phase4-schema@example.com',
          password: 'GoodPwd1',
          gender: 'female',
          birthDate: '1995-06-12',
          city: 'بغداد',
          area: 'الكرخ',
          subject: 'الإنجليزية',
          teachingStage: 'الإعدادي',
          yearsOfExperience: 3,
          hasPhysicalCourses: false,
          estimatedStudentCount: 10,
          oneSignalPlayerId: 'fake-player-id-from-flutter',
        });
      // Either 201 (production-style — schema accepts), or one of:
      //   429 RATE_LIMITED  → noisy CI parallelism (rate limiter exhausted)
      //   409 ALREADY_EXISTS / EMAIL_ALREADY_EXISTS  → repeat run against same DB
      // In all cases the schema MUST NOT complain about body.oneSignalPlayerId.
      const fields = Array.isArray(res.body?.errors)
        ? (res.body.errors as { field?: string }[]).map((e) => e.field)
        : [];
      expect(fields).not.toContain('body.oneSignalPlayerId');
    });

    it('schema rejects an oneSignalPlayerId longer than 100 chars', async () => {
      const tooLong = 'x'.repeat(101);
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          firstName: 'Layla',
          lastName: 'Hassan',
          phone: '07700000124',
          email: 'phase4-len@example.com',
          password: 'GoodPwd1',
          gender: 'female',
          birthDate: '1995-06-12',
          city: 'بغداد',
          area: 'الكرخ',
          subject: 'الإنجليزية',
          teachingStage: 'الإعدادي',
          yearsOfExperience: 3,
          hasPhysicalCourses: false,
          estimatedStudentCount: 10,
          oneSignalPlayerId: tooLong,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.oneSignalPlayerId');
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 8 — auth-method-aware submit + email verification + login blocking
  // ---------------------------------------------------------------------------

  describe('Phase 8 — submit defaults to email auth', () => {
    it('omitted authProvider is accepted as "email" (back-compat) and requires email + password', async () => {
      // Send every base field EXCEPT email/password so Zod's base parsing
      // passes and the superRefine block actually runs. (Zod skips superRefine
      // when base field parsing has already produced errors.)
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          firstName: 'Layla',
          lastName: 'Hassan',
          phone: '07712345000',
          gender: 'female',
          birthDate: '1995-06-12',
          city: 'بغداد',
          area: 'الكرخ',
          subject: 'الإنجليزية',
          teachingStage: 'الإعدادي',
          yearsOfExperience: 3,
          hasPhysicalCourses: false,
          estimatedStudentCount: 10,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      // body.email + body.password should both be required since the default
      // authProvider is "email" (back-compat with pre-Phase-8 clients).
      expect(fields).toEqual(expect.arrayContaining(['body.email', 'body.password']));
    });

    it('authProvider="email" rejects when email or password is missing', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          authProvider: 'email',
          firstName: 'Layla',
          lastName: 'Hassan',
          phone: '07712345001',
          // no email, no password
          gender: 'female',
          birthDate: '1995-06-12',
          city: 'بغداد',
          area: 'الكرخ',
          subject: 'الإنجليزية',
          teachingStage: 'الإعدادي',
          yearsOfExperience: 3,
          hasPhysicalCourses: false,
          estimatedStudentCount: 10,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['body.email', 'body.password']));
    });

    it('authProvider="google" rejects when googleToken is missing', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({
          authProvider: 'google',
          firstName: 'Layla',
          lastName: 'Hassan',
          phone: '07712345002',
          gender: 'female',
          birthDate: '1995-06-12',
          city: 'بغداد',
          area: 'الكرخ',
          subject: 'الإنجليزية',
          teachingStage: 'الإعدادي',
          yearsOfExperience: 3,
          hasPhysicalCourses: false,
          estimatedStudentCount: 10,
        });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.googleToken');
    });

    it('schema accepts customTeachingStage as an optional string', async () => {
      const res = await request(app)
        .post('/api/teacher-applications')
        .send({ customTeachingStage: 'مرحلة خاصة بالاوقاف' });
      const fields = Array.isArray(res.body?.errors)
        ? (res.body.errors as { field?: string }[]).map((e) => e.field)
        : [];
      // customTeachingStage must NOT appear in error fields (it's optional)
      expect(fields).not.toContain('body.customTeachingStage');
    });
  });

  describe('Phase 8 — verify-email + resend endpoints', () => {
    const dummyAid = '00000000-0000-0000-0000-000000000000';

    it('POST /:id/verify-email with bad code shape → 400 validation', async () => {
      const res = await request(app)
        .post(`/api/teacher-applications/${dummyAid}/verify-email`)
        .send({ code: 'abc' });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.code');
    });

    it('POST /:id/verify-email with bad UUID → 400 validation on params', async () => {
      const res = await request(app)
        .post(`/api/teacher-applications/not-a-uuid/verify-email`)
        .send({ code: '123456' });
      expect(res.status).toBe(400);
    });

    it('POST /:id/resend-verification with bad UUID → 400 validation', async () => {
      const res = await request(app)
        .post(`/api/teacher-applications/not-a-uuid/resend-verification`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 8.12 — public catalog endpoints + status-check OTP
  // ---------------------------------------------------------------------------

  describe('Phase 8.12 — public catalog endpoints', () => {
    it('GET /api/public/subjects returns a non-empty array of strings', async () => {
      const res = await request(app).get('/api/public/subjects');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect((res.body.data as string[]).length).toBeGreaterThan(0);
      // sanity: every item should be a non-empty Arabic string
      for (const item of res.body.data as string[]) {
        expect(typeof item).toBe('string');
        expect(item.length).toBeGreaterThan(0);
      }
    });

    it('GET /api/public/teaching-stages returns a non-empty array of strings', async () => {
      const res = await request(app).get('/api/public/teaching-stages');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect((res.body.data as string[]).length).toBeGreaterThan(0);
    });

    it('catalog endpoints do not require auth', async () => {
      const r1 = await request(app).get('/api/public/subjects');
      const r2 = await request(app).get('/api/public/teaching-stages');
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
    });
  });

  describe('Phase 8.12 — status-check OTP validation gates', () => {
    it('POST /status/request rejects empty body with body.email', async () => {
      const res = await request(app)
        .post('/api/teacher-applications/status/request')
        .send({});
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.email');
    });

    it('POST /status/request rejects malformed email', async () => {
      const res = await request(app)
        .post('/api/teacher-applications/status/request')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.email');
    });

    it('POST /status/verify rejects empty body with both fields', async () => {
      const res = await request(app)
        .post('/api/teacher-applications/status/verify')
        .send({});
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['body.email', 'body.code']));
    });

    it('POST /status/verify rejects a non-numeric code', async () => {
      const res = await request(app)
        .post('/api/teacher-applications/status/verify')
        .send({ email: 'real@example.com', code: 'abcdef' });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.code');
    });

    it('POST /status/verify rejects a code that is not 6 digits', async () => {
      const res = await request(app)
        .post('/api/teacher-applications/status/verify')
        .send({ email: 'real@example.com', code: '12345' });
      expect(res.status).toBe(400);
      const fields = (res.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toContain('body.code');
    });
  });

  describe('Phase 3 — file-signature util (magic-byte detection)', () => {
    // Direct unit tests on the detection helper — proves a renamed
    // executable cannot ride through as image/jpeg.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sig = require('../utils/file-signature') as typeof import('../utils/file-signature');

    it('detects JPEG from FF D8 FF', () => {
      const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      const det = sig.detectFileFormat(buf);
      expect(det?.format).toBe('jpeg');
      expect(det?.mimeType).toBe('image/jpeg');
      expect(sig.mimeMatchesDetection('image/jpeg', 'jpeg')).toBe(true);
    });

    it('detects PNG from 89 50 4E 47 ...', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(sig.detectFileFormat(buf)?.format).toBe('png');
    });

    it('rejects an unknown format', () => {
      const buf = Buffer.from('<?php echo("pwned"); ?>');
      expect(sig.detectFileFormat(buf)).toBeNull();
    });

    it('mimeMatchesDetection rejects a spoofed mime', () => {
      // bytes are PNG, declared as image/jpeg → mismatch
      const declared = 'image/jpeg';
      expect(sig.mimeMatchesDetection(declared, 'png')).toBe(false);
    });
  });
});

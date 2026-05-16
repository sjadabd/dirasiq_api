// Integration tests for /api/auth/* that require a running PostgreSQL
// instance. These are gated behind the `TEST_DB_ENABLED=1` env flag — set it
// when a local test database (config: env.test) is available and seeded.
//
// Wire-level envelope/error tests live in `envelope.test.ts` and run without
// a database.

import request from 'supertest';
import app from '../index';

const dbEnabled = process.env['TEST_DB_ENABLED'] === '1';
const describeIfDb = dbEnabled ? describe : describe.skip;

describeIfDb('Auth integration (requires test DB)', () => {
  const bootstrap = process.env['BOOTSTRAP_TOKEN'];

  describe('POST /api/auth/register/super-admin', () => {
    it('requires the bootstrap token', async () => {
      const res = await request(app)
        .post('/api/auth/register/super-admin')
        .send({ name: 'Admin', email: 'admin@test.com', password: 'Password123' });
      // Without BOOTSTRAP_TOKEN env the gate returns 404.
      if (!bootstrap) {
        expect(res.status).toBe(404);
        return;
      }
      // With BOOTSTRAP_TOKEN env but no Authorization header → 401.
      expect(res.status).toBe(401);
    });

    it('creates the first super admin with a valid bootstrap token', async () => {
      if (!bootstrap) return;
      const res = await request(app)
        .post('/api/auth/register/super-admin')
        .set('Authorization', `Bearer ${bootstrap}`)
        .send({ name: 'Admin', email: 'admin@test.com', password: 'Password123' });
      // 201 on first call, 400 thereafter (super_admin already exists).
      expect([201, 400]).toContain(res.status);
      expect(res.body.success).toBe(res.status === 201);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 401 INVALID_CREDENTIALS for an unknown user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'no-such-user@test.com', password: 'Password123' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errors?.[0]?.code).toBe('INVALID_CREDENTIALS');
    });
  });
});

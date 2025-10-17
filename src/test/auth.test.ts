import request from 'supertest';
import app from '../index';

describe('Auth Endpoints', () => {
  describe('POST /api/auth/register/super-admin', () => {
    it('should register a super admin successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register/super-admin')
        .send({
          name: 'Test Admin',
          email: 'admin@test.com',
          password: 'Password123'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.email).toBe('admin@test.com');
      expect(response.body.data.user.userType).toBe('super_admin');
    });

    it('should fail with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register/super-admin')
        .send({
          name: 'Test Admin',
          email: 'invalid-email',
          password: 'Password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail with weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register/super-admin')
        .send({
          name: 'Test Admin',
          email: 'admin@test.com',
          password: '123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/register/teacher', () => {
    it('should register a teacher successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register/teacher')
        .send({
          name: 'Test Teacher',
          email: 'teacher@test.com',
          password: 'Password123',
          phone: '+966501234567',
          address: 'Test Address',
          bio: 'Test Bio',
          experienceYears: 5
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.email).toBe('teacher@test.com');
      expect(response.body.data.user.userType).toBe('teacher');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      // First register a user
      await request(app)
        .post('/api/auth/register/super-admin')
        .send({
          name: 'Login Test Admin',
          email: 'logintest@test.com',
          password: 'Password123'
        });

      // Then try to login
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logintest@test.com',
          password: 'Password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
    });

    it('should fail with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'WrongPassword123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Server is running');
    });
  });
});

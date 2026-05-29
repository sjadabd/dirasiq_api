// Wire-level + schema unit tests for Phase 4 of the National Video Marketplace.
//
// Two halves:
//   (a) ENVELOPE — every new endpoint is mounted + returns the canonical
//       401 without a token. Proves routes are reachable.
//   (b) ZOD — empty-body strict on /purchase, refund body validation.
//
// The actual happy-path / duplicate-purchase / webhook idempotency /
// refund-window flows need DB seed data + Wayl SDK mocking, so they
// live in the SQL smoke test at
// src/scripts/test_video_course_purchase.sql.

import request from 'supertest';
import app from '../index';
import {
  videoCoursePurchaseInitiateBodySchema,
  videoCoursePurchaseRefundBodySchema,
} from '../schemas/video-course.schemas';

const VC = '00000000-0000-0000-0000-000000000000';

describe('Video Marketplace Purchase API envelope (Phase 4)', () => {
  describe('Authentication gates', () => {
    it('returns 401 for POST /api/student/video-courses/:id/purchase without a token', async () => {
      const res = await request(app)
        .post(`/api/student/video-courses/${VC}/purchase`)
        .send({});
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        errors: [{ code: 'UNAUTHORIZED' }],
      });
    });

    it('returns 401 for POST /api/super-admin/video-course-purchases/:id/refund without a token', async () => {
      const res = await request(app)
        .post(`/api/super-admin/video-course-purchases/${VC}/refund`)
        .send({ reason: 'whatever' });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        errors: [{ code: 'UNAUTHORIZED' }],
      });
    });
  });

  // -------------------------------------------------------------------
  // Pure schema tests — no HTTP, no DB.
  // -------------------------------------------------------------------
  describe('Initiate body schema (.strict() — empty object only)', () => {
    it('accepts an empty body', () => {
      const out = videoCoursePurchaseInitiateBodySchema.safeParse({});
      expect(out.success).toBe(true);
    });

    it('rejects any extra key', () => {
      // Pricing must NEVER come from the client. The strict object
      // schema enforces this at the wire boundary.
      const out = videoCoursePurchaseInitiateBodySchema.safeParse({
        amountIqd: 50000,
      });
      expect(out.success).toBe(false);
    });
  });

  describe('Refund body schema', () => {
    it('rejects an empty body', () => {
      const out = videoCoursePurchaseRefundBodySchema.safeParse({});
      expect(out.success).toBe(false);
    });

    it('rejects a too-short reason', () => {
      const out = videoCoursePurchaseRefundBodySchema.safeParse({ reason: 'x' });
      expect(out.success).toBe(false);
      const issues = out.success ? [] : out.error.issues;
      expect(issues.some((i) => i.path.includes('reason'))).toBe(true);
    });

    it('accepts a well-formed reason', () => {
      const out = videoCoursePurchaseRefundBodySchema.safeParse({
        reason: 'تم اكتشاف خطأ في إعدادات الكورس بعد البيع',
      });
      expect(out.success).toBe(true);
    });
  });
});

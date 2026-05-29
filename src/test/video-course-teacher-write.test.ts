// Wire-level + schema unit tests for Phase 3 of the National Video Marketplace.
//
// Two halves:
//   (a) ENVELOPE — every new / changed teacher endpoint returns the
//       canonical 401 without a token. Proves the routes are mounted +
//       reachable; doesn't exercise validation (which runs AFTER auth).
//   (b) ZOD CROSS-FIELD — pure schema tests against
//       videoCourseCreateSchema. These are independent of the running
//       app, so they cover the validation rules even without a DB.
//
// Ownership checks (validateTargetCoursesOwnership +
// validateFreeStudentsRelationship) need DB seed data so they're
// exercised by the manual SQL smoke pass, not Jest.

import request from 'supertest';
import app from '../index';
import {
  videoCourseCreateSchema,
  videoCourseUpdateSchema,
} from '../schemas/video-course.schemas';

const BASE = '/api/teacher/video-courses';
const baseValid = {
  title: 'Test Course',
  subject: 'Math',
  teachingStage: 'Sixth',
};

describe('Video Marketplace Teacher Write API envelope (Phase 3)', () => {
  describe('Authentication gate', () => {
    it('returns 401 for every Phase 3 endpoint without a token', async () => {
      const reqs = [
        request(app).post(BASE).send({}),
        request(app).patch(`${BASE}/00000000-0000-0000-0000-000000000000`).send({}),
        request(app).get('/api/teacher/commission-preview?priceIqd=50000'),
      ];
      const results = await Promise.all(reqs);
      for (const res of results) {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({
          success: false,
          errors: [{ code: 'UNAUTHORIZED' }],
        });
      }
    });
  });

  // -------------------------------------------------------------------
  // Zod schema cross-field validation. These run in-process — no HTTP,
  // no DB, no auth. They lock the contract that the controller relies
  // on: when accessType is provided, the strict rules apply; when
  // omitted, the legacy back-compat path is allowed.
  // -------------------------------------------------------------------
  describe('Create schema — legacy back-compat path (no accessType)', () => {
    it('accepts the legacy isFree+price shape without grade targets', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        isFree: true,
      });
      expect(out.success).toBe(true);
    });

    it('does NOT enforce gradeTargetIds when accessType is omitted', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        isFree: false,
        price: 50000,
      });
      // No accessType + legacy isFree=false should pass Zod even without
      // gradeTargetIds. The service layer derives accessType from isFree.
      expect(out.success).toBe(true);
    });
  });

  describe('Create schema — new strict path (accessType present)', () => {
    it('rejects public_free_by_grade without gradeTargetIds', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'public_free_by_grade',
      });
      expect(out.success).toBe(false);
      const issues = out.success ? [] : out.error.issues;
      expect(issues.some((i) => i.path.includes('gradeTargetIds'))).toBe(true);
    });

    it('accepts public_free_by_grade with at least one grade target', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'public_free_by_grade',
        gradeTargetIds: ['11111111-1111-4111-8111-111111111111'],
      });
      expect(out.success).toBe(true);
    });

    it('accepts enrolled_students_free without grade or price', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'enrolled_students_free',
      });
      expect(out.success).toBe(true);
    });

    it('rejects marketplace_paid without priceIqd > 0', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'marketplace_paid',
        gradeTargetIds: ['11111111-1111-4111-8111-111111111111'],
        priceIqd: 0,
      });
      expect(out.success).toBe(false);
      const issues = out.success ? [] : out.error.issues;
      expect(issues.some((i) => i.path.includes('priceIqd'))).toBe(true);
    });

    it('rejects marketplace_paid without gradeTargetIds', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'marketplace_paid',
        priceIqd: 50000,
      });
      expect(out.success).toBe(false);
      const issues = out.success ? [] : out.error.issues;
      expect(issues.some((i) => i.path.includes('gradeTargetIds'))).toBe(true);
    });

    it('accepts marketplace_paid with grade target + positive priceIqd', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'marketplace_paid',
        gradeTargetIds: ['11111111-1111-4111-8111-111111111111'],
        priceIqd: 50000,
      });
      expect(out.success).toBe(true);
    });

    it('rejects freeForEnrolledStudents=true on non-marketplace_paid', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'public_free_by_grade',
        gradeTargetIds: ['11111111-1111-4111-8111-111111111111'],
        freeForEnrolledStudents: true,
      });
      expect(out.success).toBe(false);
      const issues = out.success ? [] : out.error.issues;
      expect(
        issues.some((i) => i.path.includes('freeForEnrolledStudents'))
      ).toBe(true);
    });

    it('accepts freeForEnrolledStudents=true on marketplace_paid', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'marketplace_paid',
        gradeTargetIds: ['11111111-1111-4111-8111-111111111111'],
        priceIqd: 50000,
        freeForEnrolledStudents: true,
      });
      expect(out.success).toBe(true);
    });

    it('rejects unknown accessType values', () => {
      const out = videoCourseCreateSchema.safeParse({
        ...baseValid,
        accessType: 'something_else',
      });
      expect(out.success).toBe(false);
    });
  });

  describe('Update schema', () => {
    it('requires at least one field', () => {
      const out = videoCourseUpdateSchema.safeParse({});
      expect(out.success).toBe(false);
    });

    it('accepts a single new-field update (accessType only)', () => {
      // Final-state cross-field rules belong to the service, not Zod.
      // The schema is happy with a single-key patch.
      const out = videoCourseUpdateSchema.safeParse({
        accessType: 'marketplace_paid',
      });
      expect(out.success).toBe(true);
    });

    it('accepts a single legacy-field update (price only)', () => {
      const out = videoCourseUpdateSchema.safeParse({ price: 30000 });
      expect(out.success).toBe(true);
    });

    it('accepts pivot-only updates (gradeTargetIds: [])', () => {
      const out = videoCourseUpdateSchema.safeParse({ gradeTargetIds: [] });
      expect(out.success).toBe(true);
    });
  });
});

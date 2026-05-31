// Unit tests for the Phase 4 "resume or replace pending purchase" logic in
// VideoCoursePurchaseService.initiate. Covers the five scenarios from the
// fix(video-courses): refresh expired Wayl pending purchase links spec:
//
//   A) no existing pending row              → creates a fresh Wayl link.
//   B) existing pending row younger than TTL → resumes the same Wayl URL.
//   C) existing pending row older than TTL  → marks the old row 'failed'
//                                             and creates a fresh link.
//   D) paid purchase already exists         → returns alreadyHasAccess,
//                                             no Wayl call.
//   E) concurrent click race (23505)        → returns the winner's URL,
//                                             never the legacy 409.
//
// External dependencies (pool, Wayl, models) are mocked so the tests don't
// need a real DB or gateway. The mocks are set up at module level via
// `jest.mock(...)` calls BEFORE the service is imported, which is the
// only place jest reliably intercepts module loading.

import {
  VideoCourseAccessType,
  VideoCourseStatus,
  VideoCourseVisibility,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must be declared before importing the service.
// ─────────────────────────────────────────────────────────────────────────────

const mockPoolQuery = jest.fn();
// Default to a resolved promise so callers can `.catch()` safely (the
// ROLLBACK path in the service does exactly that). Per-test code can still
// override via mockResolvedValueOnce / mockRejectedValueOnce.
const mockClientQuery = jest.fn(() => Promise.resolve({ rows: [], rowCount: 0 }));
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn(() =>
  Promise.resolve({
    query: mockClientQuery,
    release: mockClientRelease,
  }),
);

jest.mock('../config/database', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: () => mockPoolConnect(),
  },
}));

jest.mock('../models/video-course.model', () => ({
  VideoCourseModel: { findById: jest.fn() },
}));
jest.mock('../models/video-course-purchase.model', () => ({
  VideoCoursePurchaseModel: {
    hasPaidPurchase: jest.fn(),
    createPending: jest.fn(),
    attachWaylLink: jest.fn(),
    markPaid: jest.fn(),
    markRefunded: jest.fn(),
    findById: jest.fn(),
  },
}));
jest.mock('../models/wayl-payment-link.model', () => ({
  WaylPaymentLinkModel: { create: jest.fn() },
}));
jest.mock('../models/video-course-free-student.model', () => ({
  VideoCourseFreeStudentModel: { isWhitelisted: jest.fn() },
}));
jest.mock('../models/video-course-grade-target.model', () => ({
  VideoCourseGradeTargetModel: { listForVideoCourse: jest.fn() },
}));
jest.mock('../models/video-course-access.model', () => ({
  VideoCourseAccessModel: { canView: jest.fn() },
}));
jest.mock('../services/wayl.service', () => ({
  WaylService: {
    createLink: jest.fn(),
    generateSecret: jest.fn(() => 'test-secret'),
  },
}));
jest.mock('../services/wallet.service', () => ({
  WalletService: {
    creditVideoCoursePurchase: jest.fn(),
    debitVideoCoursePurchaseRefund: jest.fn(),
  },
}));
jest.mock('../services/commission.service', () => ({
  CommissionService: {
    computeFor: jest.fn(() =>
      Promise.resolve({
        commissionPercent: 10,
        commissionAmountIqd: 5000,
        netToTeacherIqd: 45000,
      }),
    ),
  },
}));

// Imports (must be AFTER jest.mock).
/* eslint-disable @typescript-eslint/no-var-requires */
const {
  VideoCoursePurchaseService,
  isPendingPurchaseExpired,
} = require('../services/video-course-purchase.service');
const { VideoCourseModel } = require('../models/video-course.model');
const {
  VideoCoursePurchaseModel,
} = require('../models/video-course-purchase.model');
const {
  WaylPaymentLinkModel,
} = require('../models/wayl-payment-link.model');
const {
  VideoCourseFreeStudentModel,
} = require('../models/video-course-free-student.model');
const { WaylService } = require('../services/wayl.service');
/* eslint-enable @typescript-eslint/no-var-requires */

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const COURSE_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const TEACHER_ID = '33333333-3333-3333-3333-333333333333';
const PURCHASE_ID = '44444444-4444-4444-4444-444444444444';
const WAYL_LINK_ID = '55555555-5555-5555-5555-555555555555';

const sampleCourse = {
  id: COURSE_ID,
  teacherId: TEACHER_ID,
  title: 'Test Paid Course',
  description: '',
  subject: 'test',
  teachingStage: '',
  gradeId: null,
  coverImage: null,
  price: 50_000,
  isFree: false,
  visibility: VideoCourseVisibility.PUBLIC,
  status: VideoCourseStatus.APPROVED,
  accessType: VideoCourseAccessType.MARKETPLACE_PAID,
  freeForEnrolledStudents: false,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

beforeEach(() => {
  // Default env required by initiate().
  process.env['WAYL_WEBHOOK_URL'] = 'https://api.mulhimiq.com/api/payments/wayl/webhook';
  process.env['WAYL_REDIRECT_URL'] = 'https://mulhimiq.com/student/library';

  jest.clearAllMocks();
  VideoCourseModel.findById.mockResolvedValue(sampleCourse);
  VideoCourseFreeStudentModel.isWhitelisted.mockResolvedValue(false);
  VideoCoursePurchaseModel.hasPaidPurchase.mockResolvedValue(false);
  VideoCoursePurchaseModel.createPending.mockResolvedValue({
    id: PURCHASE_ID,
    teacher_id: TEACHER_ID,
  });
  VideoCoursePurchaseModel.attachWaylLink.mockResolvedValue(undefined);
  WaylPaymentLinkModel.create.mockResolvedValue({ id: WAYL_LINK_ID });
  WaylService.createLink.mockResolvedValue({
    data: { url: 'https://checkout.thewayl.com/payment/action?id=fresh', id: 'wayl-id', code: 'C' },
  });

  // Two pool.query calls happen before the resume SELECT only when
  // freeForEnrolledStudents is true (it isn't, in the sample). The
  // standard order is:
  //   1. resume SELECT
  //   2. grade eligibility SELECT
  // Per-scenario test code overrides via mockResolvedValueOnce.
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper — boundary-tests the TTL math
// ─────────────────────────────────────────────────────────────────────────────

describe('isPendingPurchaseExpired (TTL helper)', () => {
  const TWENTY_MIN_MS = 20 * 60 * 1000;
  it('returns false at age 0', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(isPendingPurchaseExpired(new Date(now), now)).toBe(false);
  });
  it('returns false at age 19 minutes 59 seconds', () => {
    const now = Date.UTC(2026, 0, 1);
    const created = now - (TWENTY_MIN_MS - 1_000);
    expect(isPendingPurchaseExpired(new Date(created), now)).toBe(false);
  });
  it('returns true at age 20 minutes 1 second', () => {
    const now = Date.UTC(2026, 0, 1);
    const created = now - (TWENTY_MIN_MS + 1_000);
    expect(isPendingPurchaseExpired(new Date(created), now)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario tests — one describe per spec letter
// ─────────────────────────────────────────────────────────────────────────────

describe('VideoCoursePurchaseService.initiate — resume / replace / race', () => {
  // A) no existing pending row → creates fresh link.
  it('A: with no pending row, mints a fresh Wayl link inside a tx', async () => {
    // resume SELECT → empty; grade SELECT → ok=true.
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })          // resume select
      .mockResolvedValueOnce({ rows: [{ ok: true }] }); // grade check

    const out = await VideoCoursePurchaseService.initiate({
      studentId: STUDENT_ID,
      videoCourseId: COURSE_ID,
    });

    expect(out).toMatchObject({
      url: expect.stringContaining('checkout.thewayl.com'),
      referenceId: `vcp_${PURCHASE_ID}`,
      purchaseId: PURCHASE_ID,
      amountIqd: 50_000,
    });
    // Transaction was opened + committed.
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(WaylService.createLink).toHaveBeenCalledTimes(1);
  });

  // B) existing pending row younger than TTL → resumes same link.
  it('B: with a young pending row, returns the SAME Wayl URL (no tx, no Wayl call)', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          purchaseId: PURCHASE_ID,
          amountIqd: '50000.00',
          url: 'https://checkout.thewayl.com/payment/action?id=existing',
          referenceId: `vcp_${PURCHASE_ID}`,
          createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min old
        },
      ],
    });

    const out = await VideoCoursePurchaseService.initiate({
      studentId: STUDENT_ID,
      videoCourseId: COURSE_ID,
    });

    expect(out.url).toBe('https://checkout.thewayl.com/payment/action?id=existing');
    expect(out.purchaseId).toBe(PURCHASE_ID);
    // No tx, no Wayl gateway call.
    expect(mockPoolConnect).not.toHaveBeenCalled();
    expect(WaylService.createLink).not.toHaveBeenCalled();
    expect(VideoCoursePurchaseModel.createPending).not.toHaveBeenCalled();
  });

  // C) existing pending row older than TTL → marks failed, creates fresh.
  it('C: with an expired pending row, flips it to failed and mints a fresh link', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({
        // resume SELECT — row older than 20 min
        rows: [
          {
            purchaseId: PURCHASE_ID,
            amountIqd: '50000.00',
            url: 'https://checkout.thewayl.com/payment/action?id=stale',
            referenceId: `vcp_${PURCHASE_ID}`,
            createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min old
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // UPDATE … SET status='failed'
      .mockResolvedValueOnce({ rows: [{ ok: true }] });   // grade SELECT

    const out = await VideoCoursePurchaseService.initiate({
      studentId: STUDENT_ID,
      videoCourseId: COURSE_ID,
    });

    // First non-SELECT pool.query call must be the failure flip.
    const failUpdateCall = mockPoolQuery.mock.calls.find((c) =>
      String(c[0]).includes("SET status = 'failed'"),
    );
    expect(failUpdateCall).toBeDefined();
    expect(failUpdateCall![1]).toEqual([PURCHASE_ID]);

    // Fresh Wayl URL was minted.
    expect(out.url).toContain('checkout.thewayl.com');
    expect(out.url).not.toContain('stale');
    expect(WaylService.createLink).toHaveBeenCalledTimes(1);
  });

  // D) paid purchase already exists → returns alreadyHasAccess, no Wayl call.
  it('D: with a prior paid purchase, returns alreadyHasAccess (no Wayl call)', async () => {
    VideoCoursePurchaseModel.hasPaidPurchase.mockResolvedValueOnce(true);

    const out = await VideoCoursePurchaseService.initiate({
      studentId: STUDENT_ID,
      videoCourseId: COURSE_ID,
    });

    expect(out).toEqual({ alreadyHasAccess: { reason: 'already_owned' } });
    expect(out.url).toBeUndefined();
    expect(mockPoolConnect).not.toHaveBeenCalled();
    expect(WaylService.createLink).not.toHaveBeenCalled();
  });

  // E) concurrent click race (23505) → returns concurrent winner's URL.
  it('E: on a 23505 race, returns the concurrent winner URL instead of throwing 409', async () => {
    // resume SELECT → empty (both racers saw an empty state)
    // grade SELECT → ok=true
    // post-rollback re-SELECT → returns winner row
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            purchaseId: 'winner-purchase-id',
            amountIqd: '50000.00',
            url: 'https://checkout.thewayl.com/payment/action?id=winner',
            referenceId: 'vcp_winner-purchase-id',
          },
        ],
      });

    // Inside the tx: BEGIN succeeds; createPending throws 23505.
    const unique = Object.assign(new Error('duplicate'), { code: '23505' });
    VideoCoursePurchaseModel.createPending.mockRejectedValueOnce(unique);

    const out = await VideoCoursePurchaseService.initiate({
      studentId: STUDENT_ID,
      videoCourseId: COURSE_ID,
    });

    expect(out.url).toBe('https://checkout.thewayl.com/payment/action?id=winner');
    expect(out.purchaseId).toBe('winner-purchase-id');
    // ROLLBACK was issued.
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
  });
});

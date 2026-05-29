// Phase 4 of the National Video Marketplace.
//
// Owns the student-side purchase pipeline:
//
//   initiate(studentId, videoCourseId)
//     1. Load + gate the video course.
//     2. Check whether the student ALREADY has access (whitelist,
//        prior paid purchase, free_for_enrolled_students + active
//        teacher relationship). If yes, return the
//        `alreadyHasAccess` shape WITHOUT creating a payment link
//        OR a purchase row — the dashboard / Flutter caller flips
//        the UI from "buy" to "open" based on the reason.
//     3. Verify grade eligibility (mirrors the access function's
//        marketplace_paid grade-match rule).
//     4. Compute a fresh commission breakdown via the existing
//        Phase 7 CommissionService — never reused from any cached
//        copy.
//     5. Transactionally:
//          a. INSERT into video_course_purchases (status='pending',
//             snapshot of price/percent/IQD).
//          b. Call Wayl /api/v1/links to create the gateway link.
//          c. INSERT into wayl_payment_links (purpose=
//             'video_course_purchase' + video_course_purchase_id FK).
//          d. UPDATE the purchase row to wire wayl_payment_link_id.
//        If Wayl fails OR any of the DB writes fail, the whole tx
//        rolls back — the student doesn't end up with an orphan
//        purchase row.
//   completePaid(referenceId)
//     Called from the Wayl webhook controller after HMAC + idempotency
//     gates pass. Marks the purchase paid AND credits the teacher's
//     wallet via WalletService.creditVideoCoursePurchase. Idempotent
//     end-to-end (markPaid + idempotencyKey on the ledger entry).
//   refundByAdmin(purchaseId, reason, actorUserId)
//     Admin-only manual refund. Checks the 7-day window (T+7), marks
//     the purchase refunded, and clawback the teacher's wallet via
//     WalletService.debitVideoCoursePurchaseRefund.
//
// SECURITY: the student id is taken from the JWT in the controller
// and passed in — the body never carries it. Pricing is computed
// server-side from video_courses.price; the body has no `amount`.

import pool from '../config/database';
import { VideoCourseAccessModel } from '../models/video-course-access.model';
import { VideoCourseFreeStudentModel } from '../models/video-course-free-student.model';
import { VideoCourseGradeTargetModel } from '../models/video-course-grade-target.model';
import { VideoCourseModel } from '../models/video-course.model';
import { VideoCoursePurchaseModel } from '../models/video-course-purchase.model';
import { WaylPaymentLinkModel } from '../models/wayl-payment-link.model';
import { ApiError, ErrorCodes } from '../utils/api-error';
import { logger } from '../utils/logger';
import { VideoCourseAccessType, VideoCourseStatus } from '../types';
import { CommissionService } from './commission.service';
import { WalletService } from './wallet.service';
import { WaylService } from './wayl.service';

const REFUND_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_REDIRECT_FALLBACK = 'https://mulhimiq.com/student/library?poll=1';

interface InitiateResult {
  // When the student already has access — no payment link is created.
  alreadyHasAccess?: {
    reason:
      | 'whitelisted'
      | 'already_owned'
      | 'enrolled_bypass';
  };
  // Otherwise the payment link.
  url?: string;
  referenceId?: string;
  purchaseId?: string;
  amountIqd?: number;
}

export class VideoCoursePurchaseService {
  // -------------------------------------------------------------------------
  // Student → initiate purchase
  // -------------------------------------------------------------------------
  static async initiate(args: {
    studentId: string;
    videoCourseId: string;
  }): Promise<InitiateResult> {
    // 1. Load + gate.
    const course = await VideoCourseModel.findById(args.videoCourseId);
    if (
      !course ||
      course.status !== VideoCourseStatus.APPROVED ||
      course.deletedAt !== null
    ) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    if (course.accessType !== VideoCourseAccessType.MARKETPLACE_PAID) {
      throw new ApiError(
        400,
        'هذه الدورة ليست متاحة للشراء',
        ErrorCodes.BUSINESS_RULE
      );
    }

    // 2. Free-access bypass checks — in increasing cost order so we
    //    short-circuit before the more expensive lookups.
    if (
      await VideoCourseFreeStudentModel.isWhitelisted(
        args.videoCourseId,
        args.studentId
      )
    ) {
      return { alreadyHasAccess: { reason: 'whitelisted' } };
    }
    if (
      await VideoCoursePurchaseModel.hasPaidPurchase(
        args.videoCourseId,
        args.studentId
      )
    ) {
      return { alreadyHasAccess: { reason: 'already_owned' } };
    }
    if (course.freeForEnrolledStudents) {
      const { rows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM course_bookings
            WHERE student_id  = $1
              AND teacher_id  = $2
              AND status      IN ('confirmed','approved')
              AND is_deleted  = FALSE
         ) AS ok`,
        [args.studentId, course.teacherId]
      );
      if (rows[0]?.ok) {
        return { alreadyHasAccess: { reason: 'enrolled_bypass' } };
      }
    }

    // 3. Grade eligibility — student must be in the targeted grade for
    //    the active study year. We hit the access function with a
    //    "fake whitelist" trick? No — easier to just check grade
    //    targets directly because we already know access_type is
    //    marketplace_paid.
    const { rows: gradeOk } = await pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM video_course_grade_targets vcgt
           JOIN student_grades sg ON sg.grade_id = vcgt.grade_id
          WHERE vcgt.video_course_id = $1
            AND sg.student_id        = $2
            AND sg.study_year        = (
                SELECT year FROM academic_years WHERE is_active = TRUE LIMIT 1
            )
            AND sg.deleted_at IS NULL
            AND sg.is_active = TRUE
       ) AS ok`,
      [args.videoCourseId, args.studentId]
    );
    if (!gradeOk[0]?.ok) {
      throw new ApiError(
        400,
        'هذه الدورة غير متاحة لمرحلتك الدراسية',
        ErrorCodes.BUSINESS_RULE
      );
    }

    // 4. Compute commission breakdown server-side. Never trust the body.
    const grossPriceIqd = Number(course.price);
    if (!Number.isFinite(grossPriceIqd) || grossPriceIqd <= 0) {
      throw new ApiError(
        500,
        'سعر الدورة غير صالح — تواصل مع الدعم',
        ErrorCodes.INTERNAL_ERROR
      );
    }
    const breakdown = await CommissionService.computeFor({
      teacherId: course.teacherId,
      grossSalePriceIqd: grossPriceIqd,
    });

    // 5. Env preflight — fail with a clear ops-side message instead
    //    of a generic 500 from the Wayl SDK.
    const webhookUrl = process.env['WAYL_WEBHOOK_URL'];
    if (!webhookUrl) {
      logger.error(
        { videoCourseId: args.videoCourseId, studentId: args.studentId },
        'WAYL_WEBHOOK_URL is not configured — video course purchase unavailable'
      );
      throw new ApiError(
        503,
        'بوّابة الدفع غير مُهيّأة — تواصل مع الدعم',
        ErrorCodes.SERVICE_UNAVAILABLE
      );
    }
    const redirectionUrl =
      process.env['WAYL_REDIRECT_URL'] || DEFAULT_REDIRECT_FALLBACK;
    const webhookSecret = WaylService.generateSecret();
    const defaultImageUrl =
      process.env['WAYL_DEFAULT_LINEITEM_IMAGE_URL'] ||
      'https://mulhimiq.com/favicon.ico';

    // 6. Transactional create. The pending purchase row goes in first
    //    so a Wayl failure leaves a clean audit row we can mark
    //    'failed' from the webhook layer (or expire via a cron).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const purchase = await VideoCoursePurchaseModel.createPending(
        {
          videoCourseId: args.videoCourseId,
          studentId: args.studentId,
          teacherId: course.teacherId,
          amountIqd: grossPriceIqd,
          platformCommissionPercent: breakdown.commissionPercent,
          platformCommissionIqd: breakdown.commissionAmountIqd,
          teacherNetIqd: breakdown.netToTeacherIqd,
        },
        client
      );

      const referenceId = `vcp_${purchase.id}`;
      const waylPayload = {
        referenceId,
        total: grossPriceIqd,
        currency: 'IQD' as const,
        webhookUrl,
        redirectionUrl,
        webhookSecret,
        lineItem: [
          {
            label: course.title.slice(0, 100),
            amount: grossPriceIqd,
            type: 'increase' as const,
            image: course.coverImage || defaultImageUrl,
          },
        ],
      };

      // Wayl call is INSIDE the tx so a 5xx rolls back the purchase
      // row. The tradeoff is keeping the pg connection longer; the
      // gateway round-trip is ~200-500ms typically.
      const waylRes = await WaylService.createLink(waylPayload);
      const url = waylRes?.data?.url || waylRes?.url;
      const waylOrderId = waylRes?.data?.id || waylRes?.id || null;
      const waylCode = waylRes?.data?.code || waylRes?.code || null;
      if (!url) {
        throw new Error('Wayl create-link response missing url');
      }

      const link = await WaylPaymentLinkModel.create(
        {
          teacherId: course.teacherId,
          purpose: 'video_course_purchase',
          amount: grossPriceIqd,
          currency: 'iqd',
          referenceId,
          waylSecret: webhookSecret,
          waylUrl: url,
          waylOrderId,
          waylCode,
          videoCoursePurchaseId: purchase.id,
        },
        client
      );

      await VideoCoursePurchaseModel.attachWaylLink(
        purchase.id,
        link.id,
        client
      );

      await client.query('COMMIT');

      logger.info(
        {
          purchaseId: purchase.id,
          videoCourseId: args.videoCourseId,
          studentId: args.studentId,
          teacherId: course.teacherId,
          amountIqd: grossPriceIqd,
          referenceId,
        },
        'video course purchase initiated'
      );

      return {
        url,
        referenceId,
        purchaseId: purchase.id,
        amountIqd: grossPriceIqd,
      };
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      // 23505 on the active-per-student partial unique index = a
      // concurrent click already created a pending purchase. Surface
      // that as a friendly 409 — the existing row is the one the
      // student should pay for.
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new ApiError(
          409,
          'يوجد طلب شراء معلّق لهذه الدورة بالفعل',
          ErrorCodes.ALREADY_EXISTS,
          { field: 'videoCourseId' }
        );
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Webhook → mark paid + credit teacher
  // -------------------------------------------------------------------------
  /**
   * Called from WaylWebhookController after HMAC + amount + status
   * gates pass. Operates ENTIRELY through idempotency keys so a
   * webhook retry collapses to a no-op.
   */
  static async completePaid(args: {
    videoCoursePurchaseId: string;
    waylLinkId: string;
    paidAt: Date;
  }): Promise<void> {
    const flipped = await VideoCoursePurchaseModel.markPaid(
      args.videoCoursePurchaseId,
      args.paidAt
    );
    if (!flipped) {
      // Either the row is already paid (idempotent retry) or it was
      // refunded between webhook and processing. Either way the credit
      // has already been booked OR clawed back — don't double-credit.
      return;
    }

    await WalletService.creditVideoCoursePurchase({
      teacherId: flipped.teacher_id,
      purchaseId: flipped.id,
      waylLinkId: args.waylLinkId,
      snapshot: {
        grossSalePriceIqd: Number(flipped.amount_iqd),
        commissionPercent: Number(flipped.platform_commission_percent),
        commissionAmountIqd: Number(flipped.platform_commission_iqd),
        netToTeacherIqd: Number(flipped.teacher_net_iqd),
      },
      idempotencyKey: `vcp:${flipped.id}`,
    });

    logger.info(
      {
        purchaseId: flipped.id,
        teacherId: flipped.teacher_id,
        teacherNetIqd: Number(flipped.teacher_net_iqd),
      },
      'video course purchase paid → wallet credited'
    );
  }

  // -------------------------------------------------------------------------
  // Admin → refund
  // -------------------------------------------------------------------------
  /**
   * Admin manual refund within the 7-day window. The refund window
   * starts at `paid_at` (NOT `created_at`) so a purchase that took
   * 6 days to actually pay still gets its full week.
   *
   * The wallet debit is owned by WalletService.debitVideoCoursePurchaseRefund
   * (transactional + idempotent). This service just gates the
   * eligibility window + flips the purchase status.
   */
  static async refundByAdmin(args: {
    purchaseId: string;
    actorUserId: string;
    reason: string;
  }): Promise<void> {
    const purchase = await VideoCoursePurchaseModel.findById(args.purchaseId);
    if (!purchase) {
      throw new ApiError(404, 'الشراء غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (purchase.status !== 'paid') {
      throw new ApiError(
        400,
        'لا يمكن استرداد هذا الشراء — حالته الحالية لا تسمح',
        ErrorCodes.BUSINESS_RULE,
        { currentStatus: purchase.status }
      );
    }
    if (!purchase.paid_at) {
      throw new ApiError(
        500,
        'بيانات الشراء غير مكتملة (paid_at مفقود)',
        ErrorCodes.INTERNAL_ERROR
      );
    }

    const paidAtMs = new Date(purchase.paid_at).getTime();
    const ageDays = (Date.now() - paidAtMs) / MS_PER_DAY;
    if (ageDays > REFUND_WINDOW_DAYS) {
      throw new ApiError(
        400,
        `انتهت نافذة الاسترداد (${REFUND_WINDOW_DAYS} أيام من الدفع)`,
        ErrorCodes.BUSINESS_RULE,
        { paidAt: purchase.paid_at, ageDays: Math.round(ageDays) }
      );
    }

    // Debit FIRST then flip status — if the wallet debit throws
    // (insufficient funds), the purchase stays 'paid' so a retry is
    // possible. Reverse order would leave us with refunded purchases
    // we never clawed back.
    await WalletService.debitVideoCoursePurchaseRefund({
      teacherId: purchase.teacher_id,
      purchaseId: purchase.id,
      amountIqd: Number(purchase.teacher_net_iqd),
      actorUserId: args.actorUserId,
      notes: args.reason,
    });

    const refunded = await VideoCoursePurchaseModel.markRefunded(
      purchase.id,
      args.reason
    );
    if (!refunded) {
      // The row flipped between our findById + markRefunded — log so
      // ops can investigate (wallet was debited but status not flipped).
      logger.error(
        { purchaseId: purchase.id },
        'refund debited wallet but markRefunded returned null — race against status flip'
      );
      throw new ApiError(
        500,
        'تعذّر تحديث حالة الشراء بعد الاسترداد',
        ErrorCodes.INTERNAL_ERROR
      );
    }

    logger.info(
      {
        purchaseId: purchase.id,
        teacherId: purchase.teacher_id,
        amountIqd: Number(purchase.teacher_net_iqd),
        actorUserId: args.actorUserId,
      },
      'video course purchase refunded'
    );
  }

  // -------------------------------------------------------------------------
  // Eligibility helper — used by the controller to decide whether to
  // SHOW a "buy" button at all. Not security-critical (the access
  // function is the final word) — just a UX hint.
  // -------------------------------------------------------------------------
  static async describeAccessForStudent(args: {
    studentId: string;
    videoCourseId: string;
  }): Promise<{ canPlay: boolean; canBuy: boolean }> {
    const canPlay = await VideoCourseAccessModel.canView(
      args.studentId,
      args.videoCourseId
    );
    if (canPlay) return { canPlay: true, canBuy: false };

    const course = await VideoCourseModel.findById(args.videoCourseId);
    if (
      !course ||
      course.status !== VideoCourseStatus.APPROVED ||
      course.accessType !== VideoCourseAccessType.MARKETPLACE_PAID
    ) {
      return { canPlay: false, canBuy: false };
    }
    // Grade match check (reuse the model helper).
    const grades = await VideoCourseGradeTargetModel.listForVideoCourse(
      args.videoCourseId
    );
    if (grades.length === 0) return { canPlay: false, canBuy: false };
    return { canPlay: false, canBuy: true };
  }
}

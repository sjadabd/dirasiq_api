// =============================================================================
// Teacher Invoice Service v2 — rebuilt 2026-05-17.
//
// What changed vs. v1:
//   • The 300-line monolithic `updateInvoice()` is gone. Replaced by two tiny
//     methods: `updateMeta()` (dates+notes) and `updateDiscount()` (set exact
//     discount). To change mode/amount/installments, soft-delete + recreate.
//   • `addPayment()` now supports PARTIAL payments. Previously the service
//     rejected anything that wasn't exactly the installment remainder, which
//     made the `partial` status enum dead code.
//   • `createInvoice()` supports auto-split installments: pass
//     `installmentsCount` + optional `installmentIntervalDays` (default 30)
//     + optional `installmentFirstDueDate` (default = dueDate or today+30),
//     and the service generates evenly-spaced rows. Manual `installments[]`
//     still works for irregular plans.
//   • `getInvoiceFull()` is the single read endpoint — replaces the v1 trio
//     (`/full` + `/installments` + `/entries/report`).
//   • Forces invoiceType = 'course' for everything created here. Reservation
//     deposits have their own table + endpoint and are not the concern of
//     this surface.
// =============================================================================

import pool from '../../config/database';
import { CourseInvoiceModel } from '../../models/course-invoice.model';
import { InvoiceInstallmentModel } from '../../models/invoice-installment.model';
import type { InvoiceStatus, PaymentMethod } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const toMoneyNum = (n: any): number => Number(Number(n ?? 0).toFixed(2));
const toDateOnly = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
};
const addDays = (base: Date, days: number): Date => {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

// Split `amount` into `n` parts so the sum equals exactly `amount` (cents-safe).
// Any rounding remainder is added to the LAST installment.
function splitAmount(amount: number, n: number): number[] {
  const cents = Math.round(amount * 100);
  const baseCents = Math.floor(cents / n);
  const remainder = cents - baseCents * n;
  const parts = new Array(n).fill(baseCents / 100);
  parts[n - 1] = (baseCents + remainder) / 100;
  return parts.map((p) => Number(p.toFixed(2)));
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------
export class TeacherInvoiceService {
  // ===========================================================================
  // CREATE
  // ===========================================================================
  static async createInvoice(opts: {
    teacherId: string;
    studentId: string;
    courseId: string;
    studyYear: string;
    paymentMode: 'cash' | 'installments';
    amountDue: number;
    discountAmount?: number;
    invoiceDate?: string | null;
    dueDate?: string | null;
    notes?: string | null;
    // Manual plan (irregular installments)
    installments?: Array<{ plannedAmount: number; dueDate: string; notes?: string }>;
    // Auto-split plan (preferred, simpler)
    installmentsCount?: number;
    installmentIntervalDays?: number;
    installmentFirstDueDate?: string;
  }) {
    const amountDue = toMoneyNum(opts.amountDue);
    const discount = toMoneyNum(opts.discountAmount || 0);

    if (amountDue <= 0) {
      throw new ApiError(400, 'المبلغ المستحق يجب أن يكون أكبر من صفر', ErrorCodes.VALIDATION_ERROR);
    }
    if (discount > amountDue) {
      throw new ApiError(400, 'الخصم لا يمكن أن يتجاوز المبلغ المستحق', ErrorCodes.VALIDATION_ERROR);
    }

    // One invoice per (student, course): block a second invoice for the same
    // student in the same course (ignores soft-deleted ones so a deleted
    // invoice can be re-issued).
    const dup = await pool.query(
      `SELECT id FROM course_invoices
        WHERE teacher_id = $1 AND student_id = $2 AND course_id = $3 AND deleted_at IS NULL
        LIMIT 1`,
      [opts.teacherId, opts.studentId, opts.courseId],
    );
    if (dup.rows.length > 0) {
      throw new ApiError(
        409,
        'يوجد فاتورة لهذا الطالب في هذا الكورس بالفعل',
        ErrorCodes.ALREADY_EXISTS,
      );
    }

    // 1. Create the base invoice (always type='course' — see header comment).
    const invoice = await CourseInvoiceModel.create({
      studentId: opts.studentId,
      teacherId: opts.teacherId,
      courseId: opts.courseId,
      studyYear: opts.studyYear,
      invoiceType: 'course' as any,
      paymentMode: opts.paymentMode,
      amountDue,
      invoiceDate: opts.invoiceDate || null,
      dueDate: opts.dueDate || null,
      notes: opts.notes || null,
    });

    // 2. Apply discount (if any) BEFORE installments / payments so the remaining
    //    target is consistent.
    if (discount > 0) {
      await CourseInvoiceModel.updateAggregates(invoice.id, { discountTotal: discount });
    }

    const targetCollect = toMoneyNum(amountDue - discount); // what we expect to collect

    // 3. Branch on paymentMode.
    if (opts.paymentMode === 'cash') {
      // Cash → fully paid immediately by convention. Skip installments table.
      if (targetCollect > 0) {
        await CourseInvoiceModel.updateAggregates(invoice.id, { amountPaid: targetCollect });
      }
      await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
      return await CourseInvoiceModel.findById(invoice.id);
    }

    // paymentMode === 'installments'
    let plan: Array<{ installmentNumber: number; plannedAmount: number; dueDate: string; notes?: string }>;

    if (opts.installments && opts.installments.length >= 2) {
      // Manual plan — validate the total matches targetCollect (or amountDue if
      // we want strict matching to the gross amount).
      const totalPlanned = opts.installments.reduce((s, i) => s + toMoneyNum(i.plannedAmount), 0);
      if (Math.abs(totalPlanned - targetCollect) > 0.01) {
        throw new ApiError(
          400,
          `إجمالي الأقساط (${totalPlanned}) لا يطابق المبلغ المستحق بعد الخصم (${targetCollect})`,
          ErrorCodes.VALIDATION_ERROR,
        );
      }
      plan = opts.installments.map((row, idx) => {
        const out: { installmentNumber: number; plannedAmount: number; dueDate: string; notes?: string } = {
          installmentNumber: idx + 1,
          plannedAmount: toMoneyNum(row.plannedAmount),
          dueDate: row.dueDate,
        };
        if (row.notes) out.notes = row.notes;
        return out;
      });
    } else if (opts.installmentsCount && opts.installmentsCount >= 2) {
      // Auto-split: even amounts, evenly-spaced dates.
      const n = Math.min(opts.installmentsCount, 36);
      const interval = opts.installmentIntervalDays || 30;
      const firstDueStr =
        opts.installmentFirstDueDate
        || opts.dueDate
        || toDateOnly(addDays(new Date(), interval));
      const firstDue = new Date((firstDueStr || '') + 'T00:00:00Z');
      const amounts = splitAmount(targetCollect, n);
      plan = amounts.map((amt, idx) => ({
        installmentNumber: idx + 1,
        plannedAmount: amt,
        dueDate: toDateOnly(addDays(firstDue, idx * interval)) as string,
      }));
    } else {
      throw new ApiError(
        400,
        'لخطة الأقساط: أعطِ installmentsCount أو installments[] (الحد الأدنى قسطان)',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    await InvoiceInstallmentModel.createMany(invoice.id, plan);
    await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
    return await CourseInvoiceModel.findById(invoice.id);
  }

  // ===========================================================================
  // ADD PAYMENT — partial-friendly
  // ===========================================================================
  static async addPayment(opts: {
    teacherId: string;
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    installmentId?: string | null;
    paidAt?: Date | null;
    notes?: string | null;
  }) {
    const inv = await this.getOwnedInvoice(opts.teacherId, opts.invoiceId);
    const amount = toMoneyNum(opts.amount);

    if (amount <= 0) {
      throw new ApiError(400, 'المبلغ يجب أن يكون أكبر من صفر', ErrorCodes.VALIDATION_ERROR);
    }

    // Compute invoice-level remaining (independent of installments — same
    // ceiling applies to both modes).
    const invRemaining = toMoneyNum(
      Number(inv.amount_due) - (Number(inv.discount_total) + Number(inv.amount_paid)),
    );
    if (amount > invRemaining) {
      throw new ApiError(
        400,
        `المبلغ (${amount}) يتجاوز المتبقّي على الفاتورة (${invRemaining})`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // Branch on whether a specific installment was targeted.
    if (opts.installmentId) {
      if (inv.payment_mode !== 'installments') {
        throw new ApiError(
          400,
          'لا يمكن استهداف قسط في فاتورة كاش',
          ErrorCodes.VALIDATION_ERROR,
        );
      }

      const instRes = await pool.query(
        'SELECT * FROM invoice_installments WHERE id = $1 AND invoice_id = $2 AND deleted_at IS NULL',
        [opts.installmentId, opts.invoiceId],
      );
      if (instRes.rows.length === 0) {
        throw new ApiError(404, 'القسط غير موجود', ErrorCodes.NOT_FOUND);
      }
      const inst = instRes.rows[0];
      const instRemaining = toMoneyNum(
        Number(inst.planned_amount) - Number(inst.paid_amount || 0),
      );
      if (amount > instRemaining) {
        throw new ApiError(
          400,
          `المبلغ (${amount}) يتجاوز المتبقّي على القسط (${instRemaining})`,
          ErrorCodes.VALIDATION_ERROR,
        );
      }

      // Apply to installment (model handles partial → status transition).
      await InvoiceInstallmentModel.addPayment(
        opts.installmentId,
        amount,
        opts.paidAt || undefined,
      );
    } else if (inv.payment_mode === 'installments') {
      // Distribute the payment across pending installments by due_date (oldest
      // first). Stops once the amount runs out. This is opt-in: pass NO
      // installmentId to let the server auto-allocate.
      let left = amount;
      const pendingRes = await pool.query(
        `SELECT id, planned_amount, paid_amount
           FROM invoice_installments
          WHERE invoice_id = $1 AND deleted_at IS NULL AND installment_status <> 'paid'
          ORDER BY due_date ASC, installment_number ASC`,
        [opts.invoiceId],
      );
      for (const row of pendingRes.rows) {
        if (left <= 0) break;
        const rem = toMoneyNum(Number(row.planned_amount) - Number(row.paid_amount || 0));
        if (rem <= 0) continue;
        const toApply = Math.min(left, rem);
        await InvoiceInstallmentModel.addPayment(row.id, toApply, opts.paidAt || undefined);
        left = toMoneyNum(left - toApply);
      }
      if (left > 0.005) {
        // Should never happen because invRemaining check upstream limits us,
        // but guard anyway.
        throw new ApiError(
          400,
          'لا توجد أقساط معلّقة كافية لاستيعاب الدفعة',
          ErrorCodes.VALIDATION_ERROR,
        );
      }
    }
    // (Cash mode with no installmentId → just bump the invoice aggregate.)

    // Update invoice-level aggregates + status.
    await CourseInvoiceModel.updateAggregates(opts.invoiceId, { amountPaid: amount });
    const updated = await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(opts.invoiceId);
    return updated;
  }

  // ===========================================================================
  // UPDATE META — dates + notes only
  // ===========================================================================
  static async updateMeta(opts: {
    teacherId: string;
    invoiceId: string;
    invoiceDate?: string | null;
    dueDate?: string | null;
    notes?: string | null;
  }) {
    await this.getOwnedInvoice(opts.teacherId, opts.invoiceId);

    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (opts.invoiceDate !== undefined) {
      sets.push(`invoice_date = $${i++}`);
      params.push(opts.invoiceDate);
    }
    if (opts.dueDate !== undefined) {
      sets.push(`due_date = $${i++}`);
      params.push(opts.dueDate);
    }
    if (opts.notes !== undefined) {
      sets.push(`notes = $${i++}`);
      params.push(opts.notes);
    }
    if (!sets.length) {
      throw new ApiError(400, 'لا يوجد حقول للتحديث', ErrorCodes.VALIDATION_ERROR);
    }
    sets.push(`updated_at = NOW()`);
    params.push(opts.invoiceId);

    await pool.query(
      `UPDATE course_invoices SET ${sets.join(', ')} WHERE id = $${i}`,
      params,
    );
    return await CourseInvoiceModel.findById(opts.invoiceId);
  }

  // ===========================================================================
  // UPDATE DISCOUNT — set to an exact value
  // ===========================================================================
  static async updateDiscount(opts: {
    teacherId: string;
    invoiceId: string;
    discountAmount: number;
  }) {
    const inv = await this.getOwnedInvoice(opts.teacherId, opts.invoiceId);
    const target = toMoneyNum(opts.discountAmount);
    if (target < 0) {
      throw new ApiError(400, 'الخصم لا يمكن أن يكون سالباً', ErrorCodes.VALIDATION_ERROR);
    }
    const maxAllowed = toMoneyNum(Number(inv.amount_due) - Number(inv.amount_paid));
    if (target > maxAllowed) {
      throw new ApiError(
        400,
        `الخصم (${target}) لا يمكن أن يتجاوز المتبقّي بعد المدفوع (${maxAllowed})`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    // Calculate the delta so we can reuse the additive `updateAggregates`.
    const currentDiscount = toMoneyNum(inv.discount_total);
    const delta = toMoneyNum(target - currentDiscount);
    if (delta !== 0) {
      await CourseInvoiceModel.updateAggregates(opts.invoiceId, { discountTotal: delta });
    }
    const updated = await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(opts.invoiceId);
    return updated;
  }

  // ===========================================================================
  // LIST
  // ===========================================================================
  static async listTeacherInvoices(opts: {
    teacherId: string;
    studyYear: string;
    status?: InvoiceStatus;
    studentId?: string;
    courseId?: string;
    paymentMode?: 'cash' | 'installments';
    deleted?: 'true' | 'false' | 'all';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const whereCount: string[] = ['teacher_id = $1', 'study_year = $2'];
    const whereData: string[] = ['ci.teacher_id = $1', 'ci.study_year = $2'];
    const params: any[] = [opts.teacherId, opts.studyYear];
    let i = 3;

    if (opts.status) {
      whereCount.push(`invoice_status = $${i}`);
      whereData.push(`ci.invoice_status = $${i}`);
      params.push(opts.status);
      i++;
    }
    if (opts.studentId) {
      whereCount.push(`student_id = $${i}`);
      whereData.push(`ci.student_id = $${i}`);
      params.push(opts.studentId);
      i++;
    }
    if (opts.courseId) {
      whereCount.push(`course_id = $${i}`);
      whereData.push(`ci.course_id = $${i}`);
      params.push(opts.courseId);
      i++;
    }
    if (opts.paymentMode) {
      whereCount.push(`payment_mode = $${i}`);
      whereData.push(`ci.payment_mode = $${i}`);
      params.push(opts.paymentMode);
      i++;
    }
    if (opts.deleted === 'true') {
      whereCount.push('deleted_at IS NOT NULL');
      whereData.push('ci.deleted_at IS NOT NULL');
    } else if (opts.deleted !== 'all') {
      whereCount.push('deleted_at IS NULL');
      whereData.push('ci.deleted_at IS NULL');
    }
    // Free-text search is applied AFTER the count query because it needs the
    // JOIN to `users` for student name + `courses` for course name. The count
    // for a search query is approximate (matches the filtered page only).
    let searchClause = '';
    if (opts.search && opts.search.trim()) {
      searchClause = ` AND (u.name ILIKE $${i} OR c.course_name ILIKE $${i})`;
      params.push(`%${opts.search.trim()}%`);
      i++;
    }

    const countQ = opts.search
      ? `SELECT COUNT(*)::int AS cnt FROM course_invoices ci
         JOIN users u ON u.id = ci.student_id
         JOIN courses c ON c.id = ci.course_id
         WHERE ${whereData.join(' AND ')}${searchClause}`
      : `SELECT COUNT(*)::int AS cnt FROM course_invoices WHERE ${whereCount.join(' AND ')}`;
    const countR = await pool.query(countQ, params);
    const total: number = countR.rows[0]?.cnt || 0;

    const pageNum = Math.max(Number(opts.page || 1), 1);
    const limitNum = Math.max(Number(opts.limit || 10), 1);
    const offset = (pageNum - 1) * limitNum;

    const dataQ = `
      SELECT
        ci.*,
        u.name AS student_name,
        c.course_name,
        g.name AS grade_name,
        s.name AS subject_name
      FROM course_invoices ci
      JOIN users u ON u.id = ci.student_id AND u.user_type = 'student'
      JOIN courses c ON c.id = ci.course_id
      LEFT JOIN grades g ON g.id = c.grade_id
      LEFT JOIN subjects s ON s.id = c.subject_id
      WHERE ${whereData.join(' AND ')}${searchClause}
      ORDER BY ci.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const dataR = await pool.query(dataQ, [...params, limitNum, offset]);
    return { items: dataR.rows, total };
  }

  // ===========================================================================
  // SUMMARY (KPIs)
  // ===========================================================================
  static async getSummary(opts: {
    teacherId: string;
    studyYear: string;
    status?: InvoiceStatus;
    deleted?: 'true' | 'false' | 'all';
  }) {
    const where: string[] = ['teacher_id = $1', 'study_year = $2'];
    const params: any[] = [opts.teacherId, opts.studyYear];
    let i = 3;
    if (opts.status) {
      where.push(`invoice_status = $${i++}`);
      params.push(opts.status);
    }
    if (opts.deleted === 'true') where.push('deleted_at IS NOT NULL');
    else if (opts.deleted !== 'all') where.push('deleted_at IS NULL');

    const q = `
      SELECT
        COALESCE(SUM(amount_due), 0)                                                  AS total_amount_due,
        COALESCE(SUM(amount_paid), 0)                                                 AS total_amount_paid,
        COALESCE(SUM(discount_total), 0)                                              AS total_discount,
        COALESCE(SUM(remaining_amount), 0)                                            AS total_remaining,
        COUNT(*)::int                                                                 AS total_count,
        SUM(CASE WHEN invoice_status = 'paid' THEN 1 ELSE 0 END)::int                 AS paid_count,
        SUM(CASE WHEN invoice_status = 'partial' THEN 1 ELSE 0 END)::int              AS partial_count,
        SUM(CASE WHEN invoice_status = 'pending' THEN 1 ELSE 0 END)::int              AS pending_count,
        SUM(CASE WHEN invoice_status = 'overdue' THEN 1 ELSE 0 END)::int              AS overdue_count,
        SUM(CASE WHEN discount_total > 0 THEN 1 ELSE 0 END)::int                      AS discount_count
      FROM course_invoices
      WHERE ${where.join(' AND ')}
    `;
    const r = await pool.query(q, params);
    const row = r.rows[0] || {};
    return {
      totalAmount: toMoneyNum(row.total_amount_due),
      totalPaid: toMoneyNum(row.total_amount_paid),
      totalDiscount: toMoneyNum(row.total_discount),
      totalRemaining: toMoneyNum(row.total_remaining),
      totalCount: Number(row.total_count) || 0,
      paidCount: Number(row.paid_count) || 0,
      partialCount: Number(row.partial_count) || 0,
      pendingCount: Number(row.pending_count) || 0,
      overdueCount: Number(row.overdue_count) || 0,
      discountCount: Number(row.discount_count) || 0,
    };
  }

  // ===========================================================================
  // GET FULL — single endpoint for invoice + installments + computed totals
  // ===========================================================================
  // ===========================================================================
  // UPDATE FULL — replace amount/discount/dates/notes/mode + regenerate plan.
  // Only allowed before any payment has been collected.
  // ===========================================================================
  static async updateInvoiceFull(opts: {
    teacherId: string;
    invoiceId: string;
    paymentMode: 'cash' | 'installments';
    amountDue: number;
    discountAmount?: number;
    invoiceDate?: string | null;
    dueDate?: string | null;
    notes?: string | null;
    installments?: Array<{ plannedAmount: number; dueDate: string; notes?: string }>;
    installmentsCount?: number;
    installmentIntervalDays?: number;
    installmentFirstDueDate?: string;
  }) {
    const inv = await this.getOwnedInvoice(opts.teacherId, opts.invoiceId);

    // Editing the plan after collection started would corrupt payment allocation.
    if (toMoneyNum(inv.amount_paid) > 0) {
      throw new ApiError(
        400,
        'لا يمكن تعديل فاتورة بدأ تحصيل دفعات منها. استخدم تسجيل الدفعات بدلاً من التعديل.',
        ErrorCodes.BUSINESS_RULE,
      );
    }

    const amountDue = toMoneyNum(opts.amountDue);
    const discount = toMoneyNum(opts.discountAmount || 0);
    if (amountDue <= 0) {
      throw new ApiError(400, 'المبلغ المستحق يجب أن يكون أكبر من صفر', ErrorCodes.VALIDATION_ERROR);
    }
    if (discount > amountDue) {
      throw new ApiError(400, 'الخصم لا يمكن أن يتجاوز المبلغ المستحق', ErrorCodes.VALIDATION_ERROR);
    }
    const targetCollect = toMoneyNum(amountDue - discount);

    // Build the installment plan (same rules as create).
    let plan: Array<{ installmentNumber: number; plannedAmount: number; dueDate: string; notes?: string }> = [];
    if (opts.paymentMode === 'installments') {
      if (opts.installments && opts.installments.length >= 2) {
        const totalPlanned = opts.installments.reduce((s, it) => s + toMoneyNum(it.plannedAmount), 0);
        if (Math.abs(totalPlanned - targetCollect) > 0.01) {
          throw new ApiError(
            400,
            `إجمالي الأقساط (${totalPlanned}) لا يطابق المبلغ المستحق بعد الخصم (${targetCollect})`,
            ErrorCodes.VALIDATION_ERROR,
          );
        }
        plan = opts.installments.map((row, idx) => {
          const out: { installmentNumber: number; plannedAmount: number; dueDate: string; notes?: string } = {
            installmentNumber: idx + 1,
            plannedAmount: toMoneyNum(row.plannedAmount),
            dueDate: row.dueDate,
          };
          if (row.notes) out.notes = row.notes;
          return out;
        });
      } else if (opts.installmentsCount && opts.installmentsCount >= 2) {
        const n = Math.min(opts.installmentsCount, 36);
        const interval = opts.installmentIntervalDays || 30;
        const firstDueStr =
          opts.installmentFirstDueDate || opts.dueDate || toDateOnly(addDays(new Date(), interval));
        const firstDue = new Date((firstDueStr || '') + 'T00:00:00Z');
        const amounts = splitAmount(targetCollect, n);
        plan = amounts.map((amt, idx) => ({
          installmentNumber: idx + 1,
          plannedAmount: amt,
          dueDate: toDateOnly(addDays(firstDue, idx * interval)) as string,
        }));
      } else {
        throw new ApiError(
          400,
          'لخطة الأقساط: أعطِ installmentsCount أو installments[] (الحد الأدنى قسطان)',
          ErrorCodes.VALIDATION_ERROR,
        );
      }
    }

    const isCash = opts.paymentMode === 'cash';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE course_invoices SET
           payment_mode  = $1,
           amount_due    = $2,
           discount_total = $3,
           amount_paid   = $4,
           invoice_date  = COALESCE($5::date, invoice_date),
           due_date      = $6::date,
           notes         = $7,
           invoice_status = $8,
           paid_date     = $9,
           updated_at    = NOW()
         WHERE id = $10`,
        [
          opts.paymentMode,
          amountDue,
          discount,
          isCash ? targetCollect : 0,
          opts.invoiceDate || null,
          opts.dueDate || null,
          opts.notes ?? null,
          isCash ? 'paid' : 'pending',
          isCash ? new Date() : null,
          opts.invoiceId,
        ],
      );
      // Regenerate the installment rows from scratch.
      await client.query('DELETE FROM invoice_installments WHERE invoice_id = $1', [opts.invoiceId]);
      for (const p of plan) {
        await client.query(
          `INSERT INTO invoice_installments (invoice_id, installment_number, planned_amount, due_date, notes)
           VALUES ($1, $2, $3, $4::date, $5)`,
          [opts.invoiceId, p.installmentNumber, p.plannedAmount, p.dueDate, p.notes || null],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return await CourseInvoiceModel.findById(opts.invoiceId);
  }

  static async getInvoiceFull(teacherId: string, invoiceId: string) {
    const invoice = await this.getOwnedInvoice(teacherId, invoiceId);
    // Enrich with student + course names (the bare invoice row has only ids).
    const named = await pool.query(
      `SELECT u.name AS student_name, c.course_name
         FROM course_invoices ci
         JOIN users u   ON u.id = ci.student_id
         JOIN courses c ON c.id = ci.course_id
        WHERE ci.id = $1`,
      [invoiceId],
    );
    if (named.rows[0]) {
      (invoice as any).student_name = named.rows[0].student_name;
      (invoice as any).course_name = named.rows[0].course_name;
    }
    const installments = (await InvoiceInstallmentModel.listByInvoice(invoiceId)) || [];
    const todayStr = toDateOnly(new Date()) as string;

    const totals = {
      count: installments.length,
      paidCount: installments.filter((i) => String(i.installment_status) === 'paid').length,
      partialCount: installments.filter((i) => String(i.installment_status) === 'partial').length,
      pendingCount: installments.filter((i) => String(i.installment_status) === 'pending').length,
      overdueCount: installments.filter(
        (i) => String(i.installment_status) !== 'paid'
          && (toDateOnly(i.due_date) || '') < todayStr,
      ).length,
      plannedTotal: toMoneyNum(
        installments.reduce((s, i) => s + Number(i.planned_amount || 0), 0),
      ),
      paidTotal: toMoneyNum(installments.reduce((s, i) => s + Number(i.paid_amount || 0), 0)),
      remainingTotal: toMoneyNum(
        installments.reduce((s, i) => s + Number(i.remaining_amount || 0), 0),
      ),
    };

    return { invoice, installments, totals };
  }

  // ===========================================================================
  // SOFT DELETE / RESTORE
  // ===========================================================================
  static async softDelete(teacherId: string, invoiceId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invRes = await client.query(
        'SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL',
        [invoiceId, teacherId],
      );
      if (invRes.rows.length === 0) {
        throw new ApiError(404, 'الفاتورة غير موجودة أو محذوفة سابقاً', ErrorCodes.NOT_FOUND);
      }
      await client.query(
        'UPDATE invoice_installments SET deleted_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL',
        [invoiceId],
      );
      await client.query(
        'UPDATE course_invoices SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
        [invoiceId],
      );
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async restore(teacherId: string, invoiceId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invRes = await client.query(
        'SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2',
        [invoiceId, teacherId],
      );
      if (invRes.rows.length === 0) {
        throw new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
      }
      await client.query(
        'UPDATE course_invoices SET deleted_at = NULL, updated_at = NOW() WHERE id = $1',
        [invoiceId],
      );
      await client.query(
        'UPDATE invoice_installments SET deleted_at = NULL WHERE invoice_id = $1',
        [invoiceId],
      );
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // Ownership helper — single source of truth for "this teacher owns this invoice".
  // ===========================================================================
  static async getOwnedInvoice(teacherId: string, invoiceId: string) {
    const inv = await CourseInvoiceModel.findById(invoiceId);
    if (!inv || String(inv.teacher_id) !== String(teacherId)) {
      throw new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    return inv;
  }

  // Backwards-compat thin wrappers (in case other modules import these names).
  static async getInvoiceForTeacher(teacherId: string, invoiceId: string) {
    const inv = await CourseInvoiceModel.findById(invoiceId);
    if (!inv || String(inv.teacher_id) !== String(teacherId)) return null;
    return inv;
  }
  static async listInstallmentsByInvoice(teacherId: string, invoiceId: string) {
    const inv = await this.getInvoiceForTeacher(teacherId, invoiceId);
    if (!inv) return null;
    return await InvoiceInstallmentModel.listByInvoice(invoiceId);
  }
}

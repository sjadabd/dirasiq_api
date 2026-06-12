// =============================================================================
// Teacher Invoice Controller v2 — rebuilt 2026-05-17.
//
// Surface:
//   POST   /                      create (cash OR installments)
//   GET    /                      list (filters: status, studentId, courseId,
//                                       paymentMode, search, deleted, page, limit)
//   GET    /summary               KPIs (totals + counts by status)
//   GET    /:invoiceId            single + installments + computed totals
//   POST   /:invoiceId/payments   add payment (partial-friendly, auto-allocates
//                                              across installments if no id)
//   PATCH  /:invoiceId/meta       update dates + notes
//   PATCH  /:invoiceId/discount   set exact discount amount
//   DELETE /:invoiceId            soft delete (cascades to installments)
//   PATCH  /:invoiceId/restore    restore soft-deleted invoice + installments
// =============================================================================

import type { Request, Response } from 'express';

import { NotificationType, RecipientType } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';
import { TeacherInvoiceService } from '../../services/teacher/invoice.service';
import type { InvoiceStatus, PaymentMethod } from '../../types';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

// ---- Formatting helpers (shape unchanged from v1 for frontend compatibility) -
const toDateOnly = (d: any): string | null => {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
};
const toMoneyStr = (n: any): string => Number(n ?? 0).toFixed(2);
// Human-facing money in notification text: thousands separators, no decimals.
const moneyText = (n: any): string =>
  Math.round(Number(n ?? 0)).toLocaleString('en-US');
const toIso = (d: any): string | null => (d ? new Date(d).toISOString() : null);

const formatInvoice = (inv: any): any => {
  if (!inv) return inv;
  return {
    ...inv,
    invoice_date: toDateOnly(inv.invoice_date),
    due_date: toDateOnly(inv.due_date),
    paid_date: toDateOnly(inv.paid_date),
  };
};

const formatInstallment = (inst: any): any => ({
  id: inst.id,
  invoice_id: inst.invoice_id,
  installment_number: inst.installment_number,
  planned_amount: toMoneyStr(inst.planned_amount),
  paid_amount: toMoneyStr(inst.paid_amount),
  remaining_amount: toMoneyStr(inst.remaining_amount),
  installment_status: inst.installment_status,
  is_paid: String(inst.installment_status) === 'paid',
  due_date: toDateOnly(inst.due_date),
  paid_date: toDateOnly(inst.paid_date),
  notes: inst.notes || null,
  created_at: toIso(inst.created_at),
  updated_at: toIso(inst.updated_at),
  deleted_at: inst.deleted_at ? toIso(inst.deleted_at) : null,
});

// ---- Fire-and-forget notification helpers ----------------------------------
async function notifyStudent(
  req: Request,
  args: {
    studentId: string;
    title: string;
    message: string;
    subType: string;
    data?: Record<string, any>;
    createdBy: string;
  },
): Promise<void> {
  try {
    const notif = req.app.get('notificationService') as NotificationService | undefined;
    if (!notif || !args.studentId) return;
    await notif.createAndSendNotification({
      title: args.title,
      message: args.message,
      type: NotificationType.PAYMENT_REMINDER,
      recipientType: RecipientType.SPECIFIC_STUDENTS,
      recipientIds: [args.studentId],
      data: { ...(args.data || {}), subType: args.subType },
      createdBy: args.createdBy,
    });
  } catch (err) {
    req.log?.warn({ err }, 'invoice notification failed');
  }
}

// =============================================================================
export class TeacherInvoiceController {
  // ---------------------------------------------------------------------------
  // POST /teacher/invoices
  // ---------------------------------------------------------------------------
  static async createInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const body = req.body as Record<string, any>;

    const createOpts: any = {
      teacherId,
      studentId: body['studentId'],
      courseId: body['courseId'],
      studyYear: body['studyYear'],
      paymentMode: body['paymentMode'],
      amountDue: Number(body['amountDue']),
      discountAmount: body['discountAmount'] != null ? Number(body['discountAmount']) : 0,
      invoiceDate: toDateOnly(body['invoiceDate']),
      dueDate: toDateOnly(body['dueDate']),
      notes: body['notes'] || null,
    };
    if (Array.isArray(body['installments']) && body['installments'].length) {
      createOpts.installments = body['installments'].map((it: any) => {
        const row: any = {
          plannedAmount: Number(it.plannedAmount),
          dueDate: String(toDateOnly(it.dueDate)),
        };
        if (it.notes) row.notes = String(it.notes);
        return row;
      });
    }
    if (body['installmentsCount'] != null) {
      createOpts.installmentsCount = Number(body['installmentsCount']);
    }
    if (body['installmentIntervalDays'] != null) {
      createOpts.installmentIntervalDays = Number(body['installmentIntervalDays']);
    }
    if (body['installmentFirstDueDate']) {
      createOpts.installmentFirstDueDate = String(toDateOnly(body['installmentFirstDueDate']));
    }
    const invoice = await TeacherInvoiceService.createInvoice(createOpts);

    // Best-effort student notification.
    await notifyStudent(req, {
      studentId: body['studentId'],
      title: 'فاتورة جديدة',
      message: `تم إنشاء فاتورة جديدة بمبلغ ${moneyText(invoice?.amount_due)} د.ع`,
      subType: 'invoice_created',
      data: {
        studyYear: body['studyYear'],
        invoiceId: invoice?.id,
        courseId: body['courseId'],
      },
      createdBy: teacherId,
    });

    res.status(201).json(ok(formatInvoice(invoice), 'تم إنشاء الفاتورة'));
  }

  // ---------------------------------------------------------------------------
  // GET /teacher/invoices
  // ---------------------------------------------------------------------------
  static async listInvoices(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      studyYear: string;
      status?: InvoiceStatus;
      studentId?: string;
      courseId?: string;
      paymentMode?: 'cash' | 'installments';
      deleted?: 'true' | 'false' | 'all';
      search?: string;
      page?: number;
      limit?: number;
    };
    const { page, limit } = parsePagination(query);

    const { items, total } = await TeacherInvoiceService.listTeacherInvoices({
      teacherId,
      studyYear: query.studyYear,
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.paymentMode ? { paymentMode: query.paymentMode } : {}),
      ...(query.deleted ? { deleted: query.deleted } : {}),
      ...(query.search ? { search: query.search } : {}),
      page,
      limit,
    });

    const data = items.map((inv: any) => ({
      ...formatInvoice(inv),
      is_deleted: !!inv.deleted_at,
    }));
    res.status(200).json(paginated(data, buildPaginationMeta(total, page, limit), 'تم جلب الفواتير'));
  }

  // ---------------------------------------------------------------------------
  // GET /teacher/invoices/summary
  // ---------------------------------------------------------------------------
  static async invoicesSummary(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      studyYear: string;
      status?: InvoiceStatus;
      deleted?: 'true' | 'false' | 'all';
    };
    const summary = await TeacherInvoiceService.getSummary({
      teacherId,
      studyYear: query.studyYear,
      ...(query.status ? { status: query.status } : {}),
      ...(query.deleted ? { deleted: query.deleted } : {}),
    });
    res.status(200).json(ok(summary, 'ملخص الفواتير'));
  }

  // ---------------------------------------------------------------------------
  // GET /teacher/invoices/:invoiceId  (replaces /full + /installments + /entries/report)
  // ---------------------------------------------------------------------------
  static async getInvoiceFull(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };

    const { invoice, installments, totals } = await TeacherInvoiceService.getInvoiceFull(
      teacherId,
      invoiceId,
    );
    res.status(200).json(
      ok(
        {
          invoice: formatInvoice(invoice),
          installments: installments.map(formatInstallment),
          totals,
        },
        'تفاصيل الفاتورة كاملة',
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // POST /teacher/invoices/:invoiceId/payments  (supports partial)
  // ---------------------------------------------------------------------------
  static async addPayment(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;

    const updated = await TeacherInvoiceService.addPayment({
      teacherId,
      invoiceId,
      amount: Number(body['amount']),
      paymentMethod: body['paymentMethod'] as PaymentMethod,
      installmentId: body['installmentId'] || null,
      paidAt: body['paidAt'] ? new Date(body['paidAt']) : new Date(),
      notes: body['notes'] || null,
    });

    const remaining = Number((updated as any)?.remaining_amount || 0);
    const fullyPaid = remaining <= 0;
    const inv = updated as any;
    await notifyStudent(req, {
      studentId: inv?.student_id,
      title: fullyPaid ? 'تم سداد الفاتورة كاملة' : 'تم تسجيل دفعة',
      message: fullyPaid
        ? `تم سداد فاتورتك بالكامل. مبلغ الدفعة: ${moneyText(body['amount'])} د.ع`
        : `تم تسجيل دفعة بمبلغ ${moneyText(body['amount'])} د.ع. المتبقّي على فاتورتك: ${moneyText(remaining)} د.ع`,
      subType: 'invoice_paid',
      data: {
        invoiceId,
        amount: Number(body['amount']),
        remaining,
        fullPaid: fullyPaid,
        ...(body['installmentId'] ? { installmentId: body['installmentId'] } : {}),
      },
      createdBy: teacherId,
    });

    res.status(200).json(ok(formatInvoice(updated), 'تم تسجيل الدفعة'));
  }

  // ---------------------------------------------------------------------------
  // PATCH /teacher/invoices/:invoiceId/meta  (dates + notes)
  // ---------------------------------------------------------------------------
  static async updateMeta(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;

    const updated = await TeacherInvoiceService.updateMeta({
      teacherId,
      invoiceId,
      ...(body['invoiceDate'] !== undefined ? { invoiceDate: toDateOnly(body['invoiceDate']) } : {}),
      ...(body['dueDate'] !== undefined ? { dueDate: toDateOnly(body['dueDate']) } : {}),
      ...(body['notes'] !== undefined ? { notes: body['notes'] } : {}),
    });
    res.status(200).json(ok(formatInvoice(updated), 'تم تحديث الفاتورة'));
  }

  // ---------------------------------------------------------------------------
  // PATCH /teacher/invoices/:invoiceId/discount  (set exact discount)
  // ---------------------------------------------------------------------------
  static async updateDiscount(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;

    const updated = await TeacherInvoiceService.updateDiscount({
      teacherId,
      invoiceId,
      discountAmount: Number(body['discountAmount']),
    });

    await notifyStudent(req, {
      studentId: (updated as any)?.student_id,
      title: 'تحديث خصم الفاتورة',
      message: `تم ضبط الخصم على ${moneyText(body['discountAmount'])} د.ع`,
      subType: 'invoice_discount',
      data: { invoiceId, amount: Number(body['discountAmount']) },
      createdBy: teacherId,
    });

    res.status(200).json(ok(formatInvoice(updated), 'تم تحديث الخصم'));
  }

  // ---------------------------------------------------------------------------
  // PUT /teacher/invoices/:invoiceId  (full edit — regenerates installments)
  // ---------------------------------------------------------------------------
  static async updateInvoiceFull(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;

    const opts: any = {
      teacherId,
      invoiceId,
      paymentMode: body['paymentMode'],
      amountDue: Number(body['amountDue']),
      discountAmount: body['discountAmount'] != null ? Number(body['discountAmount']) : 0,
      invoiceDate: toDateOnly(body['invoiceDate']),
      dueDate: toDateOnly(body['dueDate']),
      notes: body['notes'] ?? null,
    };
    if (Array.isArray(body['installments']) && body['installments'].length) {
      opts.installments = body['installments'].map((it: any) => {
        const row: any = {
          plannedAmount: Number(it.plannedAmount),
          dueDate: String(toDateOnly(it.dueDate)),
        };
        if (it.notes) row.notes = String(it.notes);
        return row;
      });
    }
    if (body['installmentsCount'] != null) {
      opts.installmentsCount = Number(body['installmentsCount']);
    }
    if (body['installmentIntervalDays'] != null) {
      opts.installmentIntervalDays = Number(body['installmentIntervalDays']);
    }
    if (body['installmentFirstDueDate']) {
      opts.installmentFirstDueDate = String(toDateOnly(body['installmentFirstDueDate']));
    }

    const invoice = await TeacherInvoiceService.updateInvoiceFull(opts);

    await notifyStudent(req, {
      studentId: (invoice as any)?.student_id,
      title: 'تم تعديل فاتورتك',
      message: `تم تعديل فاتورتك. المبلغ المستحق: ${moneyText((invoice as any)?.amount_due)} د.ع`,
      subType: 'invoice_updated',
      data: {
        invoiceId,
        studyYear: (invoice as any)?.study_year,
        courseId: (invoice as any)?.course_id,
      },
      createdBy: teacherId,
    });

    res.status(200).json(ok(formatInvoice(invoice), 'تم تعديل الفاتورة'));
  }

  // ---------------------------------------------------------------------------
  // DELETE /teacher/invoices/:invoiceId
  // ---------------------------------------------------------------------------
  static async softDeleteInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    await TeacherInvoiceService.softDelete(teacherId, invoiceId);
    res.status(200).json(ok(null, 'تم حذف الفاتورة'));
  }

  // ---------------------------------------------------------------------------
  // PATCH /teacher/invoices/:invoiceId/restore
  // ---------------------------------------------------------------------------
  static async restoreInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    await TeacherInvoiceService.restore(teacherId, invoiceId);
    res.status(200).json(ok(null, 'تم استرجاع الفاتورة'));
  }
}

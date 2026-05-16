import type { Request, Response } from 'express';

import { InvoiceInstallmentModel } from '../../models/invoice-installment.model';
import { NotificationType, RecipientType } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';
import { TeacherInvoiceService } from '../../services/teacher/invoice.service';
import { type InvoiceStatus, type InvoiceType, type PaymentMethod } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

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
const toMoneyNum = (n: any): number => Number(Number(n ?? 0).toFixed(2));
const toIso = (d: any): string | null => (d ? new Date(d).toISOString() : null);

const formatInvoiceDates = <T extends { invoice_date?: any; due_date?: any; paid_date?: any }>(
  inv: T | null
): T | null =>
  inv
    ? ({
        ...(inv as any),
        invoice_date: toDateOnly(inv.invoice_date),
        due_date: toDateOnly(inv.due_date),
        paid_date: toDateOnly(inv.paid_date),
      } as T)
    : inv;

const mapServiceMutationError = (err: unknown): ApiError => {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (message === 'Forbidden') {
    return new ApiError(403, 'الوصول مرفوض', ErrorCodes.FORBIDDEN);
  }
  if (message.includes('not found')) {
    return new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
  }
  return new ApiError(400, message || 'فشل تحديث الفاتورة', ErrorCodes.INVALID_REQUEST);
};

const buildInstallmentUpdates = (raw: any[]): any[] =>
  raw.map((it: any) => {
    const base: any = {
      installmentNumber: Number(it.installmentNumber),
      plannedAmount: Number(it.plannedAmount),
      dueDate: String(toDateOnly(it.dueDate)),
    };

    if (it.id != null) base.id = String(it.id);
    if (it.notes !== undefined) base.notes = it.notes != null ? String(it.notes) : null;
    if (it.paidAmount != null) base.paidAmount = Math.max(Number(it.paidAmount || 0), 0);
    if (it.paidDate !== undefined) base.paidDate = it.paidDate ? String(toDateOnly(it.paidDate)) : null;

    if (it.is_paid !== undefined) {
      const isPaid = Boolean(it.is_paid);
      if (isPaid) {
        base.status = 'paid';
        base.paidAmount = Math.max(Number(base.plannedAmount || 0), 0);
      } else {
        base.status = 'pending';
        base.paidAmount = 0;
        base.paidDate = null;
      }
    } else if (it.status !== undefined) {
      base.status = String(it.status);
    } else if (base.paidAmount !== undefined) {
      base.status =
        base.paidAmount > 0
          ? base.paidAmount >= base.plannedAmount
            ? 'paid'
            : 'partial'
          : 'pending';
    }

    return base;
  });

export class TeacherInvoiceController {
  // PATCH /teacher/invoices/:invoiceId
  static async updateInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;

    const updates: any = {};
    if (body['dueDate'] !== undefined) updates.dueDate = toDateOnly(body['dueDate']);
    if (body['notes'] !== undefined) updates.notes = body['notes'] || null;
    if (body['invoiceType'] !== undefined) updates.invoiceType = body['invoiceType'] as InvoiceType;
    if (body['paymentMode'] !== undefined) updates.paymentMode = body['paymentMode'];
    if (body['amountDue'] !== undefined) updates.amountDue = Number(body['amountDue']);
    if (body['studentId'] !== undefined) updates.studentId = String(body['studentId']);
    if (body['invoiceDate'] !== undefined) updates.invoiceDate = toDateOnly(body['invoiceDate']);
    if (body['discountAmount'] !== undefined) {
      updates.discountAmount = Math.max(Number(body['discountAmount'] || 0), 0);
    }
    if (Array.isArray(body['installments'])) {
      updates.installments = buildInstallmentUpdates(body['installments']);
    }
    if (Array.isArray(body['removeInstallmentIds'])) {
      updates.removeInstallmentIds = body['removeInstallmentIds'].map((x: any) => String(x));
    }

    try {
      const updated = await TeacherInvoiceService.updateInvoice(teacherId, invoiceId, updates);
      res.status(200).json(ok(formatInvoiceDates(updated as any), 'تم تحديث الفاتورة'));
    } catch (err) {
      throw mapServiceMutationError(err);
    }
  }

  // POST /teacher/invoices
  static async createInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const body = req.body as Record<string, any>;

    const createOptions: any = {
      teacherId,
      studentId: body['studentId'],
      courseId: body['courseId'],
      studyYear: body['studyYear'],
      invoiceType: (body['invoiceType'] ?? 'course') as InvoiceType,
      paymentMode: body['paymentMode'],
      amountDue: Number(body['amountDue']),
      invoiceDate: toDateOnly(body['invoiceDate']),
      dueDate: toDateOnly(body['dueDate']),
      notes: body['notes'] || null,
      installments: Array.isArray(body['installments'])
        ? body['installments'].map((it: any) => ({
            ...it,
            dueDate: String(toDateOnly(it.dueDate)),
            ...(it.paidDate !== undefined ? { paidDate: toDateOnly(it.paidDate) } : {}),
          }))
        : undefined,
    };
    if (body['discountAmount'] != null) {
      createOptions.discountAmount = Number(body['discountAmount']);
    }

    const invoice = await TeacherInvoiceService.createInvoice(createOptions);

    try {
      const notif = req.app.get('notificationService') as NotificationService;
      if (notif) {
        await notif.createAndSendNotification({
          title: 'فاتورة جديدة',
          message: `تم إنشاء فاتورة جديدة بمبلغ ${invoice?.amount_due} دينار`,
          type: NotificationType.PAYMENT_REMINDER,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: [body['studentId']],
          data: {
            studyYear: body['studyYear'],
            invoiceId: invoice?.id,
            courseId: body['courseId'],
            subType: 'invoice_created',
          },
          createdBy: teacherId,
        });
      }
    } catch (err) {
      req.log?.warn({ err }, 'invoice create notification failed');
    }

    res.status(201).json(ok(formatInvoiceDates(invoice as any), 'تم إنشاء الفاتورة'));
  }

  // POST /teacher/invoices/:invoiceId/payments
  static async addPayment(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;

    const updated = await TeacherInvoiceService.addPayment({
      invoiceId,
      amount: Number(body['amount']),
      paymentMethod: body['paymentMethod'] as PaymentMethod,
      installmentId: body['installmentId'] || null,
      paidAt: body['paidAt'] ? new Date(body['paidAt']) : new Date(),
      notes: body['notes'] || null,
    });

    try {
      const inv = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
      const studentIdFinal = body['studentId'] || (inv && (inv as any).student_id);
      const courseIdFinal = body['courseId'] || (inv && (inv as any).course_id);
      const studyYearFinal = body['studyYear'] || (inv && (inv as any).study_year);
      if (studentIdFinal) {
        const notif = req.app.get('notificationService') as NotificationService;
        if (notif) {
          const rem = Number((updated as any)?.remaining_amount || 0);
          const paid = Number(body['amount']);
          const full = rem <= 0;
          const title = full ? 'تم سداد الفاتورة كاملة' : 'تم تسجيل دفعة';
          let msg = full
            ? `تم سداد فاتورتك بالكامل. قيمة الدفعة: ${paid} دينار`
            : `تم تسجيل دفعة بمبلغ ${paid} دينار. المتبقي على فاتورتك: ${rem} دينار`;
          let instInfo: { installmentNumber?: number; dueDate?: string } = {};
          if (body['installmentId']) {
            const inst = await InvoiceInstallmentModel.listByInvoice(invoiceId);
            const one = inst.find((i) => String(i.id) === String(body['installmentId']));
            if (one) {
              instInfo = { installmentNumber: one.installment_number, dueDate: one.due_date };
              msg += ` (القسط رقم ${one.installment_number})`;
            }
          }
          await notif.createAndSendNotification({
            title,
            message: msg,
            type: NotificationType.PAYMENT_REMINDER,
            recipientType: RecipientType.SPECIFIC_STUDENTS,
            recipientIds: [String(studentIdFinal)],
            data: {
              studyYear: studyYearFinal,
              invoiceId,
              courseId: courseIdFinal,
              amount: paid,
              remaining: rem,
              fullPaid: full,
              ...instInfo,
              subType: 'invoice_paid',
            },
            createdBy: teacherId,
          });
        }
      }
    } catch (err) {
      req.log?.warn({ err }, 'invoice payment notification failed');
    }

    res.status(200).json(ok(updated, 'تم تسجيل الدفعة'));
  }

  // POST /teacher/invoices/:invoiceId/discounts
  static async addDiscount(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as Record<string, any>;
    const updated = await TeacherInvoiceService.addDiscount({
      invoiceId,
      amount: Number(body['amount']),
      notes: body['notes'] || null,
    });

    if (body['studentId']) {
      try {
        const notif = req.app.get('notificationService') as NotificationService;
        if (notif) {
          await notif.createAndSendNotification({
            title: 'خصم على الفاتورة',
            message: `تم إضافة خصم بمبلغ ${body['amount']} دينار على فاتورتك`,
            type: NotificationType.PAYMENT_REMINDER,
            recipientType: RecipientType.SPECIFIC_STUDENTS,
            recipientIds: [body['studentId']],
            data: {
              studyYear: body['studyYear'],
              invoiceId,
              courseId: body['courseId'],
              amount: body['amount'],
              subType: 'invoice_discount',
            },
            createdBy: teacherId,
          });
        }
      } catch (err) {
        req.log?.warn({ err }, 'invoice discount notification failed');
      }
    }

    res.status(200).json(ok(updated, 'تم إضافة الخصم'));
  }

  // GET /teacher/invoices
  static async listInvoices(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      studyYear: string;
      status?: InvoiceStatus;
      deleted?: 'true' | 'false' | 'all';
      page?: number;
      limit?: number;
    };
    const { page, limit } = parsePagination(query);
    const { items, total } = await TeacherInvoiceService.listTeacherInvoices(
      teacherId,
      query.studyYear,
      query.status,
      query.deleted,
      page,
      limit
    );
    const data = (items || []).map((inv: any) => ({ ...inv, is_deleted: !!inv.deleted_at }));
    res
      .status(200)
      .json(paginated(data, buildPaginationMeta(total, page, limit), 'تم جلب الفواتير'));
  }

  // GET /teacher/invoices/:invoiceId/installments
  static async listInstallments(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const invoice = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
    if (!invoice) {
      throw new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const installments = await TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);

    const summary = {
      amount_due: toMoneyStr((invoice as any).amount_due),
      discount_total: toMoneyStr((invoice as any).discount_total),
      amount_paid: toMoneyStr((invoice as any).amount_paid),
      remaining_amount: toMoneyStr((invoice as any).remaining_amount),
      study_year: (invoice as any).study_year,
      payment_mode: (invoice as any).payment_mode,
      invoice_type: (invoice as any).invoice_type,
      invoice_date: toDateOnly((invoice as any).invoice_date),
      due_date: toDateOnly((invoice as any).due_date),
      notes: (invoice as any).notes || null,
    };

    res.status(200).json(
      ok(
        {
          invoice: summary,
          installments: (installments || []).map((inst: any) => ({
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
          })),
        },
        'تفاصيل الفاتورة مع الأقساط'
      )
    );
  }

  // GET /teacher/invoices/:invoiceId/full
  static async getInvoiceFull(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const invoice = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
    if (!invoice) {
      throw new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const installments = await TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);
    const items = (installments || []) as any[];
    const todayStr = toDateOnly(new Date()) as string;

    const totals = {
      count: items.length,
      paidCount: items.filter((i) => String(i.installment_status) === 'paid').length,
      partialCount: items.filter((i) => String(i.installment_status) === 'partial').length,
      pendingCount: items.filter((i) => String(i.installment_status) === 'pending').length,
      overdueCount: items.filter(
        (i) => String(i.installment_status) !== 'paid' && (toDateOnly(i.due_date) || '') < todayStr
      ).length,
      plannedTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.planned_amount || 0), 0)),
      paidTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.paid_amount || 0), 0)),
      remainingTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.remaining_amount || 0), 0)),
    };

    const summary = {
      amount_due: toMoneyStr((invoice as any).amount_due),
      discount_total: toMoneyStr((invoice as any).discount_total),
      amount_paid: toMoneyStr((invoice as any).amount_paid),
      remaining_amount: toMoneyStr((invoice as any).remaining_amount),
      study_year: (invoice as any).study_year,
      payment_mode: (invoice as any).payment_mode,
      invoice_type: (invoice as any).invoice_type,
      invoice_date: toDateOnly((invoice as any).invoice_date),
      due_date: toDateOnly((invoice as any).due_date),
      notes: (invoice as any).notes || null,
    };

    res.status(200).json(
      ok(
        {
          invoice: summary,
          installments: items.map((inst: any) => ({
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
          })),
          totals,
        },
        'تم جلب تفاصيل الفاتورة كاملة'
      )
    );
  }

  // GET /teacher/invoices/:invoiceId/entries/report
  static async entriesReport(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    const invoice = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
    if (!invoice) {
      throw new ApiError(404, 'الفاتورة غير موجودة', ErrorCodes.NOT_FOUND);
    }
    const installments = await TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);
    const items = (installments || []) as any[];
    const todayStr = toDateOnly(new Date()) as string;

    const totals = {
      count: items.length,
      paidCount: items.filter((i) => String(i.installment_status) === 'paid').length,
      partialCount: items.filter((i) => String(i.installment_status) === 'partial').length,
      pendingCount: items.filter((i) => String(i.installment_status) === 'pending').length,
      overdueCount: items.filter(
        (i) => String(i.installment_status) !== 'paid' && (toDateOnly(i.due_date) || '') < todayStr
      ).length,
      plannedTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.planned_amount || 0), 0)),
      paidTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.paid_amount || 0), 0)),
      remainingTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.remaining_amount || 0), 0)),
    };

    const summary = {
      amount_due: toMoneyNum((invoice as any).amount_due),
      discount_total: toMoneyNum((invoice as any).discount_total),
      amount_paid: toMoneyNum((invoice as any).amount_paid),
      remaining_amount: toMoneyNum((invoice as any).remaining_amount),
      study_year: (invoice as any).study_year,
      payment_mode: (invoice as any).payment_mode,
      invoice_type: (invoice as any).invoice_type,
      invoice_date: toDateOnly((invoice as any).invoice_date),
      due_date: toDateOnly((invoice as any).due_date),
      notes: (invoice as any).notes || null,
    };

    res
      .status(200)
      .json(ok({ summary, installments: totals }, 'تقرير الفاتورة'));
  }

  // DELETE /teacher/invoices/:invoiceId
  static async softDeleteInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    try {
      await TeacherInvoiceService.softDeleteInvoice(teacherId, invoiceId);
      res.status(200).json(ok(null, 'تم حذف الفاتورة (Soft)'));
    } catch (err) {
      throw mapServiceMutationError(err);
    }
  }

  // PATCH /teacher/invoices/:invoiceId/restore
  static async restoreInvoice(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const { invoiceId } = req.params as { invoiceId: string };
    try {
      await TeacherInvoiceService.restoreInvoice(teacherId, invoiceId);
      res.status(200).json(ok(null, 'تم استرجاع الفاتورة'));
    } catch (err) {
      throw mapServiceMutationError(err);
    }
  }

  // GET /teacher/invoices/summary
  static async invoicesSummary(req: Request, res: Response): Promise<void> {
    const teacherId = req.user.id as string;
    const query = req.query as unknown as {
      studyYear: string;
      status?: InvoiceStatus;
      deleted?: 'true' | 'false' | 'all';
    };
    const summary = await TeacherInvoiceService.getTeacherInvoicesSummary(
      teacherId,
      query.studyYear,
      query.status,
      query.deleted
    );
    res.status(200).json(ok(summary, 'تم جلب ملخص الفواتير'));
  }
}

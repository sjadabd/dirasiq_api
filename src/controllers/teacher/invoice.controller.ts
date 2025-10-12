import { InvoiceInstallmentModel } from '@/models/invoice-installment.model';
import { NotificationType, RecipientType } from '@/models/notification.model';
import { NotificationService } from '@/services/notification.service';
import { TeacherInvoiceService } from '@/services/teacher/invoice.service';
import {
  ApiResponse,
  AuthenticatedRequest,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
} from '@/types';
import { Request, Response } from 'express';

export class TeacherInvoiceController {
  // PATCH /teacher/invoices/:invoiceId
  static async updateInvoice(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const {
        dueDate,
        notes,
        invoiceType,
        paymentMode,
        amountDue,
        studentId,
        invoiceDate,
        discountAmount,
        installments,
        removeInstallmentIds,
      } = (req.body as any) || {};

      const normalizeDate = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string') return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };

      const updated = await TeacherInvoiceService.updateInvoice(
        teacherId,
        invoiceId,
        (() => {
          const updates: {
            dueDate?: string | null;
            notes?: string | null;
            invoiceType?: InvoiceType;
            paymentMode?: 'cash' | 'installments';
            amountDue?: number;
            studentId?: string;
            invoiceDate?: string | null;
            discountAmount?: number;
            installments?: Array<{
              id?: string;
              installmentNumber: number;
              plannedAmount: number;
              dueDate: string;
              notes?: string | null;
              status?: 'pending' | 'partial' | 'paid';
              paidAmount?: number;
              paidDate?: string | null;
            }>;
            removeInstallmentIds?: string[];
          } = {};
          if (dueDate !== undefined) updates.dueDate = normalizeDate(dueDate);
          if (notes !== undefined) updates.notes = notes || null;
          if (invoiceType !== undefined)
            updates.invoiceType = invoiceType as InvoiceType;
          if (paymentMode !== undefined)
            updates.paymentMode = paymentMode as 'cash' | 'installments';
          if (amountDue !== undefined) updates.amountDue = Number(amountDue);
          if (studentId !== undefined) updates.studentId = String(studentId);
          if (invoiceDate !== undefined) updates.invoiceDate = normalizeDate(invoiceDate);
          if (discountAmount !== undefined)
            updates.discountAmount = Math.max(Number(discountAmount || 0), 0);
          if (Array.isArray(installments))
            updates.installments = installments.map((it: any) => {
              const base: {
                id?: string;
                installmentNumber: number;
                plannedAmount: number;
                dueDate: string;
                notes?: string | null;
                status?: 'pending' | 'partial' | 'paid';
                paidAmount?: number;
                paidDate?: string | null;
              } = {
                installmentNumber: Number(it.installmentNumber),
                plannedAmount: Number(it.plannedAmount),
                dueDate: String(normalizeDate(it.dueDate)),
              };

              if (it.id != null) base.id = String(it.id);
              if (it.notes !== undefined)
                base.notes = it.notes != null ? String(it.notes) : null;
              // Normalize paidAmount
              const paidAmountRaw = it.paidAmount;
              if (paidAmountRaw != null)
                base.paidAmount = Math.max(Number(paidAmountRaw || 0), 0);

              // Normalize paidDate (empty string -> null)
              if (it.paidDate !== undefined)
                base.paidDate = it.paidDate ? String(normalizeDate(it.paidDate)) : null;

              // Determine status precedence (hard precedence for is_paid):
              // 1) If is_paid provided: true => paid (snap to full), false => pending (clear any paid data)
              // 2) Else if status string provided, trust it.
              // 3) Else infer from paidAmount.
              if (it.is_paid !== undefined) {
                const isPaid = Boolean(it.is_paid);
                if (isPaid) {
                  base.status = 'paid';
                  // Snap paidAmount to plannedAmount when marking as paid
                  base.paidAmount = Math.max(Number(base.plannedAmount || 0), 0);
                } else {
                  base.status = 'pending';
                  // Clear any previous payment info
                  base.paidAmount = 0;
                  base.paidDate = null;
                }
              } else if (it.status !== undefined) {
                base.status = String(it.status) as 'pending' | 'partial' | 'paid';
              } else if (base.paidAmount !== undefined) {
                base.status = base.paidAmount > 0 ? (base.paidAmount >= base.plannedAmount ? 'paid' : 'partial') : 'pending';
              }

              return base;
            });
          if (Array.isArray(removeInstallmentIds))
            updates.removeInstallmentIds = removeInstallmentIds.map((x: any) => String(x));
          return updates;
        })()
      );

      // Format date-only fields in response
      const toDateOnly = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };
      const formatted = updated
        ? {
            ...(updated as any),
            invoice_date: toDateOnly((updated as any).invoice_date),
            due_date: toDateOnly((updated as any).due_date),
            paid_date: toDateOnly((updated as any).paid_date),
          }
        : updated;

      return res.json({
        success: true,
        message: 'Invoice updated',
        data: formatted as any,
      });
    } catch (error: any) {
      const msg = error?.message || 'Failed to update invoice';
      const code =
        msg === 'Forbidden' ? 403 : msg.includes('not found') ? 404 : 400;
      return res.status(code).json({ success: false, message: msg });
    }
  }

  // POST /teacher/invoices
  static async createInvoice(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const {
        studentId,
        courseId,
        studyYear,
        paymentMode,
        invoiceType = 'course',
        amountDue,
        invoiceDate,
        discountAmount,
        dueDate,
        notes,
        installments,
      } = (req.body as any) || {};

      const normalizeDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);
      const normalizedInvoiceDate = normalizeDate(invoiceDate);
      const normalizedDueDate = normalizeDate(dueDate);
      const normalizedInstallments = Array.isArray(installments)
        ? installments.map((it: any) => ({
            ...it,
            dueDate: String(normalizeDate(it.dueDate)),
            ...(it.paidDate !== undefined
              ? { paidDate: normalizeDate(it.paidDate) }
              : {}),
          }))
        : undefined;

      if (
        !studentId ||
        !courseId ||
        !studyYear ||
        !paymentMode ||
        amountDue == null
      ) {
        return res
          .status(400)
          .json({ success: false, message: 'Missing required fields' });
      }

      const createOptions: any = {
        teacherId,
        studentId,
        courseId,
        studyYear,
        invoiceType: invoiceType as InvoiceType,
        paymentMode,
        amountDue: Number(amountDue),
        invoiceDate: normalizedInvoiceDate,
        dueDate: normalizedDueDate,
        notes: notes || null,
        installments: normalizedInstallments ?? installments,
      };
      if (discountAmount != null) {
        createOptions.discountAmount = Number(discountAmount);
      }

      const invoice = await TeacherInvoiceService.createInvoice(createOptions);

      // Notify student
      const notificationService = req.app.get(
        'notificationService'
      ) as NotificationService;
      if (notificationService) {
        await notificationService.createAndSendNotification({
          title: 'فاتورة جديدة',
          message:
            `تم إنشاء فاتورة جديدة بمبلغ ${invoice?.amount_due} دينار` as any,
          type: NotificationType.PAYMENT_REMINDER as any,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: [studentId],
          data: {
            studyYear,
            invoiceId: invoice?.id,
            courseId,
            subType: 'invoice_created',
          },
          createdBy: teacherId,
        });
      }

      // Normalize date-only fields in response
      const toDateOnly2 = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };
      const formattedInv = invoice
        ? {
            ...(invoice as any),
            invoice_date: toDateOnly2((invoice as any).invoice_date),
            due_date: toDateOnly2((invoice as any).due_date),
            paid_date: toDateOnly2((invoice as any).paid_date),
          }
        : invoice;

      return res
        .status(201)
        .json({ success: true, message: 'Invoice created', data: formattedInv as any });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to create invoice',
        });
    }
  }

  // POST /teacher/invoices/:invoiceId/payments
  static async addPayment(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const {
        amount,
        paymentMethod,
        installmentId,
        paidAt,
        notes,
        studentId,
        courseId,
        studyYear,
      } = req.body || {};

      if (!amount || !paymentMethod) {
        return res
          .status(400)
          .json({
            success: false,
            message: 'amount and paymentMethod are required',
          });
      }

      const updated = await TeacherInvoiceService.addPayment({
        invoiceId,
        amount: Number(amount),
        paymentMethod: paymentMethod as PaymentMethod,
        installmentId: installmentId || null,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        notes: notes || null,
      });

      // Notify student (derive missing IDs from invoice if not provided)
      {
        const inv = await TeacherInvoiceService.getInvoiceForTeacher(
          teacherId,
          invoiceId
        );
        const studentIdFinal = studentId || (inv && (inv as any).student_id);
        const courseIdFinal = courseId || (inv && (inv as any).course_id);
        const studyYearFinal = studyYear || (inv && (inv as any).study_year);
        if (studentIdFinal) {
          const notificationService = req.app.get(
            'notificationService'
          ) as NotificationService;
          if (notificationService) {
            // Build detailed message
            const rem = Number((updated as any)?.remaining_amount || 0);
            const paid = Number(amount);
            const full = rem <= 0;
            let title = full ? 'تم سداد الفاتورة كاملة' : 'تم تسجيل دفعة';
            let msg = full
              ? `تم سداد فاتورتك بالكامل. قيمة الدفعة: ${paid} دينار`
              : `تم تسجيل دفعة بمبلغ ${paid} دينار. المتبقي على فاتورتك: ${rem} دينار`;

            // If installment specified, include its number
            let instInfo: any = undefined;
            if (installmentId) {
              const inst =
                await InvoiceInstallmentModel.listByInvoice(invoiceId);
              const one = inst.find(
                i => String(i.id) === String(installmentId)
              );
              if (one)
                instInfo = {
                  installmentNumber: one.installment_number,
                  dueDate: one.due_date,
                };
              if (one) msg += ` (القسط رقم ${one.installment_number})`;
            }

            await notificationService.createAndSendNotification({
              title,
              message: msg as any,
              type: NotificationType.PAYMENT_REMINDER as any,
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
      }

      return res.json({
        success: true,
        message: 'Payment recorded',
        data: updated,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to add payment',
        });
    }
  }

  // POST /teacher/invoices/:invoiceId/discounts
  static async addDiscount(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const { amount, notes, studentId, courseId, studyYear } = req.body || {};
      if (!amount) {
        return res
          .status(400)
          .json({ success: false, message: 'amount is required' });
      }
      const updated = await TeacherInvoiceService.addDiscount({
        invoiceId,
        amount: Number(amount),
        notes: notes || null,
      });

      // Notify student
      if (studentId) {
        const notificationService = req.app.get(
          'notificationService'
        ) as NotificationService;
        if (notificationService) {
          await notificationService.createAndSendNotification({
            title: 'خصم على الفاتورة',
            message: `تم إضافة خصم بمبلغ ${amount} دينار على فاتورتك` as any,
            type: NotificationType.PAYMENT_REMINDER as any,
            recipientType: RecipientType.SPECIFIC_STUDENTS,
            recipientIds: [studentId],
            data: {
              studyYear,
              invoiceId,
              courseId,
              amount,
              subType: 'invoice_discount',
            },
            createdBy: teacherId,
          });
        }
      }

      return res.json({
        success: true,
        message: 'Discount applied',
        data: updated,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to add discount',
        });
    }
  }

  // GET /teacher/invoices
  static async listInvoices(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const studyYear = (req.query['studyYear'] as string) || '';
      const status = req.query['status'] as string as InvoiceStatus | undefined;
      const deleted = req.query['deleted'] as string as
        | 'true'
        | 'false'
        | 'all'
        | undefined;
      const page = Number(req.query['page'] || 1);
      const limit = Number(req.query['limit'] || 10);
      if (!studyYear) {
        return res
          .status(400)
          .json({ success: false, message: 'studyYear is required' });
      }
      const { items, total } = await TeacherInvoiceService.listTeacherInvoices(
        teacherId,
        studyYear,
        status,
        deleted,
        page,
        limit
      );
      const data = (items || []).map((inv: any) => ({
        ...inv,
        is_deleted: !!inv.deleted_at,
      }));
      return res.json({
        success: true,
        message: 'Invoices fetched',
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / Math.max(limit, 1)),
        },
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to fetch invoices',
        });
    }
  }

  // GET /teacher/invoices/:invoiceId/installments
  static async listInstallments(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      // Fetch invoice first to verify ownership and get summary fields
      const invoice = await TeacherInvoiceService.getInvoiceForTeacher(
        teacherId,
        invoiceId
      );
      if (!invoice)
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found' });

      // Fetch installments only (entries removed)
      const installments = await TeacherInvoiceService.listInstallmentsByInvoice(
        teacherId,
        invoiceId
      );

      // Format helpers
      const toMoney = (n: any) => Number(n ?? 0).toFixed(2);
      const toDateOnly = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };
      const toIso = (d: any) => (d ? new Date(d).toISOString() : null);

      // Build invoice summary formatted as requested (string numbers)
      const summary = {
        amount_due: toMoney((invoice as any).amount_due),
        discount_total: toMoney((invoice as any).discount_total),
        amount_paid: toMoney((invoice as any).amount_paid),
        remaining_amount: toMoney((invoice as any).remaining_amount),
        study_year: (invoice as any).study_year,
        payment_mode: (invoice as any).payment_mode,
        invoice_type: (invoice as any).invoice_type,
        invoice_date: toDateOnly((invoice as any).invoice_date),
        due_date: toDateOnly((invoice as any).due_date),
        notes: (invoice as any).notes || null,
      } as const;

      // Return simple payload: invoice summary + installments list
      return res.json({
        success: true,
        message: 'Invoice details with installments fetched',
        data: {
          invoice: summary,
          installments: (installments || []).map((inst: any) => ({
            id: inst.id,
            invoice_id: inst.invoice_id,
            installment_number: inst.installment_number,
            planned_amount: toMoney(inst.planned_amount),
            paid_amount: toMoney(inst.paid_amount),
            remaining_amount: toMoney(inst.remaining_amount),
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
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch installments',
      });
    }
  }

  static async getInvoiceFull(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };

      const invoice = await TeacherInvoiceService.getInvoiceForTeacher(
        teacherId,
        invoiceId
      );
      if (!invoice)
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found' });

      const installments = await TeacherInvoiceService.listInstallmentsByInvoice(
        teacherId,
        invoiceId
      );

      const toMoneyStr = (n: any) => Number(n ?? 0).toFixed(2);
      const toMoneyNum = (n: any) => Number(Number(n ?? 0).toFixed(2));
      const toDateOnly = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };
      const toIso = (d: any) => (d ? new Date(d).toISOString() : null);

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
      } as const;

      const items = (installments || []) as any[];
      const totals = {
        count: items.length,
        paidCount: items.filter(i => String(i.installment_status) === 'paid').length,
        partialCount: items.filter(i => String(i.installment_status) === 'partial').length,
        pendingCount: items.filter(i => String(i.installment_status) === 'pending').length,
        overdueCount: (() => {
          const todayStr = toDateOnly(new Date()) as string;
          return items.filter(i => String(i.installment_status) !== 'paid' && (toDateOnly(i.due_date) || '') < todayStr).length;
        })(),
        plannedTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.planned_amount || 0), 0)),
        paidTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.paid_amount || 0), 0)),
        remainingTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.remaining_amount || 0), 0)),
      };

      const installmentsList = items.map((inst: any) => ({
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
      }));

      return res.json({
        success: true,
        message: 'Invoice full details fetched',
        data: {
          invoice: summary,
          installments: installmentsList,
          totals,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch invoice',
      });
    }
  }

  // GET /teacher/invoices/:invoiceId/entries/report
  static async entriesReport(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };

      // Ensure invoice exists and belongs to teacher
      const invoice = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
      if (!invoice)
        return res.status(404).json({ success: false, message: 'Invoice not found' });

      const installments = await TeacherInvoiceService.listInstallmentsByInvoice(
        teacherId,
        invoiceId
      );

      const toMoneyNum = (n: any) => Number(Number(n ?? 0).toFixed(2));
      const toDateOnly = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };

      const today = new Date();
      const todayStr = toDateOnly(today) as string;

      const items = (installments || []) as any[];
      const totals = {
        count: items.length,
        paidCount: items.filter(i => String(i.installment_status) === 'paid').length,
        partialCount: items.filter(i => String(i.installment_status) === 'partial').length,
        pendingCount: items.filter(i => String(i.installment_status) === 'pending').length,
        overdueCount: items.filter(i => String(i.installment_status) !== 'paid' && (toDateOnly(i.due_date) || '') < todayStr).length,
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
      } as const;

      return res.json({
        success: true,
        message: 'Invoice entries report (installments-based) fetched',
        data: { summary, installments: totals },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch report',
      });
    }
  }

  // DELETE /teacher/invoices/:invoiceId
  static async softDeleteInvoice(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      await TeacherInvoiceService.softDeleteInvoice(teacherId, invoiceId);
      return res.json({ success: true, message: 'Invoice soft-deleted' });
    } catch (error: any) {
      const msg = error?.message || 'Failed to delete invoice';
      const code = msg.includes('not found') ? 404 : 500;
      return res.status(code).json({ success: false, message: msg });
    }
  }

  // PATCH /teacher/invoices/:invoiceId/restore
  static async restoreInvoice(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      await TeacherInvoiceService.restoreInvoice(teacherId, invoiceId);
      return res.json({ success: true, message: 'Invoice restored' });
    } catch (error: any) {
      const msg = error?.message || 'Failed to restore invoice';
      const code = msg.includes('not found') ? 404 : 500;
      return res.status(code).json({ success: false, message: msg });
    }
  }

  // GET /teacher/invoices/summary
  // Returns overall totals for the teacher's invoices in a study year (and optional status/deleted filters)
  static async invoicesSummary(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const studyYear = (req.query['studyYear'] as string) || '';
      const status = req.query['status'] as string as InvoiceStatus | undefined;
      const deleted = req.query['deleted'] as string as
        | 'true'
        | 'false'
        | 'all'
        | undefined;

      if (!studyYear) {
        return res
          .status(400)
          .json({ success: false, message: 'studyYear is required' });
      }

      const summary = await TeacherInvoiceService.getTeacherInvoicesSummary(
        teacherId,
        studyYear,
        status,
        deleted
      );

      // فقط التقرير الكلي (مجموع المبالغ والخصومات والمدفوع والمتبقي)
      return res.json({
        success: true,
        message: 'Invoices summary fetched',
        data: summary,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to fetch invoices summary',
        });
    }
  }
}

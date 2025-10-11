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
        installments,
        payments,
        additionalDiscounts,
      } = req.body || {};

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
            installments?: Array<{
              installmentNumber: number;
              plannedAmount: number;
              dueDate: string;
              notes?: string;
              initialPaidAmount?: number;
            }>;
            payments?: Array<{
              amount: number;
              paymentMethod: PaymentMethod;
              installmentNumber?: number;
              paidAt?: string;
              notes?: string;
            }>;
            additionalDiscounts?: Array<{ amount: number; notes?: string }>;
          } = {};
          if (dueDate !== undefined) updates.dueDate = dueDate || null;
          if (notes !== undefined) updates.notes = notes || null;
          if (invoiceType !== undefined)
            updates.invoiceType = invoiceType as InvoiceType;
          if (paymentMode !== undefined)
            updates.paymentMode = paymentMode as 'cash' | 'installments';
          if (amountDue !== undefined) updates.amountDue = Number(amountDue);
          if (Array.isArray(installments) && installments.length > 0) {
            updates.installments = installments.map((it: any) => {
              const obj: {
                installmentNumber: number;
                plannedAmount: number;
                dueDate: string;
                notes?: string;
                initialPaidAmount?: number;
              } = {
                installmentNumber: Number(it.installmentNumber),
                plannedAmount: Number(it.plannedAmount),
                dueDate: String(it.dueDate),
              };
              if (typeof it.notes === 'string') obj.notes = it.notes;
              if (it.initialPaidAmount !== undefined)
                obj.initialPaidAmount = Number(it.initialPaidAmount);
              return obj;
            });
          }
          if (Array.isArray(payments) && payments.length > 0) {
            updates.payments = payments.map((p: any) => {
              const obj: {
                amount: number;
                paymentMethod: PaymentMethod;
                installmentNumber?: number;
                paidAt?: string;
                notes?: string;
              } = {
                amount: Number(p.amount),
                paymentMethod: p.paymentMethod as PaymentMethod,
              };
              if (p.installmentNumber !== undefined)
                obj.installmentNumber = Number(p.installmentNumber);
              if (p.paidAt) obj.paidAt = String(p.paidAt);
              if (typeof p.notes === 'string') obj.notes = p.notes;
              return obj;
            });
          }
          if (
            Array.isArray(additionalDiscounts) &&
            additionalDiscounts.length > 0
          ) {
            updates.additionalDiscounts = additionalDiscounts.map((d: any) => {
              const obj: { amount: number; notes?: string } = {
                amount: Number(d.amount),
              };
              if (typeof d.notes === 'string') obj.notes = d.notes;
              return obj;
            });
          }
          return updates;
        })()
      );

      return res.json({
        success: true,
        message: 'Invoice updated',
        data: updated,
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
        discountAmount,
        dueDate,
        notes,
        installments,
        payments,
        additionalDiscounts,
      } = req.body || {};

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
        dueDate: dueDate || null,
        notes: notes || null,
        installments,
        payments,
        additionalDiscounts,
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

      return res
        .status(201)
        .json({ success: true, message: 'Invoice created', data: invoice });
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
            let title = full ? 'تم سداد الفاتورة كاملة' : 'تم تسجيل دفعة جزئية';
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

      // Fetch installments and entries
      const [installments, entries] = await Promise.all([
        TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId),
        TeacherInvoiceService.listEntriesByInvoice(teacherId, invoiceId),
      ]);

      // Format helpers
      const toMoney = (n: any) => Number(n ?? 0).toFixed(2);
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
        invoice_date: toIso((invoice as any).invoice_date),
        due_date: toIso((invoice as any).due_date),
      } as const;

      // Build map: installmentId -> installment_number for allocations
      const installmentNumberById: Record<string, number> = {};
      (installments || []).forEach((inst: any) => {
        if (inst && inst.id) installmentNumberById[String(inst.id)] = inst.installment_number;
      });

      // Build the combined installments array in the exact requested format
      const combined: any[] = [];

      // 1) Synthetic amount_due row
      combined.push({
        id: (invoice as any).id,
        invoice_id: (invoice as any).id,
        entry_type: 'amount_due',
        amount: toMoney((invoice as any).amount_due),
        installment_id: null,
        payment_method: null,
        installment_status: null,
        paid_at: null,
        notes: 'المبلغ الكلي',
        created_at: toIso((invoice as any).created_at),
        updated_at: toIso((invoice as any).updated_at),
        deleted_at: null,
      });

      // 2) Discount entries from invoice_entries
      (entries || []).forEach((e: any) => {
        if ((e.entry_type || e.entryType) === 'discount') {
          combined.push({
            id: e.id,
            invoice_id: e.invoice_id || (invoice as any).id,
            entry_type: 'discount',
            amount: toMoney(e.amount),
            installment_id: e.installment_id || null,
            payment_method: e.payment_method || null,
            installment_status: e.installment_status || null,
            paid_at: toIso(e.paid_at || e.paidAt),
            notes: e.notes || null,
            created_at: toIso(e.created_at),
            updated_at: toIso(e.updated_at),
            deleted_at: e.deleted_at ? toIso(e.deleted_at) : null,
          });
        }
      });

      // 3) Installments as payment rows
      (installments || []).forEach((inst: any) => {
        combined.push({
          id: inst.id,
          invoice_id: inst.invoice_id,
          installment_number: inst.installment_number,
          entry_type: 'payment',
          planned_amount: toMoney(inst.planned_amount),
          paid_amount: toMoney(inst.paid_amount),
          remaining_amount: toMoney(inst.remaining_amount),
          installment_status: inst.installment_status,
          due_date: toIso(inst.due_date),
          paid_date: toIso(inst.paid_date),
          notes: inst.notes || null,
          created_at: toIso(inst.created_at),
          updated_at: toIso(inst.updated_at),
          deleted_at: inst.deleted_at ? toIso(inst.deleted_at) : null,
        });
      });

      // Return combined payload exactly as requested
      return res.json({
        success: true,
        message: 'Invoice details with installments and entries fetched',
        data: {
          invoice: summary,
          installments: combined,
        },
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to fetch installments',
        });
    }
  }

  // GET /teacher/invoices/:invoiceId/entries
  static async listEntries(
    req: AuthenticatedRequest & Request,
    res: Response<ApiResponse>
  ) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const items = await TeacherInvoiceService.listEntriesByInvoice(
        teacherId,
        invoiceId
      );
      if (!items)
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found' });
      return res.json({
        success: true,
        message: 'Entries fetched',
        data: items,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
          success: false,
          message: error.message || 'Failed to fetch entries',
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
      const invoice = await TeacherInvoiceService.getInvoiceForTeacher(
        teacherId,
        invoiceId
      );
      if (!invoice)
        return res
          .status(404)
          .json({ success: false, message: 'Invoice not found' });
      const report = {
        amount_due: invoice.amount_due,
        discount_total: invoice.discount_total,
        amount_paid: invoice.amount_paid,
        remaining_amount: invoice.remaining_amount,
      };
      return res.json({
        success: true,
        message: 'Invoice entries report',
        data: report,
      });
    } catch (error: any) {
      return res
        .status(500)
        .json({
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

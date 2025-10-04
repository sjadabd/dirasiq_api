import { Request, Response } from 'express';
import { AuthenticatedRequest, ApiResponse, InvoiceStatus, InvoiceType, PaymentMethod } from '@/types';
import { TeacherInvoiceService } from '@/services/teacher/invoice.service';
import { NotificationService } from '@/services/notification.service';
import { RecipientType, NotificationType } from '@/models/notification.model';
import { InvoiceInstallmentModel } from '@/models/invoice-installment.model';

export class TeacherInvoiceController {
  // POST /teacher/invoices
  static async createInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
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

      if (!studentId || !courseId || !studyYear || !paymentMode || amountDue == null) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
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
      const notificationService = req.app.get('notificationService') as NotificationService;
      if (notificationService) {
        await notificationService.createAndSendNotification({
          title: 'فاتورة جديدة',
          message: `تم إنشاء فاتورة جديدة بمبلغ ${invoice?.amount_due} دينار` as any,
          type: NotificationType.PAYMENT_REMINDER as any,
          recipientType: RecipientType.SPECIFIC_STUDENTS,
          recipientIds: [studentId],
          data: {
            studyYear,
            invoiceId: invoice?.id,
            courseId,
            subType: 'invoice_created'
          },
          createdBy: teacherId,
        });
      }

      return res.status(201).json({ success: true, message: 'Invoice created', data: invoice });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to create invoice' });
    }
  }

  // POST /teacher/invoices/:invoiceId/payments
  static async addPayment(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const { amount, paymentMethod, installmentId, paidAt, notes, studentId, courseId, studyYear } = req.body || {};

      if (!amount || !paymentMethod) {
        return res.status(400).json({ success: false, message: 'amount and paymentMethod are required' });
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
        const inv = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
        const studentIdFinal = studentId || (inv && (inv as any).student_id);
        const courseIdFinal = courseId || (inv && (inv as any).course_id);
        const studyYearFinal = studyYear || (inv && (inv as any).study_year);
        if (studentIdFinal) {
          const notificationService = req.app.get('notificationService') as NotificationService;
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
              const inst = await InvoiceInstallmentModel.listByInvoice(invoiceId);
              const one = inst.find((i) => String(i.id) === String(installmentId));
              if (one) instInfo = { installmentNumber: one.installment_number, dueDate: one.due_date };
              if (one) msg += ` (القسط رقم ${one.installment_number})`;
            }

            await notificationService.createAndSendNotification({
              title,
              message: msg as any,
              type: NotificationType.PAYMENT_REMINDER as any,
              recipientType: RecipientType.SPECIFIC_STUDENTS,
              recipientIds: [String(studentIdFinal)],
              data: { studyYear: studyYearFinal, invoiceId, courseId: courseIdFinal, amount: paid, remaining: rem, fullPaid: full, ...instInfo, subType: 'invoice_paid' },
              createdBy: teacherId,
            });
          }
        }
      }

      return res.json({ success: true, message: 'Payment recorded', data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to add payment' });
    }
  }

  // POST /teacher/invoices/:invoiceId/discounts
  static async addDiscount(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const { amount, notes, studentId, courseId, studyYear } = req.body || {};
      if (!amount) {
        return res.status(400).json({ success: false, message: 'amount is required' });
      }
      const updated = await TeacherInvoiceService.addDiscount({ invoiceId, amount: Number(amount), notes: notes || null });

      // Notify student
      if (studentId) {
        const notificationService = req.app.get('notificationService') as NotificationService;
        if (notificationService) {
          await notificationService.createAndSendNotification({
            title: 'خصم على الفاتورة',
            message: `تم إضافة خصم بمبلغ ${amount} دينار على فاتورتك` as any,
            type: NotificationType.PAYMENT_REMINDER as any,
            recipientType: RecipientType.SPECIFIC_STUDENTS,
            recipientIds: [studentId],
            data: { studyYear, invoiceId, courseId, amount, subType: 'invoice_discount' },
            createdBy: teacherId,
          });
        }
      }

      return res.json({ success: true, message: 'Discount applied', data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to add discount' });
    }
  }

  // GET /teacher/invoices
  static async listInvoices(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const studyYear = (req.query['studyYear'] as string) || '';
      const status = (req.query['status'] as string) as InvoiceStatus | undefined;
      const deleted = (req.query['deleted'] as string) as 'true' | 'false' | 'all' | undefined;
      if (!studyYear) {
        return res.status(400).json({ success: false, message: 'studyYear is required' });
      }
      const invoices = await TeacherInvoiceService.listTeacherInvoices(teacherId, studyYear, status, deleted);
      const data = (invoices || []).map((inv: any) => ({ ...inv, is_deleted: !!inv.deleted_at }));
      return res.json({ success: true, message: 'Invoices fetched', data });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch invoices' });
    }
  }

  // GET /teacher/invoices/:invoiceId/installments
  static async listInstallments(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const items = await TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);
      if (!items) return res.status(404).json({ success: false, message: 'Invoice not found' });
      return res.json({ success: true, message: 'Installments fetched', data: items });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch installments' });
    }
  }

  // GET /teacher/invoices/:invoiceId/entries
  static async listEntries(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const items = await TeacherInvoiceService.listEntriesByInvoice(teacherId, invoiceId);
      if (!items) return res.status(404).json({ success: false, message: 'Invoice not found' });
      return res.json({ success: true, message: 'Entries fetched', data: items });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch entries' });
    }
  }

  // GET /teacher/invoices/:invoiceId/entries/report
  static async entriesReport(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
    try {
      const teacherId = req.user?.id as string;
      const { invoiceId } = req.params as { invoiceId: string };
      const invoice = await TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
      if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
      const report = {
        amount_due: invoice.amount_due,
        discount_total: invoice.discount_total,
        amount_paid: invoice.amount_paid,
        remaining_amount: invoice.remaining_amount,
      };
      return res.json({ success: true, message: 'Invoice entries report', data: report });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch report' });
    }
  }

  // DELETE /teacher/invoices/:invoiceId
  static async softDeleteInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
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
  static async restoreInvoice(req: AuthenticatedRequest & Request, res: Response<ApiResponse>) {
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
}

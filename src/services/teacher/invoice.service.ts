import pool from '@/config/database';
import { CourseInvoiceModel } from '@/models/course-invoice.model';
import { InvoiceEntryModel } from '@/models/invoice-entry.model';
import { InvoiceInstallmentModel } from '@/models/invoice-installment.model';
import { InvoiceStatus, InvoiceType, PaymentMethod } from '@/types';

export class TeacherInvoiceService {
  static async createInvoice(options: {
    teacherId: string;
    studentId: string;
    courseId: string;
    studyYear: string;
    invoiceType: InvoiceType;
    paymentMode: 'cash' | 'installments';
    amountDue: number;
    discountAmount?: number;
    dueDate?: string | null;
    notes?: string | null;
    installments?: Array<{
      installmentNumber: number;
      plannedAmount: number;
      dueDate: string;
      notes?: string;
      initialPaidAmount?: number;
    }>; // for installments mode
    payments?: Array<{
      amount: number;
      paymentMethod: PaymentMethod;
      installmentNumber?: number;
      paidAt?: string;
      notes?: string;
    }>;
    additionalDiscounts?: Array<{ amount: number; notes?: string }>;
  }) {
    // Create base invoice
    const invoice = await CourseInvoiceModel.create({
      studentId: options.studentId,
      teacherId: options.teacherId,
      courseId: options.courseId,
      studyYear: options.studyYear,
      invoiceType: options.invoiceType,
      paymentMode: options.paymentMode,
      amountDue: options.amountDue,
      dueDate: options.dueDate || null,
      notes: options.notes || null,
    });

    // Helper to apply a discount entry and update aggregates (with limit check)
    const applyDiscount = async (amount: number, notes?: string) => {
      const val = Math.max(Number(amount || 0), 0);
      if (val <= 0) return;
      const invFresh = await CourseInvoiceModel.findById(invoice.id);
      if (!invFresh) throw new Error('Invoice not found');
      const remaining = Math.max(
        Number(invFresh.amount_due) -
          (Number(invFresh.discount_total) + Number(invFresh.amount_paid)),
        0
      );
      if (val > remaining) {
        throw new Error(
          'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
        );
      }
      await InvoiceEntryModel.create({
        invoiceId: invoice.id,
        entryType: 'discount',
        amount: val,
        notes: notes || 'خصم على الفاتورة',
      });
      await CourseInvoiceModel.updateAggregates(invoice.id, {
        discountTotal: val,
      });
    };

    // Helper to pay against a specific installment id
    const payInstallmentById = async (
      installmentId: string,
      amount: number,
      paymentMethod: PaymentMethod,
      paidAt?: Date,
      notes?: string
    ) => {
      const val = Math.max(Number(amount || 0), 0);
      if (val <= 0) return;
      // Enforce remaining does not get exceeded during createInvoice as well
      const invFresh = await CourseInvoiceModel.findById(invoice.id);
      if (!invFresh) throw new Error('Invoice not found');
      const remaining = Math.max(
        Number(invFresh.amount_due) -
          (Number(invFresh.discount_total) + Number(invFresh.amount_paid)),
        0
      );
      if (val > remaining) {
        throw new Error(
          'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
        );
      }
      await InvoiceEntryModel.create({
        invoiceId: invoice.id,
        entryType: 'payment',
        amount: val,
        installmentId,
        paymentMethod,
        paidAt: paidAt || new Date(),
        notes: notes || null,
      });
      await InvoiceInstallmentModel.addPayment(
        installmentId,
        val,
        paidAt || undefined
      );
      await CourseInvoiceModel.updateAggregates(invoice.id, { amountPaid: val });
    };

    // If installments, create plan and then process initial payments/discounts
    if (options.paymentMode === 'installments') {
      if (!options.installments || options.installments.length === 0) {
        throw new Error('Installments plan is required for installments payment mode');
      }
      await InvoiceInstallmentModel.createMany(
        invoice.id,
        options.installments
      );

      // Map installmentNumber -> installmentId
      let installments = await InvoiceInstallmentModel.listByInvoice(
        invoice.id
      );
      const byNumber: Record<number, string> = {};
      for (const inst of installments)
        byNumber[inst.installment_number] = inst.id;

      // Apply initialPaidAmount per installment if provided
      for (const inst of options.installments) {
        const initPaid = Math.max(Number(inst.initialPaidAmount || 0), 0);
        if (initPaid > 0) {
          const instId = byNumber[inst.installmentNumber];
          if (instId) {
            await payInstallmentById(
              instId,
              initPaid,
              PaymentMethod.CASH,
              new Date(),
              'دفعة ابتدائية للقسط'
            );
          }
        }
      }

      // Apply base discountAmount if provided (invoice-level, not tied to an installment)
      if (options.discountAmount && options.discountAmount > 0) {
        await applyDiscount(options.discountAmount, 'خصم على الفاتورة');
      }

      // Apply additional discounts if any
      if (
        options.additionalDiscounts &&
        options.additionalDiscounts.length > 0
      ) {
        for (const d of options.additionalDiscounts) {
          await applyDiscount(d.amount, d.notes);
        }
      }

      // Process explicit payments array
      if (options.payments && options.payments.length > 0) {
        // Refresh installments to get current remaining_amount
        installments = await InvoiceInstallmentModel.listByInvoice(invoice.id);

        for (const p of options.payments) {
          let remainingToAllocate = Math.max(Number(p.amount || 0), 0);
          if (remainingToAllocate <= 0) continue;
          const paidAt = p.paidAt ? new Date(p.paidAt) : new Date();

          if (p.installmentNumber != null) {
            const instId = byNumber[p.installmentNumber];
            if (instId) {
              await payInstallmentById(
                instId,
                remainingToAllocate,
                p.paymentMethod,
                paidAt,
                p.notes || undefined
              );
              continue;
            }
          }

          // FIFO allocation over open installments
          for (const inst of installments) {
            if (remainingToAllocate <= 0) break;
            // Fetch remaining_amount snapshot from model record
            const instRemaining = Math.max(
              Number(inst.remaining_amount || 0),
              0
            );
            if (instRemaining <= 0) continue;
            const alloc = Math.min(remainingToAllocate, instRemaining);
            await payInstallmentById(
              inst.id,
              alloc,
              p.paymentMethod,
              paidAt,
              p.notes || undefined
            );
            remainingToAllocate -= alloc;
          }
          // If still remains, record as general payment (not tied to installment)
          if (remainingToAllocate > 0) {
            const invFresh = await CourseInvoiceModel.findById(invoice.id);
            if (!invFresh) throw new Error('Invoice not found');
            const remaining = Math.max(
              Number(invFresh.amount_due) -
                (Number(invFresh.discount_total) +
                  Number(invFresh.amount_paid)),
              0
            );
            if (remainingToAllocate > remaining) {
              throw new Error(
                'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
              );
            }
            await InvoiceEntryModel.create({
              invoiceId: invoice.id,
              entryType: 'payment',
              amount: remainingToAllocate,
              paymentMethod: p.paymentMethod,
              paidAt,
              notes: p.notes || null,
            });
            await CourseInvoiceModel.updateAggregates(invoice.id, {
              amountPaid: remainingToAllocate,
            });
          }
        }
      }

      // Update final status
      await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
      return await CourseInvoiceModel.findById(invoice.id);
    }

    // Cash invoice: apply discount and immediate payment
    const discount = Math.max(Number(options.discountAmount || 0), 0);
    if (discount > 0) await applyDiscount(discount, 'خصم على الفاتورة');

    // Additional discounts on cash invoices as well
    if (options.additionalDiscounts && options.additionalDiscounts.length > 0) {
      for (const d of options.additionalDiscounts) {
        await applyDiscount(d.amount, d.notes);
      }
    }

    // If client sent explicit payments, record them; otherwise auto full payment
    if (options.payments && options.payments.length > 0) {
      for (const p of options.payments) {
        const val = Math.max(Number(p.amount || 0), 0);
        if (val <= 0) continue;
        const invFresh = await CourseInvoiceModel.findById(invoice.id);
        if (!invFresh) throw new Error('Invoice not found');
        const remaining = Math.max(
          Number(invFresh.amount_due) -
            (Number(invFresh.discount_total) + Number(invFresh.amount_paid)),
          0
        );
        if (val > remaining) {
          throw new Error(
            'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
          );
        }
        await InvoiceEntryModel.create({
          invoiceId: invoice.id,
          entryType: 'payment',
          amount: val,
          paymentMethod: p.paymentMethod,
          paidAt: p.paidAt ? new Date(p.paidAt) : new Date(),
          notes: p.notes || null,
        });
        await CourseInvoiceModel.updateAggregates(invoice.id, {
          amountPaid: val,
        });
      }
    } else {
      const toPay = Math.max(
        options.amountDue -
          discount -
          (options.additionalDiscounts?.reduce(
            (a, b) => a + Math.max(Number(b.amount || 0), 0),
            0
          ) || 0),
        0
      );
      if (toPay > 0) {
        await InvoiceEntryModel.create({
          invoiceId: invoice.id,
          entryType: 'payment',
          amount: toPay,
          paymentMethod: PaymentMethod.CASH,
          paidAt: new Date(),
          notes: 'دفع كاش كامل للفاتورة',
        });
        await CourseInvoiceModel.updateAggregates(invoice.id, {
          amountPaid: toPay,
        });
      }
    }

    // Update final status
    await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
    return await CourseInvoiceModel.findById(invoice.id);
  }

  static async addPayment(options: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    installmentId?: string | null;
    paidAt?: Date | null;
    notes?: string | null;
  }) {
    const inv = await CourseInvoiceModel.findById(options.invoiceId);
    if (!inv) throw new Error('Invoice not found');
    const remaining = Math.max(
      Number(inv.amount_due) -
        (Number(inv.discount_total) + Number(inv.amount_paid)),
      0
    );
    if (Number(options.amount) > remaining) {
      throw new Error(
        'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
      );
    }

    // Create entry
    await InvoiceEntryModel.create({
      invoiceId: options.invoiceId,
      entryType: 'payment',
      amount: options.amount,
      installmentId: options.installmentId || null,
      paymentMethod: options.paymentMethod,
      paidAt: options.paidAt || new Date(),
      notes: options.notes || null,
    });

    // If specific installment, update its aggregation
    if (options.installmentId) {
      await InvoiceInstallmentModel.addPayment(
        options.installmentId,
        options.amount,
        options.paidAt || undefined
      );
    }

    // Update invoice aggregates and status
    await CourseInvoiceModel.updateAggregates(options.invoiceId, {
      amountPaid: options.amount,
    });
    const updated = await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(
      options.invoiceId
    );
    return updated;
  }

  static async addDiscount(options: {
    invoiceId: string;
    amount: number;
    notes?: string | null;
  }) {
    const inv = await CourseInvoiceModel.findById(options.invoiceId);
    if (!inv) throw new Error('Invoice not found');
    const remaining = Math.max(
      Number(inv.amount_due) -
        (Number(inv.discount_total) + Number(inv.amount_paid)),
      0
    );
    if (Number(options.amount) > remaining) {
      throw new Error(
        'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
      );
    }

    await InvoiceEntryModel.create({
      invoiceId: options.invoiceId,
      entryType: 'discount',
      amount: options.amount,
      notes: options.notes || 'خصم على الفاتورة',
    });

    await CourseInvoiceModel.updateAggregates(options.invoiceId, {
      discountTotal: options.amount,
    });
    const updated = await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(
      options.invoiceId
    );
    return updated;
  }

  static async listTeacherInvoices(
    teacherId: string,
    studyYear: string,
    status?: InvoiceStatus,
    deleted?: 'true' | 'false' | 'all'
  ) {
    // Build dynamic query to support deleted filter
    const where: string[] = ['teacher_id = $1', 'study_year = $2'];
    const params: any[] = [teacherId, studyYear];
    let i = 3;
    if (status) {
      where.push(`invoice_status = $${i++}`);
      params.push(status);
    }
    // deleted filter: default exclude deleted (false)
    if (deleted === 'true') where.push('deleted_at IS NOT NULL');
    else if (deleted === 'all') {
      // no condition
    } else {
      // undefined or 'false'
      where.push('deleted_at IS NULL');
    }

    const q = `SELECT * FROM course_invoices WHERE ${where.join(' AND ')} ORDER BY created_at DESC`;
    const r = await pool.query(q, params);
    return r.rows;
  }

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

  static async listEntriesByInvoice(teacherId: string, invoiceId: string) {
    const inv = await this.getInvoiceForTeacher(teacherId, invoiceId);
    if (!inv) return null;
    return await InvoiceEntryModel.listByInvoice(invoiceId);
  }

  static async softDeleteInvoice(teacherId: string, invoiceId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Ensure ownership
      const invRes = await client.query(
        'SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL',
        [invoiceId, teacherId]
      );
      if (invRes.rowCount === 0) {
        throw new Error('Invoice not found or already deleted');
      }
      // Soft delete children first (not strictly necessary with CASCADE, but explicit)
      await client.query(
        'UPDATE invoice_entries SET deleted_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL',
        [invoiceId]
      );
      await client.query(
        'UPDATE invoice_installments SET deleted_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL',
        [invoiceId]
      );
      // Soft delete invoice
      await client.query(
        'UPDATE course_invoices SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
        [invoiceId]
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

  static async restoreInvoice(teacherId: string, invoiceId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Ensure ownership (allow restoring if invoice exists regardless of deleted_at)
      const invRes = await client.query(
        'SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2',
        [invoiceId, teacherId]
      );
      if (invRes.rowCount === 0) {
        throw new Error('Invoice not found');
      }
      // Restore invoice first
      await client.query(
        'UPDATE course_invoices SET deleted_at = NULL, updated_at = NOW() WHERE id = $1',
        [invoiceId]
      );
      // Restore children
      await client.query(
        'UPDATE invoice_installments SET deleted_at = NULL WHERE invoice_id = $1',
        [invoiceId]
      );
      await client.query(
        'UPDATE invoice_entries SET deleted_at = NULL WHERE invoice_id = $1',
        [invoiceId]
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
}

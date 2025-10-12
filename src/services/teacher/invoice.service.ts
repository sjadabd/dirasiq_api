import pool from '@/config/database';
import { CourseInvoiceModel } from '@/models/course-invoice.model';
import { InvoiceInstallmentModel } from '@/models/invoice-installment.model';
import { InvoiceStatus, InvoiceType, PaymentMethod } from '@/types';

export class TeacherInvoiceService {
  static async updateInvoice(
    teacherId: string,
    invoiceId: string,
    updates: {
      dueDate?: string | null;
      notes?: string | null;
      invoiceType?: InvoiceType;
      paymentMode?: 'cash' | 'installments';
      amountDue?: number;
      // extended fields
      studentId?: string;
      invoiceDate?: string | null;
      discountAmount?: number; // sets invoice-level discount_total
      installments?: Array<{
        id?: string;
        installmentNumber: number;
        plannedAmount: number;
        dueDate: string;
        notes?: string | null;
        status?: 'pending' | 'partial' | 'paid';
        paidAmount?: number; // required if status=partial
        paidDate?: string | null;
      }>;
      removeInstallmentIds?: string[];
    }
  ) {
    // Fetch and authorize
    const inv = await CourseInvoiceModel.findById(invoiceId);
    if (!inv) throw new Error('Invoice not found');
    if (String(inv.teacher_id) !== String(teacherId))
      throw new Error('Forbidden');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Defensive normalization for date-only fields
      const normDate = (d: any) => {
        if (!d) return null;
        if (typeof d === 'string') return d.slice(0, 10);
        try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
      };
      if (updates.invoiceDate !== undefined) {
        updates.invoiceDate = normDate(updates.invoiceDate);
      }
      if (updates.dueDate !== undefined) {
        updates.dueDate = normDate(updates.dueDate);
      }

      // If amountDue will change, validate it won't be less than existing discounts + paid
      if (updates.amountDue != null) {
        const newAmount = Math.max(Number(updates.amountDue || 0), 0);
        const minAllowed = Number(inv.discount_total) + Number(inv.amount_paid);
        if (newAmount < minAllowed) {
          throw new Error(
            'قيمة الفاتورة الجديدة يجب ألا تقل عن مجموع الخصومات والمدفوع'
          );
        }
      }

      // Build dynamic SET
      const setParts: string[] = [];
      const args: any[] = [];
      let i = 1;

      if (updates.dueDate !== undefined) {
        setParts.push(`due_date = $${i++}`);
        args.push(updates.dueDate);
      }
      if (updates.notes !== undefined) {
        setParts.push(`notes = $${i++}`);
        args.push(updates.notes);
      }
      if (updates.invoiceType !== undefined) {
        setParts.push(`invoice_type = $${i++}`);
        args.push(updates.invoiceType);
      }
      if (updates.paymentMode !== undefined) {
        setParts.push(`payment_mode = $${i++}`);
        args.push(updates.paymentMode);
      }
      if (updates.invoiceDate !== undefined) {
        setParts.push(`invoice_date = $${i++}`);
        args.push(updates.invoiceDate);
      }
      if (updates.amountDue !== undefined) {
        const newAmount = Math.max(Number(updates.amountDue || 0), 0);
        setParts.push(`amount_due = $${i++}`);
        args.push(newAmount);
      }

      if (setParts.length === 0) {
        await client.query('ROLLBACK');
        return inv; // nothing to update
      }
      setParts.push('updated_at = NOW()');
      const q = `
        UPDATE course_invoices
        SET ${setParts.join(', ')}
        WHERE id = $${i}
          AND teacher_id = $${i + 1}
        RETURNING *
      `;
      args.push(invoiceId, teacherId);
      await client.query(q, args);

      // If discountAmount is specified, set discount_total explicitly with validation
      if (updates.discountAmount !== undefined) {
        const newDiscount = Math.max(Number(updates.discountAmount || 0), 0);
        const fresh = await CourseInvoiceModel.findById(invoiceId);
        if (!fresh) throw new Error('Invoice not found');
        const maxDiscount = Math.max(
          Number(fresh.amount_due) - Number(fresh.amount_paid),
          0
        );
        if (newDiscount > maxDiscount) {
          throw new Error(
            'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
          );
        }
        await client.query(
          `UPDATE course_invoices
             SET discount_total = $1,
                 updated_at = NOW()
           WHERE id = $2 AND teacher_id = $3`,
          [newDiscount, invoiceId, teacherId]
        );
      }

      // Handle installments edits only if requested
      if (updates.installments || (updates.removeInstallmentIds && updates.removeInstallmentIds.length > 0)) {
        // Ensure current payment_mode is installments (after potential change)
        const curInvRes = await client.query(
          'SELECT payment_mode FROM course_invoices WHERE id = $1 AND teacher_id = $2',
          [invoiceId, teacherId]
        );
        if (curInvRes.rows.length === 0) throw new Error('Invoice not found');
        const curMode = String(curInvRes.rows[0].payment_mode);
        if (curMode !== 'installments') {
          // If switched to cash, ignore installments edits gracefully
        } else {
          // Remove installments if requested
          if (updates.removeInstallmentIds && updates.removeInstallmentIds.length > 0) {
            const placeholders = updates.removeInstallmentIds.map((_, idx) => `$${idx + 3}`).join(', ');
            await client.query(
              `UPDATE invoice_installments
                 SET deleted_at = NOW(), updated_at = NOW()
               WHERE invoice_id = $1 AND deleted_at IS NULL AND id IN (${placeholders})`,
              [invoiceId, teacherId, ...updates.removeInstallmentIds]
            );
          }

          // Upsert installments
          if (updates.installments && updates.installments.length > 0) {
            for (const it of updates.installments) {
              // Accept either explicit status or legacy boolean is_paid
              let instStatus = (it.status || 'pending') as 'pending' | 'partial' | 'paid';
              if (!it.status && (it as any).is_paid !== undefined) {
                instStatus = (it as any).is_paid ? 'paid' : 'pending';
              }
              let targetPaid = 0;
              if (instStatus === 'paid') targetPaid = Math.max(Number(it.plannedAmount || 0), 0);
              else if (instStatus === 'partial') targetPaid = Math.max(Number(it.paidAmount || 0), 0);
              else targetPaid = 0;

              // Respect explicitly provided status instead of recomputing from amounts
              const targetStatus: 'pending' | 'partial' | 'paid' = instStatus;

              const paidDateVal = targetStatus === 'paid' ? (it.paidDate ? normDate(it.paidDate) : normDate(new Date())) : null;

              // If no id is provided, try to upsert by (invoice_id, installment_number)
              // to avoid duplicate key violations.
              if (!it.id) {
                const existRes = await client.query(
                  `SELECT id FROM invoice_installments
                   WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL`,
                  [invoiceId, it.installmentNumber]
                );
                if (existRes.rows.length > 0) {
                  // Treat as update for the found row
                  it.id = existRes.rows[0].id as string;
                }
              }

              if (it.id) {
                // Check for conflicting installment_number assigned to another row
                const conflict = await client.query(
                  `SELECT 1 FROM invoice_installments
                   WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL AND id <> $3`,
                  [invoiceId, it.installmentNumber, it.id]
                );
                if (conflict.rows.length > 0) {
                  throw new Error('رقم القسط مكرر ضمن نفس الفاتورة، يرجى اختيار رقم مختلف');
                }
                // update existing installment
                await client.query(
                  `UPDATE invoice_installments
                     SET installment_number = $1,
                         planned_amount = $2,
                         due_date = $3,
                         notes = $4,
                         paid_amount = $5,
                         installment_status = $6,
                         paid_date = $7,
                         updated_at = NOW()
                   WHERE id = $8 AND invoice_id = $9`,
                  [
                    it.installmentNumber,
                    it.plannedAmount,
                    it.dueDate,
                    it.notes || null,
                    targetPaid,
                    targetStatus,
                    paidDateVal,
                    it.id,
                    invoiceId,
                  ]
                );
              } else {
                // create new installment
                // Double-check there is no row already with this number
                const dupCheck = await client.query(
                  `SELECT 1 FROM invoice_installments
                   WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL`,
                  [invoiceId, it.installmentNumber]
                );
                if (dupCheck.rows.length > 0) {
                  throw new Error('رقم القسط مكرر ضمن نفس الفاتورة، يرجى اختيار رقم مختلف');
                }
                await client.query(
                  `INSERT INTO invoice_installments
                     (invoice_id, installment_number, planned_amount, due_date, notes, paid_amount, installment_status, paid_date)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [
                    invoiceId,
                    it.installmentNumber,
                    it.plannedAmount,
                    it.dueDate,
                    it.notes || null,
                    targetPaid,
                    targetStatus,
                    paidDateVal,
                  ]
                );
              }
            }
          }

          // Recompute invoice amount_paid from installments (remaining_amount is generated by DB)
          await client.query(
            `WITH sums AS (
               SELECT COALESCE(SUM(GREATEST(ii.paid_amount, 0)), 0) AS paid_sum
               FROM invoice_installments ii
               WHERE ii.invoice_id = $1 AND ii.deleted_at IS NULL
             )
             UPDATE course_invoices ci
             SET amount_paid = s.paid_sum,
                 updated_at = NOW()
             FROM sums s
             WHERE ci.id = $1`,
            [invoiceId]
          );
        }
      }

      // If payment_mode is cash after updates: remove installments and set amount_paid accordingly
      if (updates.paymentMode === 'cash') {
        // Soft-delete installments
        await client.query(
          'UPDATE invoice_installments SET deleted_at = NOW(), updated_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL',
          [invoiceId]
        );
        // Set amount_paid to amount_due - discount_total
        await client.query(
          `UPDATE course_invoices
             SET amount_paid = GREATEST(amount_due - discount_total, 0),
                 updated_at = NOW()
           WHERE id = $1`,
          [invoiceId]
        );
      }

      await client.query('COMMIT');

      // Update final status and return fresh invoice
      await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoiceId);
      return await CourseInvoiceModel.findById(invoiceId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async createInvoice(options: {
    teacherId: string;
    studentId: string;
    courseId: string;
    studyYear: string;
    invoiceType: InvoiceType;
    paymentMode: 'cash' | 'installments';
    amountDue: number;
    discountAmount?: number;
    invoiceDate?: string | null;
    dueDate?: string | null;
    notes?: string | null;
    installments?: Array<{
      installmentNumber: number;
      plannedAmount: number;
      dueDate: string;
      notes?: string;
      paid?: boolean; // if true, mark this installment as fully paid at creation
      paidDate?: string; // optional paid date when paid=true
    }>; // for installments mode only
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
      invoiceDate: options.invoiceDate || null,
      dueDate: options.dueDate || null,
      notes: options.notes || null,
    });

    // Helper: apply discount directly to invoice aggregates
    const applyDiscount = async (amount: number) => {
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
      await CourseInvoiceModel.updateAggregates(invoice.id, {
        discountTotal: val,
      });
    };

    if (options.paymentMode === 'installments') {
      if (!options.installments || options.installments.length === 0) {
        throw new Error(
          'Installments plan is required for installments payment mode'
        );
      }
      const created = await InvoiceInstallmentModel.createMany(
        invoice.id,
        options.installments
      );

      // Apply base discountAmount if provided (invoice-level)
      if (options.discountAmount && options.discountAmount > 0) {
        await applyDiscount(options.discountAmount);
      }

      // If some installments are flagged as paid on creation, apply full payments
      // Validate total (discount + initial paid) does not exceed amount due
      const toInitialPay = created
        .map((c, idx) => ({
          created: c,
          input: options.installments![idx],
        }))
        .filter(x => !!x.input?.paid);

      if (toInitialPay.length > 0) {
        // Compute remaining before initial payments after discount application
        const invAfterDiscount = await CourseInvoiceModel.findById(invoice.id);
        if (!invAfterDiscount) throw new Error('Invoice not found');
        let remaining = Math.max(
          Number(invAfterDiscount.amount_due) -
            (Number(invAfterDiscount.discount_total) + Number(invAfterDiscount.amount_paid)),
          0
        );

        for (const { created: instRow, input } of toInitialPay) {
          const amount = Math.max(Number(instRow.planned_amount || 0), 0);
          if (amount > remaining) {
            throw new Error(
              'إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة'
            );
          }
          // Apply payment to installment and invoice
          await InvoiceInstallmentModel.addPayment(
            instRow.id,
            amount,
            input?.paidDate ? new Date(input.paidDate) : undefined
          );
          await CourseInvoiceModel.updateAggregates(invoice.id, {
            amountPaid: amount,
          });
          remaining = Math.max(remaining - amount, 0);
        }
      }

      // Update final status
      await CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
      return await CourseInvoiceModel.findById(invoice.id);
    }

    // Cash invoice: apply discount then mark as paid fully (remaining = 0)
    const discount = Math.max(Number(options.discountAmount || 0), 0);
    if (discount > 0) await applyDiscount(discount);

    const invFresh = await CourseInvoiceModel.findById(invoice.id);
    if (!invFresh) throw new Error('Invoice not found');
    const toPay = Math.max(
      Number(invFresh.amount_due) - Number(invFresh.discount_total),
      0
    );
    if (toPay > 0) {
      await CourseInvoiceModel.updateAggregates(invoice.id, {
        amountPaid: toPay,
      });
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

    // Only allow installment payments in installments mode
    if (inv.payment_mode !== 'installments') {
      throw new Error('Payments are not allowed for cash invoices');
    }

    if (!options.installmentId) {
      throw new Error('installmentId is required for installment payments');
    }

    // Fetch installment to validate full payment (no partials)
    const instRes = await pool.query(
      'SELECT * FROM invoice_installments WHERE id = $1 AND invoice_id = $2 AND deleted_at IS NULL',
      [options.installmentId, options.invoiceId]
    );
    if (instRes.rows.length === 0) throw new Error('Installment not found');
    const inst = instRes.rows[0];

    // remaining for installment must equal payment amount
    const instRemaining = Math.max(
      Number(inst.planned_amount) - Number(inst.paid_amount || 0),
      0
    );
    if (Number(options.amount) !== instRemaining) {
      throw new Error('يجب سداد القسط كاملاً، لا يُسمح بالدفعات الجزئية');
    }

    // Also ensure invoice remaining can cover the amount
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

    // Apply payment to installment and invoice aggregates
    await InvoiceInstallmentModel.addPayment(
      options.installmentId,
      options.amount,
      options.paidAt || undefined
    );

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

    await CourseInvoiceModel.updateAggregates(options.invoiceId, {
      discountTotal: Math.max(Number(options.amount || 0), 0),
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
    deleted?: 'true' | 'false' | 'all',
    page?: number,
    limit?: number
  ) {
    // Build dynamic query to support deleted filter
    // Keep separate WHERE arrays for count (no alias) and data (with ci.) to avoid ambiguity
    const whereCount: string[] = ['teacher_id = $1', 'study_year = $2'];
    const whereData: string[] = ['ci.teacher_id = $1', 'ci.study_year = $2'];
    const params: any[] = [teacherId, studyYear];
    let i = 3;
    if (status) {
      whereCount.push(`invoice_status = $${i}`);
      whereData.push(`ci.invoice_status = $${i}`);
      params.push(status);
      i++;
    }
    // deleted filter: default exclude deleted (false)
    if (deleted === 'true') {
      whereCount.push('deleted_at IS NOT NULL');
      whereData.push('ci.deleted_at IS NOT NULL');
    } else if (deleted === 'all') {
      // no condition
    } else {
      // undefined or 'false'
      whereCount.push('deleted_at IS NULL');
      whereData.push('ci.deleted_at IS NULL');
    }

    const countQ = `SELECT COUNT(*)::int AS cnt FROM course_invoices WHERE ${whereCount.join(' AND ')}`;
    const countR = await pool.query(countQ, params);
    const total: number = (countR.rows[0]?.cnt as number) || 0;

    // Pagination defaults
    const pageNum = Math.max(Number(page || 1), 1);
    const limitNum = Math.max(Number(limit || 10), 1);
    const offset = (pageNum - 1) * limitNum;

    const dataQ = `
      SELECT
        ci.*,
        u.name AS student_name,
        c.course_name,
        g.name AS grade_name,
        s.name AS subject_name,
        (
          SELECT ss.title
          FROM sessions ss
          JOIN session_attendees sa
            ON sa.session_id = ss.id
           AND sa.student_id = ci.student_id
          WHERE ss.course_id = ci.course_id
            AND ss.is_deleted = false
          ORDER BY ss.created_at DESC NULLS LAST
          LIMIT 1
        ) AS session_title
      FROM course_invoices ci
      JOIN users u ON u.id = ci.student_id AND u.user_type = 'student'
      JOIN courses c ON c.id = ci.course_id
      LEFT JOIN grades g ON g.id = c.grade_id
      LEFT JOIN subjects s ON s.id = c.subject_id
      WHERE ${whereData.join(' AND ')}
      ORDER BY ci.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const dataR = await pool.query(dataQ, [...params, limitNum, offset]);

    return { items: dataR.rows, total };
  }

  static async getTeacherInvoicesSummary(
    teacherId: string,
    studyYear: string,
    status?: InvoiceStatus,
    deleted?: 'true' | 'false' | 'all'
  ) {
    // Build dynamic where similar to listTeacherInvoices
    const where: string[] = ['teacher_id = $1', 'study_year = $2'];
    const params: any[] = [teacherId, studyYear];
    let i = 3;
    if (status) {
      where.push(`invoice_status = $${i++}`);
      params.push(status);
    }
    if (deleted === 'true') where.push('deleted_at IS NOT NULL');
    else if (deleted === 'all') {
      // no condition
    } else {
      where.push('deleted_at IS NULL');
    }

    const q = `
      SELECT
        COALESCE(SUM(amount_due), 0)                        AS total_amount_due,
        COALESCE(SUM(amount_paid), 0)                       AS total_amount_paid,
        COALESCE(SUM(discount_total), 0)                    AS total_discount,
        COALESCE(SUM(remaining_amount), 0)                  AS total_remaining,
        COALESCE(SUM(CASE WHEN invoice_status = 'partial' THEN amount_paid ELSE 0 END), 0) AS partial_paid_total,
        COUNT(*)::int                                       AS total_count,
        SUM(CASE WHEN remaining_amount = 0 THEN 1 ELSE 0 END)::int AS paid_count,
        SUM(CASE WHEN discount_total > 0 THEN 1 ELSE 0 END)::int   AS discount_count,
        SUM(CASE WHEN remaining_amount > 0 THEN 1 ELSE 0 END)::int AS remaining_count
      FROM course_invoices
      WHERE ${where.join(' AND ')}
    `;
    const r = await pool.query(q, params);
    const row = r.rows[0] || {};
    return {
      totalAmount: Number(row.total_amount_due || 0),
      totalPaid: Number(row.total_amount_paid || 0),
      partialPaidTotal: Number(row.partial_paid_total || 0),
      totalDiscount: Number(row.total_discount || 0),
      totalRemaining: Number(row.total_remaining || 0),
      totalCount: Number(row.total_count || 0),
      paidCount: Number(row.paid_count || 0),
      discountCount: Number(row.discount_count || 0),
      remainingCount: Number(row.remaining_count || 0),
    };
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

  static async softDeleteInvoice(teacherId: string, invoiceId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Ensure ownership
      const invRes = await client.query(
        'SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL',
        [invoiceId, teacherId]
      );
      if (invRes.rows.length === 0) {
        throw new Error('Invoice not found or already deleted');
      }
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
      if (invRes.rows.length === 0) {
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

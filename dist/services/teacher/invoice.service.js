"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherInvoiceService = void 0;
const database_1 = __importDefault(require("../../config/database"));
const course_invoice_model_1 = require("../../models/course-invoice.model");
const invoice_installment_model_1 = require("../../models/invoice-installment.model");
class TeacherInvoiceService {
    static async updateInvoice(teacherId, invoiceId, updates) {
        const inv = await course_invoice_model_1.CourseInvoiceModel.findById(invoiceId);
        if (!inv)
            throw new Error('Invoice not found');
        if (String(inv.teacher_id) !== String(teacherId))
            throw new Error('Forbidden');
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const normDate = (d) => {
                if (!d)
                    return null;
                if (typeof d === 'string')
                    return d.slice(0, 10);
                try {
                    return new Date(d).toISOString().slice(0, 10);
                }
                catch {
                    return null;
                }
            };
            if (updates.invoiceDate !== undefined) {
                updates.invoiceDate = normDate(updates.invoiceDate);
            }
            if (updates.dueDate !== undefined) {
                updates.dueDate = normDate(updates.dueDate);
            }
            if (updates.amountDue != null) {
                const newAmount = Math.max(Number(updates.amountDue || 0), 0);
                const minAllowed = Number(inv.discount_total) + Number(inv.amount_paid);
                if (newAmount < minAllowed) {
                    throw new Error('قيمة الفاتورة الجديدة يجب ألا تقل عن مجموع الخصومات والمدفوع');
                }
            }
            const setParts = [];
            const args = [];
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
                return inv;
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
            if (updates.discountAmount !== undefined) {
                const newDiscount = Math.max(Number(updates.discountAmount || 0), 0);
                const fresh = await course_invoice_model_1.CourseInvoiceModel.findById(invoiceId);
                if (!fresh)
                    throw new Error('Invoice not found');
                const maxDiscount = Math.max(Number(fresh.amount_due) - Number(fresh.amount_paid), 0);
                if (newDiscount > maxDiscount) {
                    throw new Error('إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة');
                }
                await client.query(`UPDATE course_invoices
             SET discount_total = $1,
                 updated_at = NOW()
           WHERE id = $2 AND teacher_id = $3`, [newDiscount, invoiceId, teacherId]);
            }
            if (updates.installments || (updates.removeInstallmentIds && updates.removeInstallmentIds.length > 0)) {
                const curInvRes = await client.query('SELECT payment_mode FROM course_invoices WHERE id = $1 AND teacher_id = $2', [invoiceId, teacherId]);
                if (curInvRes.rows.length === 0)
                    throw new Error('Invoice not found');
                const curMode = String(curInvRes.rows[0].payment_mode);
                if (curMode !== 'installments') {
                }
                else {
                    if (updates.removeInstallmentIds && updates.removeInstallmentIds.length > 0) {
                        const placeholders = updates.removeInstallmentIds.map((_, idx) => `$${idx + 3}`).join(', ');
                        await client.query(`UPDATE invoice_installments
                 SET deleted_at = NOW(), updated_at = NOW()
               WHERE invoice_id = $1 AND deleted_at IS NULL AND id IN (${placeholders})`, [invoiceId, teacherId, ...updates.removeInstallmentIds]);
                    }
                    if (updates.installments && updates.installments.length > 0) {
                        for (const it of updates.installments) {
                            let instStatus = (it.status || 'pending');
                            if (!it.status && it.is_paid !== undefined) {
                                instStatus = it.is_paid ? 'paid' : 'pending';
                            }
                            let targetPaid = 0;
                            if (instStatus === 'paid')
                                targetPaid = Math.max(Number(it.plannedAmount || 0), 0);
                            else if (instStatus === 'partial')
                                targetPaid = Math.max(Number(it.paidAmount || 0), 0);
                            else
                                targetPaid = 0;
                            const targetStatus = instStatus;
                            const paidDateVal = targetStatus === 'paid' ? (it.paidDate ? normDate(it.paidDate) : normDate(new Date())) : null;
                            if (!it.id) {
                                const existRes = await client.query(`SELECT id FROM invoice_installments
                   WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL`, [invoiceId, it.installmentNumber]);
                                if (existRes.rows.length > 0) {
                                    it.id = existRes.rows[0].id;
                                }
                            }
                            if (it.id) {
                                const conflict = await client.query(`SELECT 1 FROM invoice_installments
                   WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL AND id <> $3`, [invoiceId, it.installmentNumber, it.id]);
                                if (conflict.rows.length > 0) {
                                    throw new Error('رقم القسط مكرر ضمن نفس الفاتورة، يرجى اختيار رقم مختلف');
                                }
                                await client.query(`UPDATE invoice_installments
                     SET installment_number = $1,
                         planned_amount = $2,
                         due_date = $3,
                         notes = $4,
                         paid_amount = $5,
                         installment_status = $6,
                         paid_date = $7,
                         updated_at = NOW()
                   WHERE id = $8 AND invoice_id = $9`, [
                                    it.installmentNumber,
                                    it.plannedAmount,
                                    it.dueDate,
                                    it.notes || null,
                                    targetPaid,
                                    targetStatus,
                                    paidDateVal,
                                    it.id,
                                    invoiceId,
                                ]);
                            }
                            else {
                                const dupCheck = await client.query(`SELECT 1 FROM invoice_installments
                   WHERE invoice_id = $1 AND installment_number = $2 AND deleted_at IS NULL`, [invoiceId, it.installmentNumber]);
                                if (dupCheck.rows.length > 0) {
                                    throw new Error('رقم القسط مكرر ضمن نفس الفاتورة، يرجى اختيار رقم مختلف');
                                }
                                await client.query(`INSERT INTO invoice_installments
                     (invoice_id, installment_number, planned_amount, due_date, notes, paid_amount, installment_status, paid_date)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                                    invoiceId,
                                    it.installmentNumber,
                                    it.plannedAmount,
                                    it.dueDate,
                                    it.notes || null,
                                    targetPaid,
                                    targetStatus,
                                    paidDateVal,
                                ]);
                            }
                        }
                    }
                    await client.query(`WITH sums AS (
               SELECT COALESCE(SUM(GREATEST(ii.paid_amount, 0)), 0) AS paid_sum
               FROM invoice_installments ii
               WHERE ii.invoice_id = $1 AND ii.deleted_at IS NULL
             )
             UPDATE course_invoices ci
             SET amount_paid = s.paid_sum,
                 updated_at = NOW()
             FROM sums s
             WHERE ci.id = $1`, [invoiceId]);
                }
            }
            if (updates.paymentMode === 'cash') {
                await client.query('UPDATE invoice_installments SET deleted_at = NOW(), updated_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL', [invoiceId]);
                await client.query(`UPDATE course_invoices
             SET amount_paid = GREATEST(amount_due - discount_total, 0),
                 updated_at = NOW()
           WHERE id = $1`, [invoiceId]);
            }
            await client.query('COMMIT');
            await course_invoice_model_1.CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoiceId);
            return await course_invoice_model_1.CourseInvoiceModel.findById(invoiceId);
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    static async createInvoice(options) {
        const invoice = await course_invoice_model_1.CourseInvoiceModel.create({
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
        const applyDiscount = async (amount) => {
            const val = Math.max(Number(amount || 0), 0);
            if (val <= 0)
                return;
            const invFresh = await course_invoice_model_1.CourseInvoiceModel.findById(invoice.id);
            if (!invFresh)
                throw new Error('Invoice not found');
            const remaining = Math.max(Number(invFresh.amount_due) -
                (Number(invFresh.discount_total) + Number(invFresh.amount_paid)), 0);
            if (val > remaining) {
                throw new Error('إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة');
            }
            await course_invoice_model_1.CourseInvoiceModel.updateAggregates(invoice.id, {
                discountTotal: val,
            });
        };
        if (options.paymentMode === 'installments') {
            if (!options.installments || options.installments.length === 0) {
                throw new Error('Installments plan is required for installments payment mode');
            }
            const created = await invoice_installment_model_1.InvoiceInstallmentModel.createMany(invoice.id, options.installments);
            if (options.discountAmount && options.discountAmount > 0) {
                await applyDiscount(options.discountAmount);
            }
            const toInitialPay = created
                .map((c, idx) => ({
                created: c,
                input: options.installments[idx],
            }))
                .filter(x => !!x.input?.paid);
            if (toInitialPay.length > 0) {
                const invAfterDiscount = await course_invoice_model_1.CourseInvoiceModel.findById(invoice.id);
                if (!invAfterDiscount)
                    throw new Error('Invoice not found');
                let remaining = Math.max(Number(invAfterDiscount.amount_due) -
                    (Number(invAfterDiscount.discount_total) + Number(invAfterDiscount.amount_paid)), 0);
                for (const { created: instRow, input } of toInitialPay) {
                    const amount = Math.max(Number(instRow.planned_amount || 0), 0);
                    if (amount > remaining) {
                        throw new Error('إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة');
                    }
                    await invoice_installment_model_1.InvoiceInstallmentModel.addPayment(instRow.id, amount, input?.paidDate ? new Date(input.paidDate) : undefined);
                    await course_invoice_model_1.CourseInvoiceModel.updateAggregates(invoice.id, {
                        amountPaid: amount,
                    });
                    remaining = Math.max(remaining - amount, 0);
                }
            }
            await course_invoice_model_1.CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
            return await course_invoice_model_1.CourseInvoiceModel.findById(invoice.id);
        }
        const discount = Math.max(Number(options.discountAmount || 0), 0);
        if (discount > 0)
            await applyDiscount(discount);
        const invFresh = await course_invoice_model_1.CourseInvoiceModel.findById(invoice.id);
        if (!invFresh)
            throw new Error('Invoice not found');
        const toPay = Math.max(Number(invFresh.amount_due) - Number(invFresh.discount_total), 0);
        if (toPay > 0) {
            await course_invoice_model_1.CourseInvoiceModel.updateAggregates(invoice.id, {
                amountPaid: toPay,
            });
        }
        await course_invoice_model_1.CourseInvoiceModel.updateStatusPaidIfZeroRemaining(invoice.id);
        return await course_invoice_model_1.CourseInvoiceModel.findById(invoice.id);
    }
    static async addPayment(options) {
        const inv = await course_invoice_model_1.CourseInvoiceModel.findById(options.invoiceId);
        if (!inv)
            throw new Error('Invoice not found');
        if (inv.payment_mode !== 'installments') {
            throw new Error('Payments are not allowed for cash invoices');
        }
        if (!options.installmentId) {
            throw new Error('installmentId is required for installment payments');
        }
        const instRes = await database_1.default.query('SELECT * FROM invoice_installments WHERE id = $1 AND invoice_id = $2 AND deleted_at IS NULL', [options.installmentId, options.invoiceId]);
        if (instRes.rows.length === 0)
            throw new Error('Installment not found');
        const inst = instRes.rows[0];
        const instRemaining = Math.max(Number(inst.planned_amount) - Number(inst.paid_amount || 0), 0);
        if (Number(options.amount) !== instRemaining) {
            throw new Error('يجب سداد القسط كاملاً، لا يُسمح بالدفعات الجزئية');
        }
        const remaining = Math.max(Number(inv.amount_due) -
            (Number(inv.discount_total) + Number(inv.amount_paid)), 0);
        if (Number(options.amount) > remaining) {
            throw new Error('إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة');
        }
        await invoice_installment_model_1.InvoiceInstallmentModel.addPayment(options.installmentId, options.amount, options.paidAt || undefined);
        await course_invoice_model_1.CourseInvoiceModel.updateAggregates(options.invoiceId, {
            amountPaid: options.amount,
        });
        const updated = await course_invoice_model_1.CourseInvoiceModel.updateStatusPaidIfZeroRemaining(options.invoiceId);
        return updated;
    }
    static async addDiscount(options) {
        const inv = await course_invoice_model_1.CourseInvoiceModel.findById(options.invoiceId);
        if (!inv)
            throw new Error('Invoice not found');
        const remaining = Math.max(Number(inv.amount_due) -
            (Number(inv.discount_total) + Number(inv.amount_paid)), 0);
        if (Number(options.amount) > remaining) {
            throw new Error('إجمالي الدفعات مع الخصم لا يجب أن يتجاوز المبلغ الأصلي للفاتورة');
        }
        await course_invoice_model_1.CourseInvoiceModel.updateAggregates(options.invoiceId, {
            discountTotal: Math.max(Number(options.amount || 0), 0),
        });
        const updated = await course_invoice_model_1.CourseInvoiceModel.updateStatusPaidIfZeroRemaining(options.invoiceId);
        return updated;
    }
    static async listTeacherInvoices(teacherId, studyYear, status, deleted, page, limit) {
        const whereCount = ['teacher_id = $1', 'study_year = $2'];
        const whereData = ['ci.teacher_id = $1', 'ci.study_year = $2'];
        const params = [teacherId, studyYear];
        let i = 3;
        if (status) {
            whereCount.push(`invoice_status = $${i}`);
            whereData.push(`ci.invoice_status = $${i}`);
            params.push(status);
            i++;
        }
        if (deleted === 'true') {
            whereCount.push('deleted_at IS NOT NULL');
            whereData.push('ci.deleted_at IS NOT NULL');
        }
        else if (deleted === 'all') {
        }
        else {
            whereCount.push('deleted_at IS NULL');
            whereData.push('ci.deleted_at IS NULL');
        }
        const countQ = `SELECT COUNT(*)::int AS cnt FROM course_invoices WHERE ${whereCount.join(' AND ')}`;
        const countR = await database_1.default.query(countQ, params);
        const total = countR.rows[0]?.cnt || 0;
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
        const dataR = await database_1.default.query(dataQ, [...params, limitNum, offset]);
        return { items: dataR.rows, total };
    }
    static async getTeacherInvoicesSummary(teacherId, studyYear, status, deleted) {
        const where = ['teacher_id = $1', 'study_year = $2'];
        const params = [teacherId, studyYear];
        let i = 3;
        if (status) {
            where.push(`invoice_status = $${i++}`);
            params.push(status);
        }
        if (deleted === 'true')
            where.push('deleted_at IS NOT NULL');
        else if (deleted === 'all') {
        }
        else {
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
        const r = await database_1.default.query(q, params);
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
    static async getInvoiceForTeacher(teacherId, invoiceId) {
        const inv = await course_invoice_model_1.CourseInvoiceModel.findById(invoiceId);
        if (!inv || String(inv.teacher_id) !== String(teacherId))
            return null;
        return inv;
    }
    static async listInstallmentsByInvoice(teacherId, invoiceId) {
        const inv = await this.getInvoiceForTeacher(teacherId, invoiceId);
        if (!inv)
            return null;
        return await invoice_installment_model_1.InvoiceInstallmentModel.listByInvoice(invoiceId);
    }
    static async softDeleteInvoice(teacherId, invoiceId) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const invRes = await client.query('SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL', [invoiceId, teacherId]);
            if (invRes.rows.length === 0) {
                throw new Error('Invoice not found or already deleted');
            }
            await client.query('UPDATE invoice_installments SET deleted_at = NOW() WHERE invoice_id = $1 AND deleted_at IS NULL', [invoiceId]);
            await client.query('UPDATE course_invoices SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [invoiceId]);
            await client.query('COMMIT');
            return true;
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    static async restoreInvoice(teacherId, invoiceId) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const invRes = await client.query('SELECT id FROM course_invoices WHERE id = $1 AND teacher_id = $2', [invoiceId, teacherId]);
            if (invRes.rows.length === 0) {
                throw new Error('Invoice not found');
            }
            await client.query('UPDATE course_invoices SET deleted_at = NULL, updated_at = NOW() WHERE id = $1', [invoiceId]);
            await client.query('UPDATE invoice_installments SET deleted_at = NULL WHERE invoice_id = $1', [invoiceId]);
            await client.query('COMMIT');
            return true;
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
}
exports.TeacherInvoiceService = TeacherInvoiceService;
//# sourceMappingURL=invoice.service.js.map
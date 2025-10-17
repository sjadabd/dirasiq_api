"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentInvoiceService = void 0;
const course_invoice_model_1 = require("../../models/course-invoice.model");
const invoice_installment_model_1 = require("../../models/invoice-installment.model");
class StudentInvoiceService {
    static async listInvoices(studentId, options, page = 1, limit = 10) {
        const where = ['ci.student_id = $1', 'ci.deleted_at IS NULL'];
        const params = [studentId];
        let i = 2;
        if (options.studyYear) {
            where.push(`ci.study_year = $${i++}`);
            params.push(options.studyYear);
        }
        if (options.courseId) {
            where.push(`ci.course_id = $${i++}`);
            params.push(options.courseId);
        }
        if (options.status) {
            where.push(`ci.invoice_status = $${i++}`);
            params.push(options.status);
        }
        const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));
        const q = `
      SELECT ci.*, u.name AS teacher_name, c.course_name
      FROM course_invoices ci
      LEFT JOIN users u ON u.id = ci.teacher_id
      LEFT JOIN courses c ON c.id = ci.course_id
      WHERE ${where.join(' AND ')}
      ORDER BY ci.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        const r = await pool.query(q, [
            ...params,
            Math.max(1, Number(limit)),
            offset,
        ]);
        const invoices = r.rows;
        const totals = invoices.reduce((acc, inv) => {
            acc.total_amount_due += Number(inv.amount_due || 0);
            acc.total_discount += Number(inv.discount_total || 0);
            acc.total_paid += Number(inv.amount_paid || 0);
            acc.total_remaining += Number(inv.remaining_amount || 0);
            acc.by_invoices.push({
                id: inv.id,
                course_id: inv.course_id,
                course_name: inv.course_name,
                teacher_id: inv.teacher_id,
                teacher_name: inv.teacher_name,
                amount_due: inv.amount_due,
                discount_total: inv.discount_total,
                amount_paid: inv.amount_paid,
                remaining_amount: inv.remaining_amount,
                invoice_status: inv.invoice_status,
                created_at: inv.created_at,
            });
            return acc;
        }, {
            total_amount_due: 0,
            total_discount: 0,
            total_paid: 0,
            total_remaining: 0,
            by_invoices: [],
        });
        return { invoices, report: totals };
    }
    static async getInvoice(studentId, invoiceId) {
        const invoice = await course_invoice_model_1.CourseInvoiceModel.findById(invoiceId);
        if (!invoice || String(invoice.student_id) !== String(studentId))
            return null;
        return invoice;
    }
    static async getInvoiceFull(studentId, invoiceId) {
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        const iq = `
      SELECT ci.*, u.name AS teacher_name, c.course_name
      FROM course_invoices ci
      LEFT JOIN users u ON u.id = ci.teacher_id
      LEFT JOIN courses c ON c.id = ci.course_id
      WHERE ci.id = $1 AND ci.student_id = $2 AND ci.deleted_at IS NULL
    `;
        const ir = await pool.query(iq, [invoiceId, studentId]);
        const invoice = ir.rows[0];
        if (!invoice)
            return null;
        const installments = await invoice_installment_model_1.InvoiceInstallmentModel.listByInvoice(invoiceId);
        let paymentsRows = [];
        if (invoice.payment_mode === 'installments') {
            paymentsRows = installments.map(inst => ({
                payment_number: inst.installment_number,
                planned_amount: Number(inst.planned_amount || 0),
                paid_amount: Number(inst.paid_amount || 0),
                discount_amount: 0,
                remaining_amount: Number(inst.remaining_amount || 0),
                status: inst.installment_status,
                due_date: inst.due_date,
                paid_date: inst.paid_date,
                installment_id: inst.id,
                notes: inst.notes,
            }));
        }
        else {
            paymentsRows = [
                {
                    payment_number: 1,
                    planned_amount: Number(invoice.amount_due || 0),
                    paid_amount: Number(invoice.amount_paid || 0),
                    discount_amount: Number(invoice.discount_total || 0),
                    remaining_amount: Number(invoice.remaining_amount || 0),
                    status: invoice.invoice_status,
                    due_date: invoice.due_date,
                    paid_date: invoice.paid_date,
                    installment_id: null,
                    notes: invoice.notes,
                },
            ];
        }
        const totals = {
            total_paid: Number(invoice.amount_paid || 0),
            total_discount: Number(invoice.discount_total || 0),
            total_remaining: Number(invoice.remaining_amount || 0),
        };
        return {
            invoice: {
                id: invoice.id,
                course_id: invoice.course_id,
                course_name: invoice.course_name,
                teacher_id: invoice.teacher_id,
                teacher_name: invoice.teacher_name,
                study_year: invoice.study_year,
                invoice_type: invoice.invoice_type,
                payment_mode: invoice.payment_mode,
                created_at: invoice.created_at,
                invoice_date: invoice.invoice_date,
                due_date: invoice.due_date,
                amount_due: Number(invoice.amount_due || 0),
                discount_total: Number(invoice.discount_total || 0),
                amount_paid: Number(invoice.amount_paid || 0),
                remaining_amount: Number(invoice.remaining_amount || 0),
                invoice_status: invoice.invoice_status,
                notes: invoice.notes,
            },
            payments: paymentsRows,
            totals,
        };
    }
    static async listInstallments(studentId, invoiceId) {
        const inv = await this.getInvoice(studentId, invoiceId);
        if (!inv)
            return null;
        return await invoice_installment_model_1.InvoiceInstallmentModel.listByInvoice(invoiceId);
    }
    static async getInstallmentFull(studentId, invoiceId, installmentId) {
        const { default: pool } = await Promise.resolve().then(() => __importStar(require('../../config/database')));
        const iq = `
      SELECT ci.*, u.name AS teacher_name, c.course_name
      FROM course_invoices ci
      LEFT JOIN users u ON u.id = ci.teacher_id
      LEFT JOIN courses c ON c.id = ci.course_id
      WHERE ci.id = $1 AND ci.student_id = $2 AND ci.deleted_at IS NULL
    `;
        const ir = await pool.query(iq, [invoiceId, studentId]);
        const invoice = ir.rows[0];
        if (!invoice)
            return null;
        const installments = await invoice_installment_model_1.InvoiceInstallmentModel.listByInvoice(invoiceId);
        const installment = installments.find(i => String(i.id) === String(installmentId));
        if (!installment)
            return null;
        const totals = {
            total_planned: Number(installment.planned_amount || 0),
            total_paid: Number(installment.paid_amount || 0),
            total_discount: 0,
        };
        totals.total_remaining = Math.max(totals.total_planned - totals.total_paid, 0);
        return {
            invoice: {
                id: invoice.id,
                course_id: invoice.course_id,
                course_name: invoice.course_name,
                teacher_id: invoice.teacher_id,
                teacher_name: invoice.teacher_name,
                study_year: invoice.study_year,
            },
            installment: {
                installment_id: installment.id,
                payment_number: installment.installment_number,
                status: installment.installment_status,
                planned_amount: Number(installment.planned_amount || 0),
                paid_amount: Number(installment.paid_amount || 0),
                remaining_amount: Number(installment.remaining_amount || 0),
                due_date: installment.due_date,
                paid_date: installment.paid_date,
                notes: installment.notes,
            },
            partials: [],
            discounts: [],
            totals,
        };
    }
}
exports.StudentInvoiceService = StudentInvoiceService;
//# sourceMappingURL=invoice.service.js.map
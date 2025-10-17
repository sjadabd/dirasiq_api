"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherInvoiceController = void 0;
const invoice_installment_model_1 = require("../../models/invoice-installment.model");
const notification_model_1 = require("../../models/notification.model");
const invoice_service_1 = require("../../services/teacher/invoice.service");
class TeacherInvoiceController {
    static async updateInvoice(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            const { dueDate, notes, invoiceType, paymentMode, amountDue, studentId, invoiceDate, discountAmount, installments, removeInstallmentIds, } = req.body || {};
            const normalizeDate = (d) => {
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
            const updated = await invoice_service_1.TeacherInvoiceService.updateInvoice(teacherId, invoiceId, (() => {
                const updates = {};
                if (dueDate !== undefined)
                    updates.dueDate = normalizeDate(dueDate);
                if (notes !== undefined)
                    updates.notes = notes || null;
                if (invoiceType !== undefined)
                    updates.invoiceType = invoiceType;
                if (paymentMode !== undefined)
                    updates.paymentMode = paymentMode;
                if (amountDue !== undefined)
                    updates.amountDue = Number(amountDue);
                if (studentId !== undefined)
                    updates.studentId = String(studentId);
                if (invoiceDate !== undefined)
                    updates.invoiceDate = normalizeDate(invoiceDate);
                if (discountAmount !== undefined)
                    updates.discountAmount = Math.max(Number(discountAmount || 0), 0);
                if (Array.isArray(installments))
                    updates.installments = installments.map((it) => {
                        const base = {
                            installmentNumber: Number(it.installmentNumber),
                            plannedAmount: Number(it.plannedAmount),
                            dueDate: String(normalizeDate(it.dueDate)),
                        };
                        if (it.id != null)
                            base.id = String(it.id);
                        if (it.notes !== undefined)
                            base.notes = it.notes != null ? String(it.notes) : null;
                        const paidAmountRaw = it.paidAmount;
                        if (paidAmountRaw != null)
                            base.paidAmount = Math.max(Number(paidAmountRaw || 0), 0);
                        if (it.paidDate !== undefined)
                            base.paidDate = it.paidDate ? String(normalizeDate(it.paidDate)) : null;
                        if (it.is_paid !== undefined) {
                            const isPaid = Boolean(it.is_paid);
                            if (isPaid) {
                                base.status = 'paid';
                                base.paidAmount = Math.max(Number(base.plannedAmount || 0), 0);
                            }
                            else {
                                base.status = 'pending';
                                base.paidAmount = 0;
                                base.paidDate = null;
                            }
                        }
                        else if (it.status !== undefined) {
                            base.status = String(it.status);
                        }
                        else if (base.paidAmount !== undefined) {
                            base.status = base.paidAmount > 0 ? (base.paidAmount >= base.plannedAmount ? 'paid' : 'partial') : 'pending';
                        }
                        return base;
                    });
                if (Array.isArray(removeInstallmentIds))
                    updates.removeInstallmentIds = removeInstallmentIds.map((x) => String(x));
                return updates;
            })());
            const toDateOnly = (d) => {
                if (!d)
                    return null;
                if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
                    return d.slice(0, 10);
                try {
                    return new Date(d).toISOString().slice(0, 10);
                }
                catch {
                    return null;
                }
            };
            const formatted = updated
                ? {
                    ...updated,
                    invoice_date: toDateOnly(updated.invoice_date),
                    due_date: toDateOnly(updated.due_date),
                    paid_date: toDateOnly(updated.paid_date),
                }
                : updated;
            return res.json({
                success: true,
                message: 'Invoice updated',
                data: formatted,
            });
        }
        catch (error) {
            const msg = error?.message || 'Failed to update invoice';
            const code = msg === 'Forbidden' ? 403 : msg.includes('not found') ? 404 : 400;
            return res.status(code).json({ success: false, message: msg });
        }
    }
    static async createInvoice(req, res) {
        try {
            const teacherId = req.user?.id;
            const { studentId, courseId, studyYear, paymentMode, invoiceType = 'course', amountDue, invoiceDate, discountAmount, dueDate, notes, installments, } = req.body || {};
            const normalizeDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
            const normalizedInvoiceDate = normalizeDate(invoiceDate);
            const normalizedDueDate = normalizeDate(dueDate);
            const normalizedInstallments = Array.isArray(installments)
                ? installments.map((it) => ({
                    ...it,
                    dueDate: String(normalizeDate(it.dueDate)),
                    ...(it.paidDate !== undefined
                        ? { paidDate: normalizeDate(it.paidDate) }
                        : {}),
                }))
                : undefined;
            if (!studentId ||
                !courseId ||
                !studyYear ||
                !paymentMode ||
                amountDue == null) {
                return res
                    .status(400)
                    .json({ success: false, message: 'Missing required fields' });
            }
            const createOptions = {
                teacherId,
                studentId,
                courseId,
                studyYear,
                invoiceType: invoiceType,
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
            const invoice = await invoice_service_1.TeacherInvoiceService.createInvoice(createOptions);
            const notificationService = req.app.get('notificationService');
            if (notificationService) {
                await notificationService.createAndSendNotification({
                    title: 'فاتورة جديدة',
                    message: `تم إنشاء فاتورة جديدة بمبلغ ${invoice?.amount_due} دينار`,
                    type: notification_model_1.NotificationType.PAYMENT_REMINDER,
                    recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
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
            const toDateOnly2 = (d) => {
                if (!d)
                    return null;
                if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
                    return d.slice(0, 10);
                try {
                    return new Date(d).toISOString().slice(0, 10);
                }
                catch {
                    return null;
                }
            };
            const formattedInv = invoice
                ? {
                    ...invoice,
                    invoice_date: toDateOnly2(invoice.invoice_date),
                    due_date: toDateOnly2(invoice.due_date),
                    paid_date: toDateOnly2(invoice.paid_date),
                }
                : invoice;
            return res
                .status(201)
                .json({ success: true, message: 'Invoice created', data: formattedInv });
        }
        catch (error) {
            return res
                .status(500)
                .json({
                success: false,
                message: error.message || 'Failed to create invoice',
            });
        }
    }
    static async addPayment(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            const { amount, paymentMethod, installmentId, paidAt, notes, studentId, courseId, studyYear, } = req.body || {};
            if (!amount || !paymentMethod) {
                return res
                    .status(400)
                    .json({
                    success: false,
                    message: 'amount and paymentMethod are required',
                });
            }
            const updated = await invoice_service_1.TeacherInvoiceService.addPayment({
                invoiceId,
                amount: Number(amount),
                paymentMethod: paymentMethod,
                installmentId: installmentId || null,
                paidAt: paidAt ? new Date(paidAt) : new Date(),
                notes: notes || null,
            });
            {
                const inv = await invoice_service_1.TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
                const studentIdFinal = studentId || (inv && inv.student_id);
                const courseIdFinal = courseId || (inv && inv.course_id);
                const studyYearFinal = studyYear || (inv && inv.study_year);
                if (studentIdFinal) {
                    const notificationService = req.app.get('notificationService');
                    if (notificationService) {
                        const rem = Number(updated?.remaining_amount || 0);
                        const paid = Number(amount);
                        const full = rem <= 0;
                        let title = full ? 'تم سداد الفاتورة كاملة' : 'تم تسجيل دفعة';
                        let msg = full
                            ? `تم سداد فاتورتك بالكامل. قيمة الدفعة: ${paid} دينار`
                            : `تم تسجيل دفعة بمبلغ ${paid} دينار. المتبقي على فاتورتك: ${rem} دينار`;
                        let instInfo = undefined;
                        if (installmentId) {
                            const inst = await invoice_installment_model_1.InvoiceInstallmentModel.listByInvoice(invoiceId);
                            const one = inst.find(i => String(i.id) === String(installmentId));
                            if (one)
                                instInfo = {
                                    installmentNumber: one.installment_number,
                                    dueDate: one.due_date,
                                };
                            if (one)
                                msg += ` (القسط رقم ${one.installment_number})`;
                        }
                        await notificationService.createAndSendNotification({
                            title,
                            message: msg,
                            type: notification_model_1.NotificationType.PAYMENT_REMINDER,
                            recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
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
        }
        catch (error) {
            return res
                .status(500)
                .json({
                success: false,
                message: error.message || 'Failed to add payment',
            });
        }
    }
    static async addDiscount(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            const { amount, notes, studentId, courseId, studyYear } = req.body || {};
            if (!amount) {
                return res
                    .status(400)
                    .json({ success: false, message: 'amount is required' });
            }
            const updated = await invoice_service_1.TeacherInvoiceService.addDiscount({
                invoiceId,
                amount: Number(amount),
                notes: notes || null,
            });
            if (studentId) {
                const notificationService = req.app.get('notificationService');
                if (notificationService) {
                    await notificationService.createAndSendNotification({
                        title: 'خصم على الفاتورة',
                        message: `تم إضافة خصم بمبلغ ${amount} دينار على فاتورتك`,
                        type: notification_model_1.NotificationType.PAYMENT_REMINDER,
                        recipientType: notification_model_1.RecipientType.SPECIFIC_STUDENTS,
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
        }
        catch (error) {
            return res
                .status(500)
                .json({
                success: false,
                message: error.message || 'Failed to add discount',
            });
        }
    }
    static async listInvoices(req, res) {
        try {
            const teacherId = req.user?.id;
            const studyYear = req.query['studyYear'] || '';
            const status = req.query['status'];
            const deleted = req.query['deleted'];
            const page = Number(req.query['page'] || 1);
            const limit = Number(req.query['limit'] || 10);
            if (!studyYear) {
                return res
                    .status(400)
                    .json({ success: false, message: 'studyYear is required' });
            }
            const { items, total } = await invoice_service_1.TeacherInvoiceService.listTeacherInvoices(teacherId, studyYear, status, deleted, page, limit);
            const data = (items || []).map((inv) => ({
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
        }
        catch (error) {
            return res
                .status(500)
                .json({
                success: false,
                message: error.message || 'Failed to fetch invoices',
            });
        }
    }
    static async listInstallments(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            const invoice = await invoice_service_1.TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
            if (!invoice)
                return res
                    .status(404)
                    .json({ success: false, message: 'Invoice not found' });
            const installments = await invoice_service_1.TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);
            const toMoney = (n) => Number(n ?? 0).toFixed(2);
            const toDateOnly = (d) => {
                if (!d)
                    return null;
                if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
                    return d.slice(0, 10);
                try {
                    return new Date(d).toISOString().slice(0, 10);
                }
                catch {
                    return null;
                }
            };
            const toIso = (d) => (d ? new Date(d).toISOString() : null);
            const summary = {
                amount_due: toMoney(invoice.amount_due),
                discount_total: toMoney(invoice.discount_total),
                amount_paid: toMoney(invoice.amount_paid),
                remaining_amount: toMoney(invoice.remaining_amount),
                study_year: invoice.study_year,
                payment_mode: invoice.payment_mode,
                invoice_type: invoice.invoice_type,
                invoice_date: toDateOnly(invoice.invoice_date),
                due_date: toDateOnly(invoice.due_date),
                notes: invoice.notes || null,
            };
            return res.json({
                success: true,
                message: 'Invoice details with installments fetched',
                data: {
                    invoice: summary,
                    installments: (installments || []).map((inst) => ({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to fetch installments',
            });
        }
    }
    static async getInvoiceFull(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            const invoice = await invoice_service_1.TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
            if (!invoice)
                return res
                    .status(404)
                    .json({ success: false, message: 'Invoice not found' });
            const installments = await invoice_service_1.TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);
            const toMoneyStr = (n) => Number(n ?? 0).toFixed(2);
            const toMoneyNum = (n) => Number(Number(n ?? 0).toFixed(2));
            const toDateOnly = (d) => {
                if (!d)
                    return null;
                if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
                    return d.slice(0, 10);
                try {
                    return new Date(d).toISOString().slice(0, 10);
                }
                catch {
                    return null;
                }
            };
            const toIso = (d) => (d ? new Date(d).toISOString() : null);
            const summary = {
                amount_due: toMoneyStr(invoice.amount_due),
                discount_total: toMoneyStr(invoice.discount_total),
                amount_paid: toMoneyStr(invoice.amount_paid),
                remaining_amount: toMoneyStr(invoice.remaining_amount),
                study_year: invoice.study_year,
                payment_mode: invoice.payment_mode,
                invoice_type: invoice.invoice_type,
                invoice_date: toDateOnly(invoice.invoice_date),
                due_date: toDateOnly(invoice.due_date),
                notes: invoice.notes || null,
            };
            const items = (installments || []);
            const totals = {
                count: items.length,
                paidCount: items.filter(i => String(i.installment_status) === 'paid').length,
                partialCount: items.filter(i => String(i.installment_status) === 'partial').length,
                pendingCount: items.filter(i => String(i.installment_status) === 'pending').length,
                overdueCount: (() => {
                    const todayStr = toDateOnly(new Date());
                    return items.filter(i => String(i.installment_status) !== 'paid' && (toDateOnly(i.due_date) || '') < todayStr).length;
                })(),
                plannedTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.planned_amount || 0), 0)),
                paidTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.paid_amount || 0), 0)),
                remainingTotal: toMoneyNum(items.reduce((s, i) => s + Number(i.remaining_amount || 0), 0)),
            };
            const installmentsList = items.map((inst) => ({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to fetch invoice',
            });
        }
    }
    static async entriesReport(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            const invoice = await invoice_service_1.TeacherInvoiceService.getInvoiceForTeacher(teacherId, invoiceId);
            if (!invoice)
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            const installments = await invoice_service_1.TeacherInvoiceService.listInstallmentsByInvoice(teacherId, invoiceId);
            const toMoneyNum = (n) => Number(Number(n ?? 0).toFixed(2));
            const toDateOnly = (d) => {
                if (!d)
                    return null;
                if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
                    return d.slice(0, 10);
                try {
                    return new Date(d).toISOString().slice(0, 10);
                }
                catch {
                    return null;
                }
            };
            const today = new Date();
            const todayStr = toDateOnly(today);
            const items = (installments || []);
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
                amount_due: toMoneyNum(invoice.amount_due),
                discount_total: toMoneyNum(invoice.discount_total),
                amount_paid: toMoneyNum(invoice.amount_paid),
                remaining_amount: toMoneyNum(invoice.remaining_amount),
                study_year: invoice.study_year,
                payment_mode: invoice.payment_mode,
                invoice_type: invoice.invoice_type,
                invoice_date: toDateOnly(invoice.invoice_date),
                due_date: toDateOnly(invoice.due_date),
                notes: invoice.notes || null,
            };
            return res.json({
                success: true,
                message: 'Invoice entries report (installments-based) fetched',
                data: { summary, installments: totals },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to fetch report',
            });
        }
    }
    static async softDeleteInvoice(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            await invoice_service_1.TeacherInvoiceService.softDeleteInvoice(teacherId, invoiceId);
            return res.json({ success: true, message: 'Invoice soft-deleted' });
        }
        catch (error) {
            const msg = error?.message || 'Failed to delete invoice';
            const code = msg.includes('not found') ? 404 : 500;
            return res.status(code).json({ success: false, message: msg });
        }
    }
    static async restoreInvoice(req, res) {
        try {
            const teacherId = req.user?.id;
            const { invoiceId } = req.params;
            await invoice_service_1.TeacherInvoiceService.restoreInvoice(teacherId, invoiceId);
            return res.json({ success: true, message: 'Invoice restored' });
        }
        catch (error) {
            const msg = error?.message || 'Failed to restore invoice';
            const code = msg.includes('not found') ? 404 : 500;
            return res.status(code).json({ success: false, message: msg });
        }
    }
    static async invoicesSummary(req, res) {
        try {
            const teacherId = req.user?.id;
            const studyYear = req.query['studyYear'] || '';
            const status = req.query['status'];
            const deleted = req.query['deleted'];
            if (!studyYear) {
                return res
                    .status(400)
                    .json({ success: false, message: 'studyYear is required' });
            }
            const summary = await invoice_service_1.TeacherInvoiceService.getTeacherInvoicesSummary(teacherId, studyYear, status, deleted);
            return res.json({
                success: true,
                message: 'Invoices summary fetched',
                data: summary,
            });
        }
        catch (error) {
            return res
                .status(500)
                .json({
                success: false,
                message: error.message || 'Failed to fetch invoices summary',
            });
        }
    }
}
exports.TeacherInvoiceController = TeacherInvoiceController;
//# sourceMappingURL=invoice.controller.js.map
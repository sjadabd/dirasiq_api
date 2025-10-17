"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherExpenseController = void 0;
const academic_year_model_1 = require("../../models/academic-year.model");
const teacher_expense_model_1 = require("../../models/teacher-expense.model");
class TeacherExpenseController {
    static async create(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const { amount, note, expense_date } = req.body || {};
            const num = Number(amount);
            if (!Number.isFinite(num) || num < 0) {
                res.status(400).json({ success: false, message: 'قيمة المبلغ غير صالحة' });
                return;
            }
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const exp = await teacher_expense_model_1.TeacherExpenseModel.create({ teacherId: String(me.id), amount: num, note: note ?? null, expenseDate: expense_date || null, studyYear: activeYear?.year ?? null });
            res.status(201).json({ success: true, data: exp });
        }
        catch (error) {
            console.error('Error create expense:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async list(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const page = parseInt(String(req.query.page ?? '1'), 10);
            const limit = parseInt(String(req.query.limit ?? '20'), 10);
            const from = req.query.from ? String(req.query.from) : undefined;
            const to = req.query.to ? String(req.query.to) : undefined;
            const studyYear = req.query.studyYear ? String(req.query.studyYear) : undefined;
            const result = await teacher_expense_model_1.TeacherExpenseModel.list(String(me.id), page, limit, from, to, studyYear);
            res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total }, summary: result.summary });
        }
        catch (error) {
            console.error('Error list expenses:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async remove(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const ok = await teacher_expense_model_1.TeacherExpenseModel.softDelete(id, String(me.id));
            if (!ok) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            res.status(200).json({ success: true, message: 'تم الحذف' });
        }
        catch (error) {
            console.error('Error delete expense:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async update(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const { amount, note, expense_date } = req.body || {};
            let numericAmount = undefined;
            if (amount !== undefined) {
                numericAmount = Number(amount);
                if (!Number.isFinite(numericAmount) || numericAmount < 0) {
                    res.status(400).json({ success: false, message: 'قيمة المبلغ غير صالحة' });
                    return;
                }
            }
            const patch = {
                ...(numericAmount !== undefined ? { amount: numericAmount } : {}),
                ...(note !== undefined ? { note: note ?? null } : {}),
                ...(expense_date !== undefined ? { expenseDate: expense_date ?? null } : {}),
            };
            const updated = await teacher_expense_model_1.TeacherExpenseModel.update(id, String(me.id), patch);
            if (!updated) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('Error update expense:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.TeacherExpenseController = TeacherExpenseController;
//# sourceMappingURL=expense.controller.js.map
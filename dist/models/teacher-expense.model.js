"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherExpenseModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class TeacherExpenseModel {
    static async create(input) {
        const q = `
      INSERT INTO teacher_expenses (teacher_id, study_year, amount, note, expense_date)
      VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))
      RETURNING *
    `;
        const r = await database_1.default.query(q, [input.teacherId, input.studyYear ?? null, input.amount, input.note ?? null, input.expenseDate ?? null]);
        return r.rows[0];
    }
    static async softDelete(id, teacherId) {
        const q = `UPDATE teacher_expenses SET deleted_at = NOW() WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`;
        const r = await database_1.default.query(q, [id, teacherId]);
        return (r.rowCount ?? 0) > 0;
    }
    static async list(teacherId, page = 1, limit = 20, from, to, studyYear) {
        const offset = (page - 1) * limit;
        const conds = ['teacher_id = $1', 'deleted_at IS NULL'];
        const params = [teacherId];
        let p = 2;
        if (studyYear) {
            conds.push(`study_year = $${p++}`);
            params.push(studyYear);
        }
        if (from) {
            conds.push(`expense_date >= $${p++}::date`);
            params.push(from);
        }
        if (to) {
            conds.push(`expense_date <= $${p++}::date`);
            params.push(to);
        }
        const where = 'WHERE ' + conds.join(' AND ');
        const dataQ = `SELECT * FROM teacher_expenses ${where} ORDER BY expense_date DESC, created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
        const rows = (await database_1.default.query(dataQ, [...params, limit, offset])).rows;
        const countQ = `SELECT COUNT(*)::int AS c FROM teacher_expenses ${where}`;
        const total = parseInt((await database_1.default.query(countQ, params)).rows[0].c);
        const sumQ = `SELECT COALESCE(SUM(amount),0)::decimal AS total_amount FROM teacher_expenses ${where}`;
        const totalAmount = Number((await database_1.default.query(sumQ, params)).rows[0].total_amount);
        return { data: rows, total, summary: { totalAmount } };
    }
    static async sum(teacherId, from, to, studyYear) {
        const conds = ['teacher_id = $1', 'deleted_at IS NULL'];
        const params = [teacherId];
        let p = 2;
        if (studyYear) {
            conds.push(`study_year = $${p++}`);
            params.push(studyYear);
        }
        if (from) {
            conds.push(`expense_date >= $${p++}`);
            params.push(from);
        }
        if (to) {
            conds.push(`expense_date <= $${p++}`);
            params.push(to);
        }
        const where = 'WHERE ' + conds.join(' AND ');
        const q = `SELECT COALESCE(SUM(amount),0)::decimal AS total_amount FROM teacher_expenses ${where}`;
        const r = await database_1.default.query(q, params);
        return Number(r.rows[0].total_amount);
    }
    static async update(id, teacherId, patch) {
        const sets = [];
        const params = [];
        let p = 1;
        if (patch.amount !== undefined) {
            sets.push(`amount = $${p++}`);
            params.push(patch.amount);
        }
        if (patch.note !== undefined) {
            sets.push(`note = $${p++}`);
            params.push(patch.note);
        }
        if (patch.expenseDate !== undefined) {
            sets.push(`expense_date = $${p++}::date`);
            params.push(patch.expenseDate);
        }
        if (patch.studyYear !== undefined) {
            sets.push(`study_year = $${p++}`);
            params.push(patch.studyYear);
        }
        if (sets.length === 0) {
            const r0 = await database_1.default.query('SELECT * FROM teacher_expenses WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL', [id, teacherId]);
            return r0.rows[0] || null;
        }
        sets.push('updated_at = NOW()');
        const q = `UPDATE teacher_expenses SET ${sets.join(', ')} WHERE id = $${p} AND teacher_id = $${p + 1} AND deleted_at IS NULL RETURNING *`;
        params.push(id, teacherId);
        const r = await database_1.default.query(q, params);
        return r.rows[0] || null;
    }
}
exports.TeacherExpenseModel = TeacherExpenseModel;
//# sourceMappingURL=teacher-expense.model.js.map
import pool from '../config/database';

export interface TeacherExpense {
  id: string;
  teacher_id: string;
  study_year?: string | null;
  amount: number;
  note?: string | null;
  expense_date: string; // YYYY-MM-DD
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export class TeacherExpenseModel {
  static async create(input: { teacherId: string; amount: number; note?: string | null; expenseDate?: string | null; studyYear?: string | null; }): Promise<TeacherExpense> {
    const q = `
      INSERT INTO teacher_expenses (teacher_id, study_year, amount, note, expense_date)
      VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))
      RETURNING *
    `;
    const r = await pool.query(q, [input.teacherId, input.studyYear ?? null, input.amount, input.note ?? null, input.expenseDate ?? null]);
    return r.rows[0];
  }

  static async softDelete(id: string, teacherId: string): Promise<boolean> {
    const q = `UPDATE teacher_expenses SET deleted_at = NOW() WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`;
    const r = await pool.query(q, [id, teacherId]);
    return (r.rowCount ?? 0) > 0;
  }

  static async list(teacherId: string, page = 1, limit = 20, from?: string, to?: string, studyYear?: string) {
    const offset = (page - 1) * limit;
    const conds: string[] = ['teacher_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [teacherId];
    let p = 2;
    if (studyYear) { conds.push(`study_year = $${p++}`); params.push(studyYear); }
    if (from) { conds.push(`expense_date >= $${p++}::date`); params.push(from); }
    if (to) { conds.push(`expense_date <= $${p++}::date`); params.push(to); }
    const where = 'WHERE ' + conds.join(' AND ');

    const dataQ = `SELECT * FROM teacher_expenses ${where} ORDER BY expense_date DESC, created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
    const rows = (await pool.query(dataQ, [...params, limit, offset])).rows as TeacherExpense[];

    const countQ = `SELECT COUNT(*)::int AS c FROM teacher_expenses ${where}`;
    const total = parseInt((await pool.query(countQ, params)).rows[0].c);

    const sumQ = `SELECT COALESCE(SUM(amount),0)::decimal AS total_amount FROM teacher_expenses ${where}`;
    const totalAmount = Number((await pool.query(sumQ, params)).rows[0].total_amount);

    return { data: rows, total, summary: { totalAmount } };
  }

  static async sum(teacherId: string, from?: string, to?: string, studyYear?: string): Promise<number> {
    const conds: string[] = ['teacher_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [teacherId];
    let p = 2;
    if (studyYear) { conds.push(`study_year = $${p++}`); params.push(studyYear); }
    if (from) { conds.push(`expense_date >= $${p++}`); params.push(from); }
    if (to) { conds.push(`expense_date <= $${p++}`); params.push(to); }
    const where = 'WHERE ' + conds.join(' AND ');
    const q = `SELECT COALESCE(SUM(amount),0)::decimal AS total_amount FROM teacher_expenses ${where}`;
    const r = await pool.query(q, params);
    return Number(r.rows[0].total_amount);
  }

  static async update(id: string, teacherId: string, patch: { amount?: number; note?: string | null; expenseDate?: string | null; studyYear?: string | null; }): Promise<TeacherExpense | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (patch.amount !== undefined) { sets.push(`amount = $${p++}`); params.push(patch.amount); }
    if (patch.note !== undefined) { sets.push(`note = $${p++}`); params.push(patch.note); }
    if (patch.expenseDate !== undefined) { sets.push(`expense_date = $${p++}::date`); params.push(patch.expenseDate); }
    if (patch.studyYear !== undefined) { sets.push(`study_year = $${p++}`); params.push(patch.studyYear); }
    if (sets.length === 0) {
      const r0 = await pool.query('SELECT * FROM teacher_expenses WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL', [id, teacherId]);
      return r0.rows[0] || null;
    }
    sets.push('updated_at = NOW()');
    const q = `UPDATE teacher_expenses SET ${sets.join(', ')} WHERE id = $${p} AND teacher_id = $${p + 1} AND deleted_at IS NULL RETURNING *`;
    params.push(id, teacherId);
    const r = await pool.query(q, params);
    return r.rows[0] || null;
  }
}

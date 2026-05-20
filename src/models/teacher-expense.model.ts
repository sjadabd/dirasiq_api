import pool from '../config/database';

export type ExpenseCategory =
  | 'salaries' | 'rent' | 'utilities' | 'maintenance' | 'stationery' | 'other';
export type ExpensePaymentMethod = 'cash' | 'bank_transfer' | 'card';

export interface TeacherExpense {
  id: string;
  teacher_id: string;
  study_year?: string | null;
  amount: number;
  note?: string | null;
  expense_date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  payment_method: ExpensePaymentMethod;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface ExpenseListFilters {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  studyYear?: string;
  category?: ExpenseCategory;
  paymentMethod?: ExpensePaymentMethod;
  search?: string;
  deleted?: boolean;
}

export interface ExpenseSummary {
  totalAmount: number;
  count: number;
  byCategory: Record<string, number>;
}

export class TeacherExpenseModel {
  static async create(input: {
    teacherId: string;
    amount: number;
    note?: string | null;
    expenseDate?: string | null;
    studyYear?: string | null;
    category?: ExpenseCategory;
    paymentMethod?: ExpensePaymentMethod;
  }): Promise<TeacherExpense> {
    const q = `
      INSERT INTO teacher_expenses
        (teacher_id, study_year, amount, note, expense_date, category, payment_method)
      VALUES
        ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), COALESCE($6, 'other'), COALESCE($7, 'cash'))
      RETURNING *
    `;
    const r = await pool.query(q, [
      input.teacherId,
      input.studyYear ?? null,
      input.amount,
      input.note ?? null,
      input.expenseDate ?? null,
      input.category ?? null,
      input.paymentMethod ?? null,
    ]);
    return r.rows[0];
  }

  static async softDelete(id: string, teacherId: string): Promise<boolean> {
    const q = `UPDATE teacher_expenses
               SET deleted_at = NOW()
               WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL`;
    const r = await pool.query(q, [id, teacherId]);
    return (r.rowCount ?? 0) > 0;
  }

  static async restore(id: string, teacherId: string): Promise<TeacherExpense | null> {
    const q = `UPDATE teacher_expenses
               SET deleted_at = NULL, updated_at = NOW()
               WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NOT NULL
               RETURNING *`;
    const r = await pool.query(q, [id, teacherId]);
    return r.rows[0] || null;
  }

  static async list(teacherId: string, filters: ExpenseListFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;
    const conds: string[] = ['teacher_id = $1'];
    const params: any[] = [teacherId];
    let p = 2;

    conds.push(filters.deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL');

    if (filters.studyYear)   { conds.push(`study_year = $${p++}`);        params.push(filters.studyYear); }
    if (filters.from)        { conds.push(`expense_date >= $${p++}::date`); params.push(filters.from); }
    if (filters.to)          { conds.push(`expense_date <= $${p++}::date`); params.push(filters.to); }
    if (filters.category)    { conds.push(`category = $${p++}`);          params.push(filters.category); }
    if (filters.paymentMethod) { conds.push(`payment_method = $${p++}`);  params.push(filters.paymentMethod); }
    if (filters.search?.trim()) {
      conds.push(`note ILIKE $${p++}`);
      params.push(`%${filters.search.trim()}%`);
    }
    const where = 'WHERE ' + conds.join(' AND ');

    const dataQ = `SELECT * FROM teacher_expenses ${where}
                   ORDER BY expense_date DESC, created_at DESC
                   LIMIT $${p} OFFSET $${p + 1}`;
    const rows = (await pool.query(dataQ, [...params, limit, offset])).rows as TeacherExpense[];

    const countQ = `SELECT COUNT(*)::int AS c FROM teacher_expenses ${where}`;
    const total = parseInt((await pool.query(countQ, params)).rows[0].c, 10);

    const sumQ = `SELECT
                    COALESCE(SUM(amount), 0)::decimal AS total_amount,
                    category
                  FROM teacher_expenses ${where}
                  GROUP BY category`;
    const sumRows = (await pool.query(sumQ, params)).rows as Array<{ total_amount: string; category: string }>;
    const byCategory: Record<string, number> = {};
    let totalAmount = 0;
    for (const row of sumRows) {
      const n = Number(row.total_amount);
      byCategory[row.category] = n;
      totalAmount += n;
    }

    const summary: ExpenseSummary = { totalAmount, count: total, byCategory };
    return { data: rows, total, summary };
  }

  static async sum(teacherId: string, from?: string, to?: string, studyYear?: string): Promise<number> {
    const conds: string[] = ['teacher_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [teacherId];
    let p = 2;
    if (studyYear) { conds.push(`study_year = $${p++}`); params.push(studyYear); }
    if (from)      { conds.push(`expense_date >= $${p++}`); params.push(from); }
    if (to)        { conds.push(`expense_date <= $${p++}`); params.push(to); }
    const where = 'WHERE ' + conds.join(' AND ');
    const q = `SELECT COALESCE(SUM(amount), 0)::decimal AS total_amount FROM teacher_expenses ${where}`;
    const r = await pool.query(q, params);
    return Number(r.rows[0].total_amount);
  }

  static async update(id: string, teacherId: string, patch: {
    amount?: number;
    note?: string | null;
    expenseDate?: string | null;
    studyYear?: string | null;
    category?: ExpenseCategory;
    paymentMethod?: ExpensePaymentMethod;
  }): Promise<TeacherExpense | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (patch.amount !== undefined)        { sets.push(`amount = $${p++}`);             params.push(patch.amount); }
    if (patch.note !== undefined)          { sets.push(`note = $${p++}`);               params.push(patch.note); }
    if (patch.expenseDate !== undefined)   { sets.push(`expense_date = $${p++}::date`); params.push(patch.expenseDate); }
    if (patch.studyYear !== undefined)     { sets.push(`study_year = $${p++}`);         params.push(patch.studyYear); }
    if (patch.category !== undefined)      { sets.push(`category = $${p++}`);           params.push(patch.category); }
    if (patch.paymentMethod !== undefined) { sets.push(`payment_method = $${p++}`);     params.push(patch.paymentMethod); }
    if (sets.length === 0) {
      const r0 = await pool.query(
        'SELECT * FROM teacher_expenses WHERE id = $1 AND teacher_id = $2 AND deleted_at IS NULL',
        [id, teacherId],
      );
      return r0.rows[0] || null;
    }
    sets.push('updated_at = NOW()');
    const q = `UPDATE teacher_expenses SET ${sets.join(', ')}
               WHERE id = $${p} AND teacher_id = $${p + 1} AND deleted_at IS NULL
               RETURNING *`;
    params.push(id, teacherId);
    const r = await pool.query(q, params);
    return r.rows[0] || null;
  }
}

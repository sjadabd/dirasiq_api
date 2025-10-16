import pool from '../config/database';

export type EvalRating = 'excellent' | 'very_good' | 'good' | 'fair' | 'weak';

export interface StudentEvaluation {
  id: string;
  student_id: string;
  teacher_id: string;
  eval_date: string; // ISO string
  scientific_level: EvalRating;
  behavioral_level: EvalRating;
  attendance_level: EvalRating;
  homework_preparation: EvalRating;
  participation_level: EvalRating;
  instruction_following: EvalRating;
  guidance?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export class StudentEvaluationModel {
  static async upsertMany(
    teacherId: string,
    evalDate: string,
    items: Array<{
      student_id: string;
      scientific_level: EvalRating;
      behavioral_level: EvalRating;
      attendance_level: EvalRating;
      homework_preparation: EvalRating;
      participation_level: EvalRating;
      instruction_following: EvalRating;
      guidance?: string | null;
      notes?: string | null;
    }>
  ): Promise<StudentEvaluation[]> {
    if (!items || items.length === 0) return [];
    const rows: StudentEvaluation[] = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const it of items) {
        const q = `
          INSERT INTO student_evaluations (
            student_id, teacher_id, eval_date, eval_date_date,
            scientific_level, behavioral_level, attendance_level,
            homework_preparation, participation_level, instruction_following,
            guidance, notes, created_at, updated_at
          ) VALUES (
            $1, $2, $3, DATE($3),
            $4, $5, $6,
            $7, $8, $9,
            $10, $11, NOW(), NOW()
          )
          ON CONFLICT (student_id, teacher_id, eval_date_date)
          DO UPDATE SET
            scientific_level = EXCLUDED.scientific_level,
            behavioral_level = EXCLUDED.behavioral_level,
            attendance_level = EXCLUDED.attendance_level,
            homework_preparation = EXCLUDED.homework_preparation,
            participation_level = EXCLUDED.participation_level,
            instruction_following = EXCLUDED.instruction_following,
            guidance = EXCLUDED.guidance,
            notes = EXCLUDED.notes,
            eval_date = EXCLUDED.eval_date,
            updated_at = NOW()
          RETURNING *;
        `;
        const r = await client.query(q, [
          it.student_id,
          teacherId,
          evalDate,
          it.scientific_level,
          it.behavioral_level,
          it.attendance_level,
          it.homework_preparation,
          it.participation_level,
          it.instruction_following,
          it.guidance ?? null,
          it.notes ?? null,
        ]);
        rows.push(r.rows[0]);
      }
      await client.query('COMMIT');
      return rows;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async update(id: string, patch: Partial<StudentEvaluation>): Promise<StudentEvaluation | null> {
    // dynamic update builder
    const fields: string[] = [];
    const values: any[] = [];
    let p = 1;

    const setField = (name: keyof StudentEvaluation, val: any) => {
      fields.push(`${name} = $${p}`);
      values.push(val);
      p++;
    };

    const allowed: (keyof StudentEvaluation)[] = [
      'scientific_level', 'behavioral_level', 'attendance_level', 'homework_preparation', 'participation_level', 'instruction_following', 'guidance', 'notes', 'eval_date'
    ];
    for (const key of allowed) {
      const v = (patch as any)[key];
      if (v !== undefined) setField(key, v);
    }

    if (fields.length === 0) {
      const r0 = await pool.query('SELECT * FROM student_evaluations WHERE id = $1', [id]);
      return r0.rows[0] || null;
    }

    // If eval_date changed, update eval_date_date accordingly
    if ((patch as any).eval_date !== undefined) {
      fields.push(`eval_date_date = DATE($${p - 1})`); // uses same param as eval_date
    }

    const q = `
      UPDATE student_evaluations
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${p}
      RETURNING *;
    `;
    values.push(id);
    const r = await pool.query(q, values);
    return r.rows[0] || null;
  }

  static async getById(id: string): Promise<StudentEvaluation | null> {
    const r = await pool.query('SELECT * FROM student_evaluations WHERE id = $1', [id]);
    return r.rows[0] || null;
  }

  static async listForTeacher(
    teacherId: string,
    options: { studentId?: string; from?: string; to?: string; page?: number; limit?: number }
  ): Promise<{ data: StudentEvaluation[]; total: number; }> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const offset = (page - 1) * limit;

    const where: string[] = ['teacher_id = $1'];
    const vals: any[] = [teacherId];
    let p = 2;

    if (options.studentId) { where.push(`student_id = $${p}`); vals.push(options.studentId); p++; }
    if (options.from) { where.push(`eval_date_date >= $${p}`); vals.push(options.from); p++; }
    if (options.to) { where.push(`eval_date_date <= $${p}`); vals.push(options.to); p++; }

    const dataQ = `SELECT * FROM student_evaluations WHERE ${where.join(' AND ')} ORDER BY eval_date_date DESC, created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
    const data = (await pool.query(dataQ, [...vals, limit, offset])).rows;

    const countQ = `SELECT COUNT(*)::int AS c FROM student_evaluations WHERE ${where.join(' AND ')}`;
    const total = (await pool.query(countQ, vals)).rows[0].c as number;

    return { data, total };
  }

  static async listForStudent(
    studentId: string,
    options: { from?: string; to?: string; page?: number; limit?: number }
  ): Promise<{ data: StudentEvaluation[]; total: number; }> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const offset = (page - 1) * limit;

    const where: string[] = ['student_id = $1'];
    const vals: any[] = [studentId];
    let p = 2;

    if (options.from) { where.push(`eval_date_date >= $${p}`); vals.push(options.from); p++; }
    if (options.to) { where.push(`eval_date_date <= $${p}`); vals.push(options.to); p++; }

    const dataQ = `SELECT * FROM student_evaluations WHERE ${where.join(' AND ')} ORDER BY eval_date_date DESC, created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
    const data = (await pool.query(dataQ, [...vals, limit, offset])).rows;

    const countQ = `SELECT COUNT(*)::int AS c FROM student_evaluations WHERE ${where.join(' AND ')}`;
    const total = (await pool.query(countQ, vals)).rows[0].c as number;

    return { data, total };
  }
}

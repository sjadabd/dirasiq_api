import pool from '../config/database';

export type ExamType = 'daily' | 'monthly';

export interface Exam {
  id: string;
  course_id: string;
  subject_id: string;
  teacher_id: string;
  exam_date: string;
  exam_type: ExamType;
  max_score: number;
  description?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamGrade {
  id: string;
  exam_id: string;
  student_id: string;
  score: number;
  graded_at?: string | null;
  graded_by?: string | null;
}

export class ExamModel {
  static async create(data: Partial<Exam> & { teacher_id: string }): Promise<Exam> {
    const q = `
      INSERT INTO exams (course_id, subject_id, teacher_id, exam_date, exam_type, max_score, description, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;
    `;
    const r = await pool.query(q, [
      data.course_id,
      data.subject_id,
      data.teacher_id,
      data.exam_date,
      data.exam_type,
      data.max_score,
      data.description ?? null,
      data.notes ?? null,
    ]);
    return r.rows[0];
  }

  static async update(id: string, patch: Partial<Exam>): Promise<Exam | null> {
    const q = `
      UPDATE exams SET
        exam_date = COALESCE($2, exam_date),
        exam_type = COALESCE($3, exam_type),
        max_score = COALESCE($4, max_score),
        description = COALESCE($5, description),
        notes = COALESCE($6, notes),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const r = await pool.query(q, [
      id,
      patch.exam_date ?? null,
      patch.exam_type ?? null,
      patch.max_score ?? null,
      patch.description ?? null,
      patch.notes ?? null,
    ]);
    return r.rows[0] || null;
  }

  static async remove(id: string): Promise<boolean> {
    const r = await pool.query('DELETE FROM exams WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  static async getById(id: string): Promise<Exam | null> {
    const q = `
      SELECT
        e.*,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', s.id::text,
              'title', s.title,
              'weekday', s.weekday,
              'start_time', s.start_time,
              'end_time', s.end_time,
              'state', s.state
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS sessions
      FROM exams e
      LEFT JOIN exam_sessions es ON es.exam_id = e.id
      LEFT JOIN sessions s ON s.id = es.session_id AND s.is_deleted = false
      WHERE e.id = $1
      GROUP BY e.id
    `;
    const r = await pool.query(q, [id]);
    return r.rows[0] || null;
  }

  static async listByTeacher(teacherId: string, page = 1, limit = 20, type?: ExamType): Promise<{ data: Exam[]; total: number; }> {
    const offset = (page - 1) * limit;
    const params: any[] = [teacherId];
    let where = 'e.teacher_id = $1';
    if (type) { params.push(type); where += ` AND e.exam_type = $${params.length}`; }
    params.push(limit, offset);
    const dataQ = `
      SELECT
        e.*,
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', s.id::text,
              'title', s.title,
              'weekday', s.weekday,
              'start_time', s.start_time,
              'end_time', s.end_time,
              'state', s.state
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS sessions
      FROM exams e
      LEFT JOIN exam_sessions es ON es.exam_id = e.id
      LEFT JOIN sessions s ON s.id = es.session_id AND s.is_deleted = false
      WHERE ${where}
      GROUP BY e.id
      ORDER BY e.exam_date DESC, e.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const rows = (await pool.query(dataQ, params)).rows;
    const cntParams: any[] = [teacherId];
    let cntWhere = 'teacher_id = $1';
    if (type) { cntParams.push(type); cntWhere += ` AND exam_type = $${cntParams.length}`; }
    const total = parseInt((await pool.query(`SELECT COUNT(*)::int AS c FROM exams WHERE ${cntWhere}`, cntParams)).rows[0].c);
    return { data: rows, total };
  }

  static async listForStudent(studentId: string, page = 1, limit = 20, type?: ExamType): Promise<{ data: Exam[]; total: number; }> {
    const offset = (page - 1) * limit;
    const params: any[] = [studentId];
    // Visible if: confirmed course booking with same course/teacher OR student is in any linked sessions OR has a grade
    const whereCourse = `EXISTS (
      SELECT 1 FROM course_bookings cb
      WHERE cb.student_id = $1 AND cb.course_id = e.course_id AND cb.teacher_id = e.teacher_id AND cb.status = 'confirmed' AND cb.is_deleted = false
    )`;
    const whereSession = `OR EXISTS (
      SELECT 1 FROM exam_sessions es
      JOIN session_attendees sa ON sa.session_id = es.session_id AND sa.student_id = $1
      WHERE es.exam_id = e.id
    )`;
    const whereGrade = `OR EXISTS (
      SELECT 1 FROM exam_grades eg WHERE eg.student_id = $1 AND eg.exam_id = e.id
    )`;
    let where = `(${whereCourse} ${whereSession} ${whereGrade})`;
    if (type) { params.push(type); where += ` AND e.exam_type = $${params.length}`; }
    params.push(limit, offset);
    const dataQ = `SELECT e.* FROM exams e WHERE ${where} ORDER BY e.exam_date DESC, e.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = (await pool.query(dataQ, params)).rows;
    const cntParams: any[] = [studentId];
    let cntWhere = `(${whereCourse} ${whereSession} ${whereGrade})`;
    if (type) { cntParams.push(type); cntWhere += ` AND e.exam_type = $${cntParams.length}`; }
    const total = parseInt((await pool.query(`SELECT COUNT(*)::int AS c FROM exams e WHERE ${cntWhere}`, cntParams)).rows[0].c);
    return { data: rows, total };
  }

  static async setGrade(examId: string, studentId: string, score: number, gradedBy: string): Promise<ExamGrade> {
    const q = `
      INSERT INTO exam_grades (exam_id, student_id, score, graded_at, graded_by)
      VALUES ($1,$2,$3,NOW(),$4)
      ON CONFLICT (exam_id, student_id) DO UPDATE SET score = EXCLUDED.score, graded_at = NOW(), graded_by = EXCLUDED.graded_by
      RETURNING *;
    `;
    const r = await pool.query(q, [examId, studentId, score, gradedBy]);
    return r.rows[0];
  }

  static async getGrade(examId: string, studentId: string): Promise<ExamGrade | null> {
    const r = await pool.query('SELECT * FROM exam_grades WHERE exam_id=$1 AND student_id=$2', [examId, studentId]);
    return r.rows[0] || null;
  }

  static async listGrades(examId: string): Promise<ExamGrade[]> {
    const r = await pool.query('SELECT * FROM exam_grades WHERE exam_id=$1 ORDER BY graded_at DESC NULLS LAST, created_at DESC NULLS LAST', [examId]);
    return r.rows;
  }

  static async listStudentsForExam(exam: Exam): Promise<{ id: string; name: string }[]> {
    // Prefer linked sessions; if none, fallback to course confirmed bookings
    const qSessions = `
      SELECT DISTINCT u.id::text AS id, u.name AS name
      FROM exam_sessions es
      JOIN session_attendees sa ON sa.session_id = es.session_id
      JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
      WHERE es.exam_id = $1
      ORDER BY u.name ASC
    `;
    const srows = (await pool.query(qSessions, [String(exam.id)])).rows;
    if (srows.length > 0) return srows;
    const qCourse = `
      SELECT u.id::text AS id, u.name AS name
      FROM course_bookings cb
      JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
      WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
      ORDER BY u.name ASC
    `;
    const rows = (await pool.query(qCourse, [String(exam.course_id), String(exam.teacher_id)])).rows;
    return rows;
  }

  static async addExamSessions(examId: string, sessionIds: string[]): Promise<number> {
    if (!sessionIds || sessionIds.length === 0) return 0;
    const values: any[] = [];
    const params: string[] = [];
    let p = 1;
    for (const sid of sessionIds) {
      values.push(examId, sid);
      params.push(`($${p}, $${p + 1})`);
      p += 2;
    }
    const q = `INSERT INTO exam_sessions (exam_id, session_id) VALUES ${params.join(', ')} ON CONFLICT DO NOTHING`;
    const r = await pool.query(q, values);
    return r.rowCount || 0;
  }
}

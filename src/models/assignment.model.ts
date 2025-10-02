import pool from '@/config/database';

export type SubmissionType = 'text' | 'file' | 'link' | 'mixed';
export type Visibility = 'all_students' | 'group' | 'specific_students';
export type SubmissionStatus = 'submitted' | 'late' | 'graded' | 'returned';

export interface Assignment {
  id: string;
  course_id: string;
  subject_id?: string | null;
  session_id?: string | null;
  teacher_id: string;
  title: string;
  description?: string | null;
  assigned_date: string; // ISO
  due_date?: string | null;
  submission_type: SubmissionType;
  attachments: any;
  resources: any;
  max_score: number;
  is_active: boolean;
  visibility: Visibility;
  study_year?: string | null;
  grade_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  created_by: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  submitted_at?: string | null;
  status: SubmissionStatus;
  content_text?: string | null;
  link_url?: string | null;
  attachments: any;
  score?: number | null;
  graded_at?: string | null;
  graded_by?: string | null;
  feedback?: string | null;
  created_at: string;
  updated_at: string;
}

export class AssignmentModel {
  static async create(data: Partial<Assignment> & { created_by: string }): Promise<Assignment> {
    const q = `
      INSERT INTO assignments (
        course_id, subject_id, session_id, teacher_id,
        title, description, assigned_date, due_date, submission_type,
        attachments, resources, max_score, is_active, visibility,
        study_year, grade_id, created_by
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,COALESCE($7, NOW()),$8,$9,
        COALESCE($10,'{}'::jsonb),COALESCE($11,'[]'::jsonb),$12,COALESCE($13,true),$14,
        $15,$16,$17
      ) RETURNING *;
    `;
    const vals = [
      data.course_id,
      data.subject_id ?? null,
      data.session_id ?? null,
      data.teacher_id,
      data.title,
      data.description ?? null,
      data.assigned_date ?? null,
      data.due_date ?? null,
      data.submission_type ?? 'mixed',
      JSON.stringify(data.attachments ?? {}),
      JSON.stringify(data.resources ?? []),
      data.max_score ?? 100,
      data.is_active ?? true,
      data.visibility ?? 'all_students',
      data.study_year ?? null,
      data.grade_id ?? null,
      data.created_by,
    ];
    const r = await pool.query(q, vals);
    return r.rows[0];
  }

  static async update(id: string, patch: Partial<Assignment>): Promise<Assignment | null> {
    // Simple patch for common fields
    const q = `
      UPDATE assignments SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        due_date = COALESCE($4, due_date),
        submission_type = COALESCE($5, submission_type),
        attachments = COALESCE($6, attachments),
        resources = COALESCE($7, resources),
        max_score = COALESCE($8, max_score),
        is_active = COALESCE($9, is_active),
        visibility = COALESCE($10, visibility),
        study_year = COALESCE($11, study_year),
        grade_id = COALESCE($12, grade_id),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *;
    `;
    const r = await pool.query(q, [
      id,
      patch.title ?? null,
      patch.description ?? null,
      patch.due_date ?? null,
      patch.submission_type ?? null,
      patch.attachments ? JSON.stringify(patch.attachments) : null,
      patch.resources ? JSON.stringify(patch.resources) : null,
      patch.max_score ?? null,
      patch.is_active ?? null,
      patch.visibility ?? null,
      patch.study_year ?? null,
      patch.grade_id ?? null,
    ]);
    return r.rows[0] || null;
  }

  static async softDelete(id: string): Promise<boolean> {
    const r = await pool.query(`UPDATE assignments SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return (r.rowCount ?? 0) > 0;
  }

  static async getById(id: string): Promise<Assignment | null> {
    const r = await pool.query(`SELECT * FROM assignments WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return r.rows[0] || null;
  }

  static async listByTeacher(teacherId: string, page = 1, limit = 20, studyYear?: string | null): Promise<{data: Assignment[]; total: number;}> {
    const offset = (page - 1) * limit;
    const params: any[] = [teacherId];
    let where = `teacher_id = $1 AND deleted_at IS NULL`;
    if (studyYear) {
      params.push(studyYear);
      where += ` AND study_year = $${params.length}`;
    }
    params.push(limit, offset);
    const r = await pool.query(
      `SELECT * FROM assignments WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    const countParams: any[] = [teacherId];
    let countWhere = `teacher_id = $1 AND deleted_at IS NULL`;
    if (studyYear) {
      countParams.push(studyYear);
      countWhere += ` AND study_year = $${countParams.length}`;
    }
    const c = await pool.query(`SELECT COUNT(*)::int AS c FROM assignments WHERE ${countWhere}`, countParams);
    return { data: r.rows, total: c.rows[0].c };
  }

  static async setRecipients(assignmentId: string, studentIds: string[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM assignment_recipients WHERE assignment_id = $1', [assignmentId]);
      for (const sid of studentIds) {
        await client.query('INSERT INTO assignment_recipients (assignment_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [assignmentId, sid]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async listForStudent(studentId: string, page = 1, limit = 20, studyYear?: string | null): Promise<{data: Assignment[]; total: number;}> {
    const offset = (page - 1) * limit;
    const params: any[] = [studentId];
    let where = `a.deleted_at IS NULL AND a.is_active = TRUE AND (a.visibility = 'all_students' OR ar.student_id = $1)`;
    if (studyYear) {
      params.push(studyYear);
      where += ` AND a.study_year = $${params.length}`;
    }
    params.push(limit, offset);
    const q = `
      SELECT a.*
      FROM assignments a
      LEFT JOIN assignment_recipients ar ON ar.assignment_id = a.id AND a.visibility = 'specific_students'
      WHERE ${where}
      ORDER BY a.assigned_date DESC, a.due_date NULLS LAST
      LIMIT $${params.length-1} OFFSET $${params.length};
    `;
    const r = await pool.query(q, params);
    const countParams: any[] = [studentId];
    let countWhere = `a.deleted_at IS NULL AND a.is_active = TRUE AND (a.visibility='all_students' OR ar.student_id = $1)`;
    if (studyYear) {
      countParams.push(studyYear);
      countWhere += ` AND a.study_year = $${countParams.length}`;
    }
    const c = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM assignments a LEFT JOIN assignment_recipients ar ON ar.assignment_id = a.id AND a.visibility = 'specific_students'
       WHERE ${countWhere}`,
      countParams
    );
    return { data: r.rows, total: c.rows[0].c };
  }

  static async upsertSubmission(assignmentId: string, studentId: string, payload: Partial<AssignmentSubmission>): Promise<AssignmentSubmission> {
    // Insert or update student submission for given assignment
    const q = `
      INSERT INTO assignment_submissions (
        assignment_id, student_id, submitted_at, status,
        content_text, link_url, attachments, score, graded_at, graded_by, feedback
      ) VALUES (
        $1,$2,COALESCE($3, NOW()),COALESCE($4,'submitted'),
        $5,$6,COALESCE($7,'[]'::jsonb),$8,$9,$10,$11
      ) ON CONFLICT (assignment_id, student_id) DO UPDATE SET
        submitted_at = EXCLUDED.submitted_at,
        status = EXCLUDED.status,
        content_text = EXCLUDED.content_text,
        link_url = EXCLUDED.link_url,
        attachments = EXCLUDED.attachments,
        score = EXCLUDED.score,
        graded_at = EXCLUDED.graded_at,
        graded_by = EXCLUDED.graded_by,
        feedback = EXCLUDED.feedback,
        updated_at = NOW()
      RETURNING *;
    `;
    const r = await pool.query(q, [
      assignmentId,
      studentId,
      payload.submitted_at ?? null,
      payload.status ?? 'submitted',
      payload.content_text ?? null,
      payload.link_url ?? null,
      JSON.stringify(payload.attachments ?? []),
      payload.score ?? null,
      payload.graded_at ?? null,
      payload.graded_by ?? null,
      payload.feedback ?? null,
    ]);
    return r.rows[0];
  }

  static async getSubmission(assignmentId: string, studentId: string): Promise<AssignmentSubmission | null> {
    const r = await pool.query(`SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2`, [assignmentId, studentId]);
    return r.rows[0] || null;
  }

  static async gradeSubmission(assignmentId: string, studentId: string, score: number, gradedBy: string, feedback?: string): Promise<AssignmentSubmission | null> {
    const r = await pool.query(
      `UPDATE assignment_submissions SET score=$3, graded_at=NOW(), graded_by=$4, status='graded', feedback=COALESCE($5, feedback), updated_at=NOW()
       WHERE assignment_id=$1 AND student_id=$2 RETURNING *`,
      [assignmentId, studentId, score, gradedBy, feedback ?? null]
    );
    return r.rows[0] || null;
  }

  static async getRecipientIds(assignmentId: string): Promise<string[]> {
    const r = await pool.query(
      `SELECT student_id FROM assignment_recipients WHERE assignment_id = $1`,
      [assignmentId]
    );
    return r.rows.map((row: any) => String(row.student_id));
  }
}

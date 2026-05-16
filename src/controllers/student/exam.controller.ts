import type { Request, Response } from 'express';

import pool from '../../config/database';
import { ExamModel, type ExamType } from '../../models/exam.model';
import { ExamService } from '../../services/exam.service';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

const getService = (): ExamService => new ExamService();

export class StudentExamController {
  // GET /api/student/exams
  static async list(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as { page?: number; limit?: number; type?: ExamType };
    const { page, limit } = parsePagination(query);
    const svc = getService();
    const result = await svc.listForStudent(studentId, page, limit, query.type);
    res
      .status(200)
      .json(paginated(result.data, buildPaginationMeta(result.total, page, limit), 'تم جلب الامتحانات'));
  }

  // GET /api/student/exams/:id
  static async getById(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    const svc = getService();
    const exam = await svc.getById(id);
    if (!exam) {
      throw new ApiError(404, 'الامتحان غير موجود', ErrorCodes.NOT_FOUND);
    }
    res.status(200).json(ok(exam, 'تم جلب الامتحان'));
  }

  // GET /api/student/exams/:id/my-grade
  static async myGrade(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const r = await pool.query(
      `SELECT
         e.id::text AS exam_id,
         e.exam_date,
         e.max_score,
         e.exam_type,
         e.description,
         e.notes,
         c.course_name,
         s.name AS subject_name,
         eg.score AS student_score
       FROM exams e
       LEFT JOIN courses c ON c.id = e.course_id
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN exam_grades eg ON eg.exam_id = e.id AND eg.student_id = $2
       WHERE e.id = $1`,
      [id, studentId]
    );
    if ((r.rowCount || 0) === 0) {
      throw new ApiError(404, 'الامتحان غير موجود', ErrorCodes.NOT_FOUND);
    }
    const row = r.rows[0];
    res.status(200).json(
      ok(
        {
          id: String(row.exam_id),
          title: null as string | null,
          exam_date: String(row.exam_date),
          subject_name: row.subject_name || null,
          course_name: row.course_name || null,
          max_score: typeof row.max_score === 'number' ? row.max_score : Number(row.max_score),
          student_score:
            row.student_score !== undefined && row.student_score !== null
              ? Number(row.student_score)
              : null,
          exam_type: String(row.exam_type),
          description: (row.description ?? null) as string | null,
          notes: (row.notes ?? null) as string | null,
        },
        'تم جلب الدرجة'
      )
    );
  }

  // GET /api/student/exams/report/by-type?type=daily|monthly
  static async report(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as { type?: ExamType };
    const svc = getService();
    const exams = await svc.listForStudent(studentId, 1, 1000, query.type);
    const out: Array<{ exam: unknown; grade: unknown }> = [];
    for (const ex of exams.data) {
      const grade = await ExamModel.getGrade(ex.id, studentId);
      out.push({ exam: ex, grade });
    }
    res.status(200).json(ok(out, 'تقرير الامتحانات'));
  }
}

import type { Request, Response } from 'express';

import { StudentService } from '../../services/student/student.service';
import { StudentTeacherAggregateService } from '../../services/student/teacher-aggregate.service';
import { ok } from '../../utils/response.util';

export class StudentTeacherController {
  // GET /api/student/teachers/:teacherId/aggregate
  // Single round-trip aggregate for the student↔teacher workspace screen.
  static async getTeacherAggregate(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const { teacherId } = req.params as { teacherId: string };
    const data = await StudentTeacherAggregateService.getAggregate(studentId, teacherId);
    res.status(200).json(ok(data, 'تم جلب بيانات الأستاذ'));
  }


  // GET /api/student/teachers/suggested
  static async getSuggestedTeachers(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as {
      maxDistance?: number;
      page?: number;
      limit?: number;
      search?: string;
    };
    const data = await StudentService.getSuggestedTeachersForStudent(
      studentId,
      query.search,
      query.maxDistance ?? 5,
      query.page ?? 1,
      query.limit ?? 10
    );
    res.status(200).json(ok(data, 'تم العثور على المعلمين'));
  }

  // GET /api/student/teachers/:teacherId/subjects-courses
  static async getTeacherSubjectsAndCourses(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params as { teacherId: string };
    const query = req.query as unknown as {
      page?: number;
      limit?: number;
      search?: string;
      gradeId?: string;
      subjectId?: string;
      studyYear?: string;
    };
    const data = await StudentService.getTeacherSubjectsAndCoursesForStudent(
      teacherId,
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
      query.gradeId,
      query.subjectId,
      query.studyYear
    );
    res.status(200).json(ok(data, 'تم جلب بيانات المعلم'));
  }
}

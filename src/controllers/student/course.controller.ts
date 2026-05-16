import type { Request, Response } from 'express';

import { StudentService } from '../../services/student/student.service';
import { ok } from '../../utils/response.util';

export class StudentCourseController {
  // GET /api/student/courses/suggested
  static async getSuggestedCourses(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const query = req.query as unknown as {
      maxDistance?: number;
      page?: number;
      limit?: number;
    };
    const maxDistance = query.maxDistance ?? 5;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    // Throws 404 NOT_FOUND if the student has no active grade.
    const { grades } = await StudentService.getActiveGrades(studentId);

    // Returns null if the student has no location → fall back to the
    // "newest courses for my grade" path. Any other failure (student not
    // found, etc.) throws.
    const location = await StudentService.getStudentLocation(studentId);
    if (!location) {
      const fallback = await StudentService.getSuggestedCoursesWithoutLocation(
        studentId,
        page,
        limit
      );
      res.status(200).json(ok(fallback, 'تم العثور على الدورات'));
      return;
    }

    const data = await StudentService.getSuggestedCoursesForStudent(
      studentId,
      grades,
      location,
      maxDistance,
      page,
      limit
    );
    res.status(200).json(ok(data, 'تم العثور على الدورات'));
  }

  // GET /api/student/courses/:id
  static async getCourseById(req: Request, res: Response): Promise<void> {
    const studentId = req.user.id as string;
    const id = req.params['id'] as string;
    const data = await StudentService.getCourseByIdForStudent(id, studentId);
    res.status(200).json(ok(data, 'تم العثور على الدورة'));
  }
}

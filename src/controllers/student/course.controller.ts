import type { Request, Response } from 'express';

import { StudentService } from '../../services/student/student.service';
import { VideoCourseAccessService } from '../../services/video-course-access.service';
import { ok, paginated } from '../../utils/response.util';
import { buildPaginationMeta, parsePagination } from '../../utils/pagination';

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

    // Released clients render non-200 responses as a generic loading error.
    // No active grade means there are no matching suggestions, not a failure.
    const { grades } = await StudentService.getActiveGrades(studentId, {
      allowEmpty: true,
    });
    if (grades.length === 0) {
      res
        .status(200)
        .json(ok({ courses: [], count: 0 }, 'لا توجد دورات مطابقة حالياً'));
      return;
    }

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

  // GET /api/student/courses/:id/video-courses
  //
  // Course-Hub videos section. Returns the video courses pinned to this
  // live course (via video_course_target_courses) that the student can
  // view. Access is enforced via fn_student_can_view_video_course — a
  // pinned-but-not-viewable card is filtered out, never returned with
  // a "buy" overlay (that surface belongs to the marketplace).
  //
  // Note: we DO NOT verify the student is enrolled in this live course
  // before returning the video list. The access function makes the per-
  // video decision and a student who can view a video pinned to a course
  // they're not enrolled in (e.g. public_free_by_grade) should still see
  // it. The "should this student even be looking at this Course Hub" gate
  // is the responsibility of the calling screen, not this endpoint.
  static async getCourseVideoCourses(
    req: Request,
    res: Response
  ): Promise<void> {
    const studentId = req.user.id as string;
    const courseId = req.params['id'] as string;
    const { page, limit, offset } = parsePagination(req.query);

    const result = await VideoCourseAccessService.videosForCourseHub({
      studentId,
      courseId,
      offset,
      limit,
    });

    res
      .status(200)
      .json(
        paginated(
          result.rows,
          buildPaginationMeta(result.total, page, limit),
          'الدورات المرئية المرتبطة بهذه الدورة'
        )
      );
  }
}

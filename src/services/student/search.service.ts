import pool from '@/config/database';
import { ApiResponse } from '@/types';
import { UserModel } from '@/models/user.model';
import { StudentGradeModel } from '@/models/student-grade.model';

interface UnifiedSearchParams {
  q?: string;
  maxDistance?: number;
  page?: number;
  limit?: number;
}

export class StudentUnifiedSearchService {
  static async unifiedSearch(
    studentId: string,
    params: UnifiedSearchParams
  ): Promise<ApiResponse> {
    try {
      const q = params.q?.trim();
      const page = params.page ?? 1;
      const limit = params.limit ?? 10;
      const offset = (page - 1) * limit;
      const maxDistance = params.maxDistance ?? 5;

      // Get student location (if exists)
      const student = await UserModel.findById(studentId);
      const hasLocation = Boolean(student?.latitude && student?.longitude);

      // Get student's active grades to tailor course results
      const studentGrades = await StudentGradeModel.findActiveByStudentId(studentId);
      const gradeIds: string[] = (studentGrades || []).map((g: any) => g.gradeId || g.grade_id).filter(Boolean);

      // Build teachers query
      const teacherValues: any[] = [];
      let tParam = 1;
      let teacherWhere = `u.user_type = 'teacher' AND u.status = 'active' AND u.deleted_at IS NULL`;

      if (q && q !== 'null' && q !== 'undefined') {
        teacherWhere += ` AND (u.name ILIKE $${tParam}`;
        teacherValues.push(`%${q}%`);
        tParam++;
        // match on teacher courses or subjects
        teacherWhere += ` OR EXISTS (SELECT 1 FROM courses c WHERE c.teacher_id = u.id AND c.is_deleted = false AND c.course_name ILIKE $${tParam})`;
        teacherValues.push(`%${q}%`);
        tParam++;
        teacherWhere += ` OR EXISTS (SELECT 1 FROM courses c2 JOIN subjects s2 ON s2.id = c2.subject_id WHERE c2.teacher_id = u.id AND c2.is_deleted = false AND s2.name ILIKE $${tParam}))`;
        teacherValues.push(`%${q}%`);
        tParam++;
      }

      let teacherSelect = `SELECT u.id, u.name, u.phone, u.address, u.bio, u.experience_years, u.latitude, u.longitude, u.profile_image_path`;
      let teacherFrom = ` FROM users u`;
      let teacherOrder = ` ORDER BY u.created_at DESC`;

      if (hasLocation) {
        teacherSelect += `, (6371 * acos(cos(radians($${tParam})) * cos(radians(u.latitude)) * cos(radians(u.longitude) - radians($${tParam + 1})) + sin(radians($${tParam})) * sin(radians(u.latitude)))) as distance`;
        teacherValues.push(student!.latitude, student!.longitude);
        tParam += 2;
        teacherWhere += ` AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL`;
        teacherWhere += ` AND (6371 * acos(cos(radians($${tParam - 2})) * cos(radians(u.latitude)) * cos(radians(u.longitude) - radians($${tParam - 1})) + sin(radians($${tParam - 2})) * sin(radians(u.latitude)))) <= $${tParam}`;
        teacherValues.push(maxDistance);
        tParam++;
        teacherOrder = ` ORDER BY distance ASC`;
      }

      const teacherQuery = `${teacherSelect}${teacherFrom} WHERE ${teacherWhere}${teacherOrder} LIMIT $${tParam} OFFSET $${tParam + 1}`;
      teacherValues.push(limit, offset);

      // Build courses query (filter by student's grades if available)
      const courseValues: any[] = [];
      let cParam = 1;
      let courseWhere = `c.is_deleted = false`;

      if (gradeIds.length > 0) {
        courseWhere += ` AND c.grade_id = ANY($${cParam})`;
        courseValues.push(gradeIds);
        cParam++;
      }

      if (q && q !== 'null' && q !== 'undefined') {
        courseWhere += ` AND (c.course_name ILIKE $${cParam} OR s.name ILIKE $${cParam + 1} OR u.name ILIKE $${cParam + 2})`;
        courseValues.push(`%${q}%`, `%${q}%`, `%${q}%`);
        cParam += 3;
      }

      let courseSelect = `SELECT c.*, g.name as grade_name, s.name as subject_name, u.name as teacher_name, u.profile_image_path as teacher_profile_image_path, u.latitude as teacher_latitude, u.longitude as teacher_longitude`;
      let courseFrom = ` FROM courses c INNER JOIN users u ON u.id = c.teacher_id INNER JOIN grades g ON g.id = c.grade_id INNER JOIN subjects s ON s.id = c.subject_id`;
      let courseOrder = ` ORDER BY c.created_at DESC`;

      if (hasLocation) {
        courseSelect += `, (6371 * acos(cos(radians($${cParam})) * cos(radians(u.latitude)) * cos(radians(u.longitude) - radians($${cParam + 1})) + sin(radians($${cParam})) * sin(radians(u.latitude)))) as distance`;
        courseValues.push(student!.latitude, student!.longitude);
        cParam += 2;
        courseWhere += ` AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL`;
        courseWhere += ` AND (6371 * acos(cos(radians($${cParam - 2})) * cos(radians(u.latitude)) * cos(radians(u.longitude) - radians($${cParam - 1})) + sin(radians($${cParam - 2})) * sin(radians(u.latitude)))) <= $${cParam}`;
        courseValues.push(maxDistance);
        cParam++;
        courseOrder = ` ORDER BY distance ASC, c.created_at DESC`;
      }

      const courseQuery = `${courseSelect}${courseFrom} WHERE ${courseWhere}${courseOrder} LIMIT $${cParam} OFFSET $${cParam + 1}`;
      courseValues.push(limit, offset);

      // Build subjects query
      const subjectValues: any[] = [];
      let sParam = 1;
      let subjectWhere = `s.deleted_at IS NULL`;
      if (q && q !== 'null' && q !== 'undefined') {
        subjectWhere += ` AND s.name ILIKE $${sParam}`;
        subjectValues.push(`%${q}%`);
        sParam++;
      }
      const subjectQuery = `SELECT s.id, s.name, s.description FROM subjects s WHERE ${subjectWhere} ORDER BY s.created_at DESC LIMIT $${sParam} OFFSET $${sParam + 1}`;
      subjectValues.push(limit, offset);

      const [teachersRes, coursesRes, subjectsRes] = await Promise.all([
        pool.query(teacherQuery, teacherValues),
        pool.query(courseQuery, courseValues),
        pool.query(subjectQuery, subjectValues),
      ]);

      // Shape unified response
      const teachers = teachersRes.rows.map((t: any) => ({
        id: String(t.id),
        name: t.name,
        phone: t.phone || null,
        address: t.address || null,
        bio: t.bio || null,
        experienceYears: t.experience_years ?? null,
        latitude: t.latitude ?? null,
        longitude: t.longitude ?? null,
        profileImagePath: t.profile_image_path ?? null,
        distance: t.distance != null ? Number(t.distance) : null,
      }));

      const courses = coursesRes.rows.map((c: any) => ({
        id: String(c.id),
        courseName: c.course_name,
        studyYear: c.study_year,
        price: c.price,
        startDate: c.start_date,
        endDate: c.end_date,
        grade: { id: String(c.grade_id), name: c.grade_name },
        subject: { id: String(c.subject_id), name: c.subject_name },
        teacher: {
          id: String(c.teacher_id),
          name: c.teacher_name,
          profileImagePath: c.teacher_profile_image_path ?? null,
          latitude: c.teacher_latitude ?? null,
          longitude: c.teacher_longitude ?? null,
        },
        distance: c.distance != null ? Number(c.distance) : null,
      }));

      const subjects = subjectsRes.rows.map((s: any) => ({
        id: String(s.id),
        name: s.name,
        description: s.description,
      }));

      return {
        success: true,
        message: 'نتائج البحث',
        data: {
          query: q || null,
          teachers,
          courses,
          subjects,
        },
        count: teachers.length + courses.length + subjects.length,
      };
    } catch (error) {
      console.error('Error in StudentUnifiedSearchService.unifiedSearch:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }
}

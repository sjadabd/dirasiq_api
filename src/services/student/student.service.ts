import pool from '../../config/database';
import { CourseModel } from '../../models/course.model';
import { GradeModel } from '../../models/grade.model';
import { StudentGradeModel } from '../../models/student-grade.model';
import { SubjectModel } from '../../models/subject.model';
import { UserModel } from '../../models/user.model';
import { ApiResponse, StudentGrade } from '../../types';

export class StudentService {
  // Get active grades for student
  static async getActiveGrades(studentId: string): Promise<ApiResponse> {
    try {
      const studentGrades =
        await StudentGradeModel.findActiveByStudentId(studentId);

      if (!studentGrades || studentGrades.length === 0) {
        return {
          success: false,
          message: 'لا يوجد صف نشط',
          errors: ['لا يوجد صف نشط'],
        };
      }

      return {
        success: true,
        message: 'تم العثور على الصفوف',
        data: { grades: studentGrades },
      };
    } catch (error) {
      console.error('Error getting active grades for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // Get student by ID
  static async getStudentById(studentId: string): Promise<ApiResponse> {
    try {
      const student = await UserModel.findById(studentId);

      if (!student || student.userType !== 'student') {
        return {
          success: false,
          message: 'الطالب غير موجود',
          errors: ['الطالب غير موجود'],
        };
      }

      return {
        success: true,
        message: 'تم العثور على الطالب',
        data: { student },
      };
    } catch (error) {
      console.error('Error getting student by ID:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // Validate student location
  static async validateStudentLocation(
    studentId: string
  ): Promise<ApiResponse> {
    try {
      const student = await UserModel.findById(studentId);

      if (!student || student.userType !== 'student') {
        return {
          success: false,
          message: 'الطالب غير موجود',
          errors: ['الطالب غير موجود'],
        };
      }

      if (!student.latitude || !student.longitude) {
        return {
          success: false,
          message: 'الموقع غير محدد',
          errors: ['الموقع غير محدد'],
        };
      }

      return {
        success: true,
        message: 'الموقع صحيح',
        data: {
          location: {
            latitude: student.latitude,
            longitude: student.longitude,
          },
        },
      };
    } catch (error) {
      console.error('Error validating student location:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // Get suggested courses for student based on grade and location
  static async getSuggestedCoursesForStudent(
    studentId: string,
    studentGrades: StudentGrade[],
    studentLocation: { latitude: number; longitude: number },
    maxDistance: number = 5,
    page: number = 1,
    limit: number = 10
  ): Promise<ApiResponse> {
    try {
      const offset = (page - 1) * limit;

      // Get courses that match student's grades
      const gradeIds = studentGrades.map(sg => sg.gradeId);
      const courses = await CourseModel.findByGradesAndLocation(
        gradeIds,
        studentLocation,
        maxDistance,
        limit,
        offset
      );

      if (!courses || courses.length === 0) {
        return {
          success: true,
          message: 'لم يتم العثور على دورات',
          data: { courses: [], count: 0 },
          count: 0,
        };
      }

      // 🧠 اجلب حالة الحجز لكل كورس مقترح لهذا الطالب
      const courseIds: string[] = courses.map((c: any) => c.id);
      let bookingsByCourse: Record<string, { status: string; id: string }> = {};
      if (courseIds.length > 0) {
        const bookingQuery = `
          SELECT DISTINCT ON (course_id) id, course_id, status
          FROM course_bookings
          WHERE student_id = $1
            AND course_id = ANY($2)
            AND is_deleted = false
          ORDER BY course_id, created_at DESC
        `;
        const bookingResult = await pool.query(bookingQuery, [
          studentId,
          courseIds,
        ]);
        for (const row of bookingResult.rows) {
          bookingsByCourse[row.course_id] = { status: row.status, id: row.id };
        }
      }

      // 🚫 أخفِ الدورات التي اشترك بها الطالب بالفعل (الحجز المؤكد يعتبر اشتراكًا)
      const filtered = courses.filter(
        (c: any) => bookingsByCourse[c.id]?.status !== 'confirmed'
      );

      // ➕ أضف حالة الحجز للدورات الأخرى لعرض زر التسجيل أو الحالة
      const enriched = filtered.map((c: any) => ({
        ...c,
        bookingStatus: bookingsByCourse[c.id]?.status || null,
        bookingId: bookingsByCourse[c.id]?.id || null,
      }));

      return {
        success: true,
        message: 'تم العثور على الدورات',
        data: { courses: enriched },
        count: enriched.length,
      };
    } catch (error) {
      console.error('Error getting suggested courses for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // Get course details by ID for student
  static async getCourseByIdForStudent(
    courseId: string,
    studentId: string
  ): Promise<ApiResponse> {
    try {
      const course = await CourseModel.findById(courseId);

      if (!course) {
        return {
          success: false,
          message: 'الدورة غير موجودة',
          errors: ['الدورة غير موجودة'],
        };
      }

      // Get teacher details
      const teacher = await UserModel.findById(course.teacher_id);
      if (!teacher) {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود'],
        };
      }

      // Calculate distance between student and teacher
      const student = await UserModel.findById(studentId);
      let distance = null;
      if (
        student &&
        student.latitude &&
        student.longitude &&
        teacher.latitude &&
        teacher.longitude
      ) {
        distance = this.calculateDistance(
          student.latitude,
          student.longitude,
          teacher.latitude,
          teacher.longitude
        );
      }

      // Check student's latest booking status for this course
      const bookingQuery = `
        SELECT id, status
        FROM course_bookings
        WHERE student_id = $1 AND course_id = $2 AND is_deleted = false
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const bookingRes = await pool.query(bookingQuery, [studentId, courseId]);
      const latestBooking = bookingRes.rows[0] as
        | { id: string; status: string }
        | undefined;

      // إذا كان الحجز مؤكدًا، لا نمنع عرض التفاصيل، فقط نُشير إلى أن الطالب مشترك

      // Fetch grade and subject details
      const [grade, subject] = await Promise.all([
        GradeModel.findById(course.grade_id),
        SubjectModel.findById(course.subject_id),
      ]);

      const courseWithDetails = {
        ...course,
        bookingStatus: latestBooking?.status || null,
        bookingId: latestBooking?.id || null,
        isSubscribed: latestBooking?.status === 'confirmed',
        grade: grade
          ? { id: grade.id, name: grade.name }
          : { id: course.grade_id, name: undefined },
        subject: subject
          ? { id: subject.id, name: subject.name }
          : { id: course.subject_id, name: undefined },
        teacher: {
          id: teacher.id,
          name: teacher.name,
          phone: (teacher as any).phone,
          address: (teacher as any).address,
          bio: (teacher as any).bio,
          experienceYears: (teacher as any).experienceYears,
          distance: distance,
        },
      };

      return {
        success: true,
        message: 'تم العثور على الدورة',
        data: { course: courseWithDetails },
      };
    } catch (error) {
      console.error('Error getting course by ID for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }

  // Calculate distance between two points using Haversine formula
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
      Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  // Convert degrees to radians
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export interface SuggestedTeacherRow {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  bio?: string;
  experience_years?: number;
  latitude?: number;
  longitude?: number;
  profile_image_path?: string | null;
  distance: number;
}

export namespace StudentService {
  // Weekly schedule for the student
  export async function getWeeklySchedule(studentId: string): Promise<ApiResponse> {
    try {
      const q = `
        SELECT
          s.id,
          s.weekday::int,
          s.start_time,
          s.end_time,
          s.course_id::text,
          s.teacher_id::text,
          c.course_name,
          c.subject_id::text AS subject_id,
          sub.name AS subject_name,
          u.name AS teacher_name,
          u.profile_image_path,
          u.latitude,
          u.longitude
        FROM sessions s
        JOIN session_attendees sa ON sa.session_id = s.id AND sa.student_id = $1
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN subjects sub ON sub.id = c.subject_id
        JOIN users u ON u.id = s.teacher_id
        WHERE s.is_deleted = false
          AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
        ORDER BY s.weekday ASC, s.start_time ASC
      `;
      const r = await pool.query(q, [studentId]);

      const items = r.rows.map((row: any) => ({
        id: String(row.id),
        weekday: Number(row.weekday),
        startTime: row.start_time,
        endTime: row.end_time,
        course: {
          id: String(row.course_id),
          name: row.course_name,
        },
        subject: {
          id: row.subject_id || null,
          name: row.subject_name || null,
        },
        teacher: {
          id: String(row.teacher_id),
          name: row.teacher_name,
          profileImagePath: row.profile_image_path || null,
          latitude: row.latitude ?? null,
          longitude: row.longitude ?? null,
        },
      }));
      // Group by weekday: { "0": [...], "1": [...], ... }
      const scheduleByDay = items.reduce((acc: Record<string, any[]>, it) => {
        const key = String(it.weekday);
        (acc[key] ??= []).push(it);
        return acc;
      }, {} as Record<string, any[]>);

      return {
        success: true,
        message: 'جدول الأسبوع للطالب',
        data: { schedule: items, scheduleByDay },
        count: items.length,
      };
    } catch (error) {
      console.error('Error getting weekly schedule for student:', error);
      return { success: false, message: 'فشلت العملية', errors: ['خطأ داخلي في الخادم'] };
    }
  }
  // Dashboard overview: progress and attendance
  export async function getDashboardOverview(studentId: string): Promise<ApiResponse> {
    try {
      // Assignments counts (visible to student)
      const assignmentsTotalQ = `
        SELECT COUNT(DISTINCT a.id)::int AS c
        FROM assignments a
        LEFT JOIN assignment_recipients ar ON ar.assignment_id = a.id AND a.visibility = 'specific_students'
        WHERE a.deleted_at IS NULL
          AND a.is_active = TRUE
          AND (a.visibility = 'all_students' OR ar.student_id = $1)
      `;
      const assignmentsSubmittedQ = `
        SELECT COUNT(*)::int AS c
        FROM assignment_submissions s
        WHERE s.student_id = $1 AND s.submitted_at IS NOT NULL
      `;

      // Exams counts (visible to student similar to ExamModel.listForStudent)
      const examsTotalQ = `
        SELECT COUNT(*)::int AS c
        FROM exams e
        WHERE (
          EXISTS (
            SELECT 1 FROM course_bookings cb
            WHERE cb.student_id = $1 AND cb.course_id = e.course_id AND cb.teacher_id = e.teacher_id AND cb.status = 'confirmed' AND cb.is_deleted = false
          )
          OR EXISTS (
            SELECT 1 FROM exam_sessions es
            JOIN session_attendees sa ON sa.session_id = es.session_id AND sa.student_id = $1
            WHERE es.exam_id = e.id
          )
          OR EXISTS (
            SELECT 1 FROM exam_grades eg WHERE eg.student_id = $1 AND eg.exam_id = e.id
          )
        )
      `;
      const examsGradedQ = `
        SELECT COUNT(*)::int AS c FROM exam_grades WHERE student_id = $1
      `;

      // Attendance counts
      const attendanceTotalQ = `
        SELECT COUNT(*)::int AS c FROM session_attendance a WHERE a.student_id = $1
      `;
      const attendancePresentQ = `
        SELECT COUNT(*)::int AS c
        FROM session_attendance a
        WHERE a.student_id = $1
          AND (a.meta->>'status' = 'present' OR (a.meta->>'status' IS NULL AND a.checkin_at IS NOT NULL))
      `;

      // Next upcoming session for the student
      const nextSessionQ = `
        WITH base AS (
          SELECT
            s.id,
            s.course_id::text,
            s.teacher_id::text,
            s.weekday,
            s.start_time,
            s.end_time,
            c.course_name,
            c.subject_id::text AS subject_id,
            sub.name AS subject_name,
            u.name AS teacher_name,
            u.profile_image_path,
            u.latitude,
            u.longitude,
            CASE
              WHEN s.weekday = EXTRACT(DOW FROM NOW())::int THEN
                CASE WHEN (CURRENT_DATE + s.start_time) > NOW() THEN 0 ELSE 7 END
              ELSE ((s.weekday - EXTRACT(DOW FROM NOW())::int + 7) % 7)
            END AS offset_days
          FROM sessions s
          JOIN session_attendees sa ON sa.session_id = s.id AND sa.student_id = $1
          JOIN courses c ON c.id = s.course_id
          LEFT JOIN subjects sub ON sub.id = c.subject_id
          JOIN users u ON u.id = s.teacher_id
          WHERE s.is_deleted = false
            AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
        )
        SELECT *, (CURRENT_DATE + (offset_days || ' days')::interval + start_time) AS next_occurrence
        FROM base
        ORDER BY next_occurrence ASC
        LIMIT 1
      `;

      // Next monthly exam visible to the student
      const nextMonthlyExamQ = `
        SELECT
          e.id,
          e.course_id::text,
          e.subject_id::text,
          e.teacher_id::text,
          e.exam_date,
          e.exam_type,
          e.max_score,
          c.course_name,
          sub.name AS subject_name,
          u.name AS teacher_name,
          u.profile_image_path,
          u.latitude,
          u.longitude
        FROM exams e
        JOIN courses c ON c.id = e.course_id
        LEFT JOIN subjects sub ON sub.id = e.subject_id
        JOIN users u ON u.id = e.teacher_id
        WHERE e.exam_type = 'monthly'
          AND e.exam_date >= CURRENT_DATE
          AND (
            EXISTS (
              SELECT 1 FROM course_bookings cb
              WHERE cb.student_id = $1 AND cb.course_id = e.course_id AND cb.teacher_id = e.teacher_id AND cb.status = 'confirmed' AND cb.is_deleted = false
            )
            OR EXISTS (
              SELECT 1 FROM exam_sessions es
              JOIN session_attendees sa ON sa.session_id = es.session_id AND sa.student_id = $1
              WHERE es.exam_id = e.id
            )
            OR EXISTS (
              SELECT 1 FROM exam_grades eg WHERE eg.student_id = $1 AND eg.exam_id = e.id
            )
          )
        ORDER BY e.exam_date ASC, e.created_at ASC
        LIMIT 1
      `;

      const evaluationQ = `
        WITH mapped AS (
          SELECT
            (
              (CASE scientific_level WHEN 'excellent' THEN 100 WHEN 'very_good' THEN 80 WHEN 'good' THEN 60 WHEN 'fair' THEN 40 WHEN 'weak' THEN 20 ELSE 0 END) +
              (CASE behavioral_level WHEN 'excellent' THEN 100 WHEN 'very_good' THEN 80 WHEN 'good' THEN 60 WHEN 'fair' THEN 40 WHEN 'weak' THEN 20 ELSE 0 END) +
              (CASE attendance_level WHEN 'excellent' THEN 100 WHEN 'very_good' THEN 80 WHEN 'good' THEN 60 WHEN 'fair' THEN 40 WHEN 'weak' THEN 20 ELSE 0 END) +
              (CASE homework_preparation WHEN 'excellent' THEN 100 WHEN 'very_good' THEN 80 WHEN 'good' THEN 60 WHEN 'fair' THEN 40 WHEN 'weak' THEN 20 ELSE 0 END) +
              (CASE participation_level WHEN 'excellent' THEN 100 WHEN 'very_good' THEN 80 WHEN 'good' THEN 60 WHEN 'fair' THEN 40 WHEN 'weak' THEN 20 ELSE 0 END) +
              (CASE instruction_following WHEN 'excellent' THEN 100 WHEN 'very_good' THEN 80 WHEN 'good' THEN 60 WHEN 'fair' THEN 40 WHEN 'weak' THEN 20 ELSE 0 END)
            ) / 6.0 AS score,
            eval_date_date
          FROM student_evaluations
          WHERE student_id = $1
            AND eval_date_date >= CURRENT_DATE - INTERVAL '90 days'
        )
        SELECT
          COALESCE(ROUND(AVG(score)::numeric, 0), 0)::int AS avg_percent,
          COUNT(*)::int AS eval_count,
          MAX(eval_date_date) AS last_eval_date
        FROM mapped;
      `;

      const [aTot, aSub, eTot, eGrd, attTot, attPres, nextSessionRes, nextExamRes, evalRes] = await Promise.all([
        pool.query(assignmentsTotalQ, [studentId]),
        pool.query(assignmentsSubmittedQ, [studentId]),
        pool.query(examsTotalQ, [studentId]),
        pool.query(examsGradedQ, [studentId]),
        pool.query(attendanceTotalQ, [studentId]),
        pool.query(attendancePresentQ, [studentId]),
        pool.query(nextSessionQ, [studentId]),
        pool.query(nextMonthlyExamQ, [studentId]),
        pool.query(evaluationQ, [studentId])
      ]);

      const assignmentsTotal = aTot.rows[0]?.c ?? 0;
      const assignmentsSubmitted = aSub.rows[0]?.c ?? 0;
      const examsTotal = eTot.rows[0]?.c ?? 0;
      const examsGraded = eGrd.rows[0]?.c ?? 0;
      const attendanceTotal = attTot.rows[0]?.c ?? 0;
      const attendancePresent = attPres.rows[0]?.c ?? 0;

      const progressDen = Math.max(0, Number(assignmentsTotal) + Number(examsTotal));
      const progressNum = Math.min(assignmentsSubmitted, assignmentsTotal) + Math.min(examsGraded, examsTotal);
      const progressPercent = progressDen > 0 ? Math.round((progressNum / progressDen) * 100) : 0;

      const attendancePercent = attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

      const evalRow = evalRes.rows[0] as { avg_percent?: number; eval_count?: number; last_eval_date?: string } | undefined;
      const evaluation = {
        averagePercent: evalRow?.avg_percent ?? 0,
        count: evalRow?.eval_count ?? 0,
        lastEvaluationDate: evalRow?.last_eval_date ? new Date(evalRow.last_eval_date).toISOString() : null,
      };

      const nextSession = nextSessionRes.rows[0]
        ? {
          id: String(nextSessionRes.rows[0].id),
          courseId: String(nextSessionRes.rows[0].course_id),
          teacherId: String(nextSessionRes.rows[0].teacher_id),
          weekday: Number(nextSessionRes.rows[0].weekday),
          startTime: nextSessionRes.rows[0].start_time,
          endTime: nextSessionRes.rows[0].end_time,
          nextOccurrence: new Date(nextSessionRes.rows[0].next_occurrence).toISOString(),
          courseName: nextSessionRes.rows[0].course_name,
          subject: {
            id: nextSessionRes.rows[0].subject_id || null,
            name: nextSessionRes.rows[0].subject_name || null
          },
          teacher: {
            name: nextSessionRes.rows[0].teacher_name,
            profileImagePath: nextSessionRes.rows[0].profile_image_path || null,
            latitude: nextSessionRes.rows[0].latitude ?? null,
            longitude: nextSessionRes.rows[0].longitude ?? null
          }
        }
        : null;

      const nextMonthlyExam = nextExamRes.rows[0]
        ? {
          id: String(nextExamRes.rows[0].id),
          courseId: String(nextExamRes.rows[0].course_id),
          teacherId: String(nextExamRes.rows[0].teacher_id),
          subjectId: String(nextExamRes.rows[0].subject_id),
          examDate: nextExamRes.rows[0].exam_date,
          examType: nextExamRes.rows[0].exam_type,
          maxScore: Number(nextExamRes.rows[0].max_score),
          courseName: nextExamRes.rows[0].course_name,
          subjectName: nextExamRes.rows[0].subject_name,
          teacher: {
            name: nextExamRes.rows[0].teacher_name,
            profileImagePath: nextExamRes.rows[0].profile_image_path || null,
            latitude: nextExamRes.rows[0].latitude ?? null,
            longitude: nextExamRes.rows[0].longitude ?? null
          }
        }
        : null;

      return {
        success: true,
        message: 'Student dashboard overview',
        data: {
          progressPercent,
          attendancePercent,
          nextSession,
          nextMonthlyExam,
          evaluation,
          breakdown: {
            assignmentsTotal,
            assignmentsSubmitted,
            examsTotal,
            examsGraded,
            attendanceTotal,
            attendancePresent
          }
        }
      };
    } catch (error) {
      console.error('Error getting student dashboard overview:', error);
      return { success: false, message: 'فشلت العملية', errors: ['خطأ داخلي في الخادم'] };
    }
  }
  // Get teacher subjects and available courses for students
  export async function getTeacherSubjectsAndCoursesForStudent(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    gradeId?: string,
    subjectId?: string,
    studyYear?: string
  ): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (
        !teacher ||
        teacher.userType !== 'teacher' ||
        teacher.status !== 'active'
      ) {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود'],
        };
      }

      // Fetch subjects (active only)
      const { subjects } = await SubjectModel.findAllByTeacher(
        teacherId,
        1,
        1000,
        undefined,
        false
      );

      // Build courses query: available = not deleted and not expired
      const offset = (page - 1) * limit;
      const coursesParams: any[] = [teacherId];
      let p = 2;

      let where =
        'WHERE c.teacher_id = $1 AND c.is_deleted = false AND c.end_date >= CURRENT_DATE';

      const isValid = (v?: string) =>
        v && v.trim() !== '' && v !== 'null' && v !== 'undefined';

      if (isValid(search)) {
        where += ` AND c.course_name ILIKE $${p}`;
        coursesParams.push(`%${search!.trim()}%`);
        p++;
      }
      if (isValid(studyYear)) {
        where += ` AND c.study_year = $${p}`;
        coursesParams.push(studyYear);
        p++;
      }
      if (isValid(gradeId)) {
        where += ` AND c.grade_id = $${p}`;
        coursesParams.push(gradeId);
        p++;
      }
      if (isValid(subjectId)) {
        where += ` AND c.subject_id = $${p}`;
        coursesParams.push(subjectId);
        p++;
      }

      const coursesQuery = `
        SELECT
          c.*, g.name as grade_name, s.name as subject_name
        FROM courses c
        LEFT JOIN grades g ON c.grade_id = g.id
        LEFT JOIN subjects s ON c.subject_id = s.id
        ${where}
        ORDER BY c.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `;
      const coursesParamsWithPaging = [...coursesParams, limit, offset];

      const countQuery = `
        SELECT COUNT(*)::int as count
        FROM courses c
        ${where}
      `;
      const [coursesRes, countRes] = await Promise.all([
        pool.query(coursesQuery, coursesParamsWithPaging),
        pool.query(countQuery, coursesParams),
      ]);

      const courses = coursesRes.rows.map((c: any) => ({
        ...c,
        grade: { id: c.grade_id, name: c.grade_name },
        subject: { id: c.subject_id, name: c.subject_name },
      }));
      return {
        success: true,
        message: 'تم جلب بيانات المعلم',
        data: {
          teacher: {
            id: teacher.id,
            name: teacher.name,
            profileImagePath: (teacher as any).profileImagePath ?? null,
            latitude: (teacher as any).latitude ?? null,
            longitude: (teacher as any).longitude ?? null
          },
          subjects,
          courses,
          count: countRes.rows[0]?.count ?? courses.length
        },
        count: countRes.rows[0]?.count ?? courses.length
      };
    } catch (error) {
      console.error(
        'Error getting teacher subjects and courses for student:',
        error
      );
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }
  export async function getSuggestedTeachersForStudent(
    studentId: string,
    search: string | undefined,
    maxDistance: number = 5,
    page: number = 1,
    limit: number = 10
  ): Promise<ApiResponse> {
    try {
      const student = await UserModel.findById(studentId);
      if (!student || !student.latitude || !student.longitude) {
        return {
          success: false,
          message: 'الموقع غير محدد',
          errors: ['الموقع غير محدد'],
        };
      }

      const offset = (page - 1) * limit;

      // Build search filters
      let searchClause = '';
      const params: any[] = [
        student.latitude,
        student.longitude,
        maxDistance,
        limit,
        offset,
      ];
      let paramIndex = 6; // next index after first 5

      if (search && search.trim() !== '') {
        searchClause = `AND (
          u.name ILIKE $${paramIndex} OR
          EXISTS (
            SELECT 1 FROM courses c2
            WHERE c2.teacher_id = u.id AND c2.is_deleted = false AND c2.course_name ILIKE $${paramIndex}
          ) OR
          EXISTS (
            SELECT 1 FROM courses c3
            JOIN subjects s3 ON c3.subject_id = s3.id
            WHERE c3.teacher_id = u.id AND c3.is_deleted = false AND s3.name ILIKE $${paramIndex}
          )
        )`;
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }

      const query = `
        WITH nearby_teachers AS (
          SELECT
            u.id,
            u.name,
            u.phone,
            u.address,
            u.bio,
            u.experience_years,
            u.latitude,
            u.longitude,
            u.profile_image_path,
            (
              6371 * acos(
                cos(radians($1)) * cos(radians(u.latitude)) *
                cos(radians(u.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(u.latitude))
              )
            ) as distance
          FROM users u
          WHERE u.user_type = 'teacher'
            AND u.status = 'active'
            AND u.latitude IS NOT NULL
            AND u.longitude IS NOT NULL
        )
        SELECT *
        FROM nearby_teachers u
        WHERE u.distance <= $3
        ${searchClause}
        ORDER BY u.distance ASC
        LIMIT $4 OFFSET $5
      `;

      // Build count query with its own params and aligned placeholders
      let countSearchClause = '';
      const countParams: any[] = [
        student.latitude,
        student.longitude,
        maxDistance,
      ];
      let countParamIndex = 4; // next index after first 3

      if (search && search.trim() !== '') {
        countSearchClause = `AND (
          EXISTS (
            SELECT 1 FROM users uu
            WHERE uu.id = u.id AND uu.name ILIKE $${countParamIndex}
          ) OR
          EXISTS (
            SELECT 1 FROM courses c2
            WHERE c2.teacher_id = u.id AND c2.is_deleted = false AND c2.course_name ILIKE $${countParamIndex}
          ) OR
          EXISTS (
            SELECT 1 FROM courses c3
            JOIN subjects s3 ON c3.subject_id = s3.id
            WHERE c3.teacher_id = u.id AND c3.is_deleted = false AND s3.name ILIKE $${countParamIndex}
          )
        )`;
        countParams.push(`%${search.trim()}%`);
        countParamIndex++;
      }

      const countQuery = `
        WITH nearby_teachers AS (
          SELECT
            u.id,
            (
              6371 * acos(
                cos(radians($1)) * cos(radians(u.latitude)) *
                cos(radians(u.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(u.latitude))
              )
            ) as distance
          FROM users u
          WHERE u.user_type = 'teacher'
            AND u.status = 'active'
            AND u.latitude IS NOT NULL
            AND u.longitude IS NOT NULL
        )
        SELECT COUNT(*)::int as count
        FROM nearby_teachers u
        WHERE u.distance <= $3
        ${countSearchClause}
      `;

      const [res, countRes] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams),
      ]);

      const teachers: SuggestedTeacherRow[] = res.rows;
      const count: number = countRes.rows[0]?.count ?? teachers.length;

      return {
        success: true,
        message: 'تم العثور على المعلمين',
        data: {
          teachers: teachers.map(t => ({
            id: t.id,
            name: t.name,
            phone: t.phone,
            address: t.address,
            bio: t.bio,
            experienceYears: t.experience_years,
            latitude: t.latitude,
            longitude: t.longitude,
            profileImagePath: t.profile_image_path,
            distance: Number(t.distance),
          })),
          count,
        },
        count,
      };
    } catch (error) {
      console.error('Error getting suggested teachers for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم'],
      };
    }
  }
}

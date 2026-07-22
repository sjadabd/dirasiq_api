import pool from '../../config/database';
import { CourseModel } from '../../models/course.model';
import { GradeModel } from '../../models/grade.model';
import { StudentGradeModel } from '../../models/student-grade.model';
import { SubjectModel } from '../../models/subject.model';
import { UserModel } from '../../models/user.model';
import type { StudentGrade } from '../../types';
import { ApiError, ErrorCodes } from '../../utils/api-error';
import { formatTime12Arabic } from '../../utils/time-format.util';

export interface StudentLocation {
  latitude: number;
  longitude: number;
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

export class StudentService {
  // -------------------------------------------------------------------------
  // Lookups
  // -------------------------------------------------------------------------

  /** Throws 404 if the student has no active grades unless allowEmpty is set. */
  static async getActiveGrades(
    studentId: string,
    options: { allowEmpty?: boolean } = {}
  ): Promise<{ grades: StudentGrade[] }> {
    const studentGrades =
      await StudentGradeModel.findActiveByStudentId(studentId);
    if (!studentGrades || studentGrades.length === 0) {
      if (options.allowEmpty) return { grades: [] };
      throw new ApiError(404, 'لا يوجد صف نشط', ErrorCodes.NOT_FOUND);
    }
    return { grades: studentGrades };
  }

  /** Throws 404 if the student doesn't exist. */
  static async getStudentById(studentId: string): Promise<{ student: any }> {
    const student = await UserModel.findById(studentId);
    if (!student || student.userType !== 'student') {
      throw new ApiError(404, 'الطالب غير موجود', ErrorCodes.NOT_FOUND);
    }
    return { student };
  }

  /**
   * Returns the student's location, or null if not set. Callers decide
   * whether the absence is an error (validate*) or a fallback trigger
   * (suggested-courses).
   */
  static async getStudentLocation(studentId: string): Promise<StudentLocation | null> {
    const student = await UserModel.findById(studentId);
    if (!student || student.userType !== 'student') {
      throw new ApiError(404, 'الطالب غير موجود', ErrorCodes.NOT_FOUND);
    }
    if (!student.latitude || !student.longitude) return null;
    return { latitude: student.latitude, longitude: student.longitude };
  }

  /** Throws 400 if the student has no location. */
  static async validateStudentLocation(studentId: string): Promise<{ location: StudentLocation }> {
    const location = await StudentService.getStudentLocation(studentId);
    if (!location) {
      throw new ApiError(400, 'الموقع غير محدد', ErrorCodes.BUSINESS_RULE);
    }
    return { location };
  }

  // -------------------------------------------------------------------------
  // Suggested courses
  // -------------------------------------------------------------------------

  static async getSuggestedCoursesForStudent(
    studentId: string,
    studentGrades: StudentGrade[],
    studentLocation: StudentLocation,
    maxDistance = 5,
    page = 1,
    limit = 10
  ): Promise<{ courses: any[]; count: number }> {
    const offset = (page - 1) * limit;
    const gradeIds = studentGrades.map((sg) => sg.gradeId);
    const courses = await CourseModel.findByGradesAndLocation(
      gradeIds,
      studentLocation,
      maxDistance,
      limit,
      offset
    );
    if (!courses || courses.length === 0) {
      return { courses: [], count: 0 };
    }

    const courseIds: string[] = courses.map((c: any) => c.id);
    const bookingsByCourse: Record<string, { status: string; id: string }> = {};
    if (courseIds.length > 0) {
      const bookingResult = await pool.query(
        `SELECT DISTINCT ON (course_id) id, course_id, status
           FROM course_bookings
          WHERE student_id = $1
            AND course_id = ANY($2)
            AND is_deleted = false
          ORDER BY course_id, created_at DESC`,
        [studentId, courseIds]
      );
      for (const row of bookingResult.rows) {
        bookingsByCourse[row.course_id] = { status: row.status, id: row.id };
      }
    }

    // Hide courses the student already has a confirmed booking for.
    const filtered = courses.filter(
      (c: any) => bookingsByCourse[c.id]?.status !== 'confirmed'
    );
    const enriched = filtered.map((c: any) => ({
      ...c,
      bookingStatus: bookingsByCourse[c.id]?.status || null,
      bookingId: bookingsByCourse[c.id]?.id || null,
    }));
    return { courses: enriched, count: enriched.length };
  }

  static async getCourseByIdForStudent(
    courseId: string,
    studentId: string
  ): Promise<{ course: any }> {
    const course = await CourseModel.findById(courseId);
    if (!course) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const bookingRes = await pool.query(
      `SELECT id, status
         FROM course_bookings
        WHERE student_id = $1 AND course_id = $2 AND is_deleted = false
          AND status NOT IN ('cancelled', 'rejected')
        ORDER BY created_at DESC
        LIMIT 1`,
      [studentId, courseId]
    );
    const latestBooking = bookingRes.rows[0] as
      | { id: string; status: string }
      | undefined;

    const isEnded = CourseModel.isEnded(course);
    // Non-enrolled students must not see finished (archive) courses.
    if (isEnded && !latestBooking) {
      throw new ApiError(404, 'الدورة غير موجودة', ErrorCodes.NOT_FOUND);
    }

    const teacher = await UserModel.findById(course.teacher_id);
    if (!teacher) {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }

    const student = await UserModel.findById(studentId);
    let distance = null;
    if (
      student?.latitude &&
      student?.longitude &&
      teacher.latitude &&
      teacher.longitude
    ) {
      distance = StudentService.calculateDistance(
        student.latitude,
        student.longitude,
        teacher.latitude,
        teacher.longitude
      );
    }

    const [grade, subject] = await Promise.all([
      GradeModel.findById(course.grade_id),
      SubjectModel.findById(course.subject_id),
    ]);

    return {
      course: {
        ...course,
        is_ended: isEnded,
        is_archived: isEnded,
        bookingStatus: latestBooking?.status || null,
        bookingId: latestBooking?.id || null,
        isSubscribed:
          latestBooking?.status === 'confirmed' ||
          latestBooking?.status === 'approved',
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
          distance,
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = StudentService.toRadians(lat2 - lat1);
    const dLon = StudentService.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(StudentService.toRadians(lat1)) *
        Math.cos(StudentService.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// =============================================================================
// Namespace extension — keeps declaration-merge with the class above so the
// existing callers (`StudentService.getDashboardOverview(...)` etc.) keep
// working with no import changes.
// =============================================================================

export namespace StudentService {
  // ---------------------------------------------------------------------------
  // Weekly schedule
  // ---------------------------------------------------------------------------
  export async function getWeeklySchedule(
    studentId: string
  ): Promise<{ schedule: any[]; scheduleByDay: Record<string, any[]>; count: number }> {
    const r = await pool.query(
      `SELECT
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
      ORDER BY s.weekday ASC, s.start_time ASC`,
      [studentId]
    );

    const items = r.rows.map((row: any) => ({
      id: String(row.id),
      weekday: Number(row.weekday),
      startTime: formatTime12Arabic(row.start_time),
      endTime: formatTime12Arabic(row.end_time),
      course: { id: String(row.course_id), name: row.course_name },
      subject: { id: row.subject_id || null, name: row.subject_name || null },
      teacher: {
        id: String(row.teacher_id),
        name: row.teacher_name,
        profileImagePath: row.profile_image_path || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
      },
    }));
    const scheduleByDay = items.reduce((acc: Record<string, any[]>, it) => {
      const key = String(it.weekday);
      (acc[key] ??= []).push(it);
      return acc;
    }, {} as Record<string, any[]>);
    return { schedule: items, scheduleByDay, count: items.length };
  }

  // ---------------------------------------------------------------------------
  // Dashboard overview
  // ---------------------------------------------------------------------------
  export async function getDashboardOverview(studentId: string): Promise<{
    progressPercent: number;
    attendancePercent: number;
    nextSession: any;
    nextMonthlyExam: any;
    evaluation: { averagePercent: number; count: number; lastEvaluationDate: string | null };
    breakdown: {
      assignmentsTotal: number;
      assignmentsSubmitted: number;
      examsTotal: number;
      examsGraded: number;
      attendanceTotal: number;
      attendancePresent: number;
    };
  }> {
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
    const examsGradedQ = `SELECT COUNT(*)::int AS c FROM exam_grades WHERE student_id = $1`;
    const attendanceTotalQ = `SELECT COUNT(*)::int AS c FROM session_attendance a WHERE a.student_id = $1`;
    const attendancePresentQ = `
      SELECT COUNT(*)::int AS c
      FROM session_attendance a
      WHERE a.student_id = $1
        AND (a.meta->>'status' = 'present' OR (a.meta->>'status' IS NULL AND a.checkin_at IS NOT NULL))
    `;
    const nextSessionQ = `
      WITH base AS (
        SELECT
          s.id, s.course_id::text, s.teacher_id::text, s.weekday, s.start_time, s.end_time,
          c.course_name, c.subject_id::text AS subject_id, sub.name AS subject_name,
          u.name AS teacher_name, u.profile_image_path, u.latitude, u.longitude,
          CASE
            WHEN s.weekday = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Baghdad'))::int THEN
              -- Keep today's session selected until it ENDS (not just starts), so
              -- an in-progress lecture surfaces as the current event instead of
              -- jumping to next week.
              CASE WHEN ((NOW() AT TIME ZONE 'Asia/Baghdad')::date + s.end_time) > (NOW() AT TIME ZONE 'Asia/Baghdad') THEN 0 ELSE 7 END
            ELSE ((s.weekday - EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Baghdad'))::int + 7) % 7)
          END AS offset_days
        FROM sessions s
        JOIN session_attendees sa ON sa.session_id = s.id AND sa.student_id = $1
        JOIN courses c ON c.id = s.course_id
        LEFT JOIN subjects sub ON sub.id = c.subject_id
        JOIN users u ON u.id = s.teacher_id
        WHERE s.is_deleted = false
          AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
      )
      SELECT *,
        ((NOW() AT TIME ZONE 'Asia/Baghdad')::date + (offset_days || ' days')::interval + start_time) AS next_occurrence,
        ((NOW() AT TIME ZONE 'Asia/Baghdad')::date + (offset_days || ' days')::interval + end_time) AS next_occurrence_end
      FROM base
      ORDER BY next_occurrence ASC
      LIMIT 1
    `;
    const nextMonthlyExamQ = `
      SELECT
        e.id, e.course_id::text, e.subject_id::text, e.teacher_id::text,
        e.exam_date, e.exam_type, e.max_score,
        c.course_name, sub.name AS subject_name,
        u.name AS teacher_name, u.profile_image_path, u.latitude, u.longitude
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
        WHERE student_id = $1 AND eval_date_date >= CURRENT_DATE - INTERVAL '90 days'
      )
      SELECT
        COALESCE(ROUND(AVG(score)::numeric, 0), 0)::int AS avg_percent,
        COUNT(*)::int AS eval_count,
        MAX(eval_date_date) AS last_eval_date
      FROM mapped;
    `;

    const [aTot, aSub, eTot, eGrd, attTot, attPres, nextSessionRes, nextExamRes, evalRes] =
      await Promise.all([
        pool.query(assignmentsTotalQ, [studentId]),
        pool.query(assignmentsSubmittedQ, [studentId]),
        pool.query(examsTotalQ, [studentId]),
        pool.query(examsGradedQ, [studentId]),
        pool.query(attendanceTotalQ, [studentId]),
        pool.query(attendancePresentQ, [studentId]),
        pool.query(nextSessionQ, [studentId]),
        pool.query(nextMonthlyExamQ, [studentId]),
        pool.query(evaluationQ, [studentId]),
      ]);

    const assignmentsTotal = aTot.rows[0]?.c ?? 0;
    const assignmentsSubmitted = aSub.rows[0]?.c ?? 0;
    const examsTotal = eTot.rows[0]?.c ?? 0;
    const examsGraded = eGrd.rows[0]?.c ?? 0;
    const attendanceTotal = attTot.rows[0]?.c ?? 0;
    const attendancePresent = attPres.rows[0]?.c ?? 0;
    const progressDen = Math.max(0, Number(assignmentsTotal) + Number(examsTotal));
    const progressNum =
      Math.min(assignmentsSubmitted, assignmentsTotal) +
      Math.min(examsGraded, examsTotal);
    const progressPercent = progressDen > 0 ? Math.round((progressNum / progressDen) * 100) : 0;
    const attendancePercent =
      attendanceTotal > 0 ? Math.round((attendancePresent / attendanceTotal) * 100) : 0;

    const evalRow = evalRes.rows[0] as
      | { avg_percent?: number; eval_count?: number; last_eval_date?: string }
      | undefined;
    const evaluation = {
      averagePercent: evalRow?.avg_percent ?? 0,
      count: evalRow?.eval_count ?? 0,
      lastEvaluationDate: evalRow?.last_eval_date
        ? new Date(evalRow.last_eval_date).toISOString()
        : null,
    };

    const nextSession = nextSessionRes.rows[0]
      ? {
          id: String(nextSessionRes.rows[0].id),
          courseId: String(nextSessionRes.rows[0].course_id),
          teacherId: String(nextSessionRes.rows[0].teacher_id),
          weekday: Number(nextSessionRes.rows[0].weekday),
          startTime: formatTime12Arabic(nextSessionRes.rows[0].start_time),
          endTime: formatTime12Arabic(nextSessionRes.rows[0].end_time),
          nextOccurrence: new Date(nextSessionRes.rows[0].next_occurrence).toISOString(),
          endAt: new Date(nextSessionRes.rows[0].next_occurrence_end).toISOString(),
          courseName: nextSessionRes.rows[0].course_name,
          subject: {
            id: nextSessionRes.rows[0].subject_id || null,
            name: nextSessionRes.rows[0].subject_name || null,
          },
          teacher: {
            name: nextSessionRes.rows[0].teacher_name,
            profileImagePath: nextSessionRes.rows[0].profile_image_path || null,
            latitude: nextSessionRes.rows[0].latitude ?? null,
            longitude: nextSessionRes.rows[0].longitude ?? null,
          },
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
            longitude: nextExamRes.rows[0].longitude ?? null,
          },
        }
      : null;

    return {
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
        attendancePresent,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Teacher subjects + courses (browsing a single teacher)
  // ---------------------------------------------------------------------------
  export async function getTeacherSubjectsAndCoursesForStudent(
    teacherId: string,
    page = 1,
    limit = 10,
    search?: string,
    gradeId?: string,
    subjectId?: string,
    studyYear?: string
  ): Promise<{
    teacher: { id: string; name: string; profileImagePath: string | null; latitude: number | null; longitude: number | null };
    subjects: any[];
    courses: any[];
    count: number;
  }> {
    const teacher = await UserModel.findById(teacherId);
    if (!teacher || teacher.userType !== 'teacher' || teacher.status !== 'active') {
      throw new ApiError(404, 'المعلم غير موجود', ErrorCodes.NOT_FOUND);
    }

    const { subjects } = await SubjectModel.findAllByTeacher(
      teacherId,
      1,
      1000,
      undefined,
      false
    );

    const offset = (page - 1) * limit;
    const coursesParams: any[] = [teacherId];
    let p = 2;
    let where =
      'WHERE c.teacher_id = $1 AND c.is_deleted = false AND c.end_date >= CURRENT_DATE';

    const isValid = (v?: string): boolean =>
      Boolean(v && v.trim() !== '' && v !== 'null' && v !== 'undefined');

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
      SELECT c.*, g.name as grade_name, s.name as subject_name
        FROM courses c
        LEFT JOIN grades g ON c.grade_id = g.id
        LEFT JOIN subjects s ON c.subject_id = s.id
        ${where}
        ORDER BY c.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
    `;
    const countQuery = `SELECT COUNT(*)::int as count FROM courses c ${where}`;

    const [coursesRes, countRes] = await Promise.all([
      pool.query(coursesQuery, [...coursesParams, limit, offset]),
      pool.query(countQuery, coursesParams),
    ]);

    const courses = coursesRes.rows.map((c: any) => ({
      ...c,
      grade: { id: c.grade_id, name: c.grade_name },
      subject: { id: c.subject_id, name: c.subject_name },
    }));

    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
        profileImagePath: (teacher as any).profileImagePath ?? null,
        latitude: (teacher as any).latitude ?? null,
        longitude: (teacher as any).longitude ?? null,
      },
      subjects,
      courses,
      count: countRes.rows[0]?.count ?? courses.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Suggested teachers
  // ---------------------------------------------------------------------------
  export async function getSuggestedTeachersForStudent(
    studentId: string,
    search: string | undefined,
    maxDistance = 5,
    page = 1,
    limit = 10
  ): Promise<{ teachers: any[]; count: number }> {
    const student = await UserModel.findById(studentId);
    const offset = (page - 1) * limit;

    // Fallback: no location -> alphabetical
    if (!student || !student.latitude || !student.longitude) {
      const [items, count] = await Promise.all([
        UserModel.findTeachersAlphabetical(limit, offset, search, studentId),
        UserModel.countTeachersAlphabetical(search, studentId),
      ]);
      return {
        teachers: items.map((t: any) => ({
          id: t.id,
          name: t.name,
          phone: t.phone,
          address: t.address,
          bio: t.bio,
          experienceYears: t.experience_years,
          latitude: t.latitude,
          longitude: t.longitude,
          profileImagePath: t.profile_image_path,
          distance: null,
        })),
        count,
      };
    }

    // With location -> nearby by distance
    let searchClause = '';
    const params: any[] = [
      student.latitude,
      student.longitude,
      maxDistance,
      limit,
      offset,
      studentId, // $6 — exclude teachers the student is already booked with
    ];
    let paramIndex = 7;
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
          u.id, u.name, u.phone, u.address, u.bio, u.experience_years,
          u.latitude, u.longitude, u.profile_image_path,
          (6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) *
            cos(radians(u.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(u.latitude))
          )) as distance
        FROM users u
        WHERE u.user_type = 'teacher'
          AND u.status = 'active'
          AND u.latitude IS NOT NULL
          AND u.longitude IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM course_bookings cb
            WHERE cb.teacher_id = u.id
              AND cb.student_id = $6
              AND cb.is_deleted = false
              AND cb.status IN ('pending','pre_approved','confirmed','approved')
          )
      )
      SELECT * FROM nearby_teachers u
      WHERE u.distance <= $3 ${searchClause}
      ORDER BY u.distance ASC
      LIMIT $4 OFFSET $5
    `;

    let countSearchClause = '';
    const countParams: any[] = [student.latitude, student.longitude, maxDistance, studentId];
    let countParamIndex = 5;
    if (search && search.trim() !== '') {
      countSearchClause = `AND (
        EXISTS (
          SELECT 1 FROM users uu WHERE uu.id = u.id AND uu.name ILIKE $${countParamIndex}
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
          (6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) *
            cos(radians(u.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(u.latitude))
          )) as distance
        FROM users u
        WHERE u.user_type = 'teacher'
          AND u.status = 'active'
          AND u.latitude IS NOT NULL
          AND u.longitude IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM course_bookings cb
            WHERE cb.teacher_id = u.id
              AND cb.student_id = $4
              AND cb.is_deleted = false
              AND cb.status IN ('pending','pre_approved','confirmed','approved')
          )
      )
      SELECT COUNT(*)::int as count
      FROM nearby_teachers u
      WHERE u.distance <= $3 ${countSearchClause}
    `;

    const [res, countRes] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const teachers: SuggestedTeacherRow[] = res.rows;
    const count: number = countRes.rows[0]?.count ?? teachers.length;
    return {
      teachers: teachers.map((t) => ({
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
    };
  }

  // ---------------------------------------------------------------------------
  // Suggested courses without location (newest first)
  // ---------------------------------------------------------------------------
  export async function getSuggestedCoursesWithoutLocation(
    studentId: string,
    page = 1,
    limit = 10
  ): Promise<{ courses: any[]; count: number }> {
    const { grades } = await StudentService.getActiveGrades(studentId);
    const gradeIds = grades.map((g) => g.gradeId);
    const offset = (page - 1) * limit;
    const courses = await CourseModel.findByGradesNewest(gradeIds, limit, offset);
    return { courses, count: courses.length };
  }
}

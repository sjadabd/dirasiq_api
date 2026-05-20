// Aggregate endpoint for the student↔teacher workspace screen.
//
// Returns everything a student sees on a single teacher's page in one round
// trip: teacher profile + courses they share + assignments scoped to those
// courses + exams (with grade if any) + invoices + alerts. Filtering happens
// at the SQL layer with parameters bound to (studentId, teacherId) so no
// cross-teacher data ever leaves the DB.
//
// Ownership rule: the student must have at least one non-soft-deleted
// course_booking row with this teacher in status confirmed/approved.
// Anything else returns 404 NOT_FOUND (not 403) so we don't leak whether the
// teacher exists.

import pool from '../../config/database';
import { ApiError, ErrorCodes } from '../../utils/api-error';

const ACTIVE_BOOKING_STATUSES = ['confirmed', 'approved'] as const;
// Cap the result set per slice so a long history doesn't blow up the response.
const SLICE_LIMIT = 50;

type TeacherProfile = {
  id: string;
  name: string;
  email: string | null;
  profileImagePath: string | null;
  city: string | null;
  formattedAddress: string | null;
  bio: string | null;
  introVideoStatus: string;
  introVideoManifestPath: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  price: number;
  hasReservation: boolean;
  reservationAmount: number;
  bookingId: string;
  bookingStatus: string;
  studyYear: string;
  images: string[];
  gradeName: string | null;
  subjectName: string | null;
};

type AssignmentRow = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string | null;
  maxScore: number;
  submissionType: string;
  submissionStatus: string | null; // null = not submitted
  myScore: number | null;
  submittedAt: string | null;
};

type ExamRow = {
  id: string;
  courseId: string;
  examType: 'daily' | 'monthly';
  examDate: string;
  maxScore: number;
  description: string | null;
  myScore: number | null;
};

type InvoiceRow = {
  id: string;
  courseId: string;
  invoiceNumber: string | null;
  invoiceType: string;
  paymentMode: string;
  amountDue: number;
  discountTotal: number;
  amountPaid: number;
  remainingAmount: number;
  invoiceStatus: string;
  invoiceDate: string;
  dueDate: string | null;
};

type Alert =
  | { kind: 'overdue_invoice'; invoiceId: string; courseId: string; amount: number }
  | { kind: 'assignment_due_soon'; assignmentId: string; courseId: string; dueDate: string }
  | { kind: 'upcoming_exam'; examId: string; courseId: string; examDate: string };

export type TeacherAggregate = {
  teacher: TeacherProfile;
  courses: CourseRow[];
  counts: {
    courses: number;
    assignmentsPending: number;
    assignmentsGraded: number;
    examsUpcoming: number;
    invoicesOverdue: number;
    invoicesUnpaid: number;
  };
  assignments: AssignmentRow[];
  exams: ExamRow[];
  invoices: InvoiceRow[];
  totals: {
    invoicesDue: number;
    invoicesPaid: number;
    invoicesRemaining: number;
  };
  alerts: Alert[];
};

export class StudentTeacherAggregateService {
  /**
   * Single round trip for the student↔teacher workspace.
   *
   * Throws 404 NOT_FOUND if the student has no active booking with this
   * teacher — same response shape as "teacher doesn't exist", so we don't
   * leak existence.
   */
  static async getAggregate(
    studentId: string,
    teacherId: string
  ): Promise<TeacherAggregate> {
    // 1. Ownership gate — must come first.
    const ownership = await pool.query<{ teacher_id: string }>(
      `SELECT 1 AS teacher_id
       FROM course_bookings
       WHERE student_id = $1
         AND teacher_id = $2
         AND status = ANY($3::text[])
         AND is_deleted = false
       LIMIT 1`,
      [studentId, teacherId, ACTIVE_BOOKING_STATUSES as unknown as string[]]
    );
    if (ownership.rowCount === 0) {
      throw new ApiError(404, 'لم نعثر على هذا الأستاذ في قائمتك', ErrorCodes.NOT_FOUND);
    }

    // 2. Parallel slices — every query joins through course_bookings or
    //    filters on (student_id, teacher_id) so nothing crosses the boundary.
    const [
      teacherRow,
      courses,
      assignments,
      exams,
      invoices,
    ] = await Promise.all([
      this.fetchTeacher(teacherId),
      this.fetchCourses(studentId, teacherId),
      this.fetchAssignments(studentId, teacherId),
      this.fetchExams(studentId, teacherId),
      this.fetchInvoices(studentId, teacherId),
    ]);

    if (!teacherRow) {
      // Defensive: ownership gate passed but teacher row gone — treat as 404.
      throw new ApiError(404, 'لم نعثر على هذا الأستاذ في قائمتك', ErrorCodes.NOT_FOUND);
    }

    // 3. Derived counts + alerts.
    const counts = {
      courses: courses.length,
      assignmentsPending: assignments.filter((a) => a.submissionStatus === null).length,
      assignmentsGraded: assignments.filter((a) => a.submissionStatus === 'graded').length,
      examsUpcoming: exams.filter((e) => new Date(e.examDate) >= startOfToday()).length,
      invoicesOverdue: invoices.filter((i) => i.invoiceStatus === 'overdue').length,
      invoicesUnpaid: invoices.filter((i) => Number(i.remainingAmount) > 0).length,
    };

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.invoicesDue += Number(inv.amountDue || 0);
        acc.invoicesPaid += Number(inv.amountPaid || 0);
        acc.invoicesRemaining += Number(inv.remainingAmount || 0);
        return acc;
      },
      { invoicesDue: 0, invoicesPaid: 0, invoicesRemaining: 0 }
    );

    const alerts = this.buildAlerts(assignments, exams, invoices);

    return {
      teacher: teacherRow,
      courses,
      counts,
      assignments,
      exams,
      invoices,
      totals,
      alerts,
    };
  }

  // ---- slice fetchers --------------------------------------------------------

  private static async fetchTeacher(teacherId: string): Promise<TeacherProfile | null> {
    const q = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.profile_image_path,
        u.city,
        u.formatted_address,
        u.bio,
        u.intro_video_status,
        u.intro_video_manifest_path
      FROM users u
      WHERE u.id = $1
        AND u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
      LIMIT 1
    `;
    const r = await pool.query(q, [teacherId]);
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      email: row.email ?? null,
      profileImagePath: row.profile_image_path ?? null,
      city: row.city ?? null,
      formattedAddress: row.formatted_address ?? null,
      bio: row.bio ?? null,
      introVideoStatus: String(row.intro_video_status ?? 'none'),
      introVideoManifestPath: row.intro_video_manifest_path ?? null,
    };
  }

  private static async fetchCourses(
    studentId: string,
    teacherId: string
  ): Promise<CourseRow[]> {
    const q = `
      SELECT
        c.id,
        c.course_name,
        c.description,
        c.start_date,
        c.end_date,
        c.price,
        c.has_reservation,
        c.reservation_amount,
        c.course_images,
        cb.id AS booking_id,
        cb.status AS booking_status,
        cb.study_year,
        g.name AS grade_name,
        s.name AS subject_name
      FROM course_bookings cb
      JOIN courses c ON c.id = cb.course_id AND c.is_deleted = false
      LEFT JOIN grades g ON g.id = c.grade_id
      LEFT JOIN subjects s ON s.id = c.subject_id
      WHERE cb.student_id = $1
        AND cb.teacher_id = $2
        AND cb.status = ANY($3::text[])
        AND cb.is_deleted = false
      ORDER BY c.start_date DESC NULLS LAST, c.created_at DESC
    `;
    const r = await pool.query(q, [
      studentId,
      teacherId,
      ACTIVE_BOOKING_STATUSES as unknown as string[],
    ]);
    return r.rows.map((row) => ({
      id: String(row.id),
      name: String(row.course_name ?? ''),
      description: row.description ?? null,
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      price: Number(row.price ?? 0),
      hasReservation: Boolean(row.has_reservation),
      reservationAmount: Number(row.reservation_amount ?? 0),
      bookingId: String(row.booking_id),
      bookingStatus: String(row.booking_status),
      studyYear: String(row.study_year ?? ''),
      images: Array.isArray(row.course_images) ? row.course_images.map(String) : [],
      gradeName: row.grade_name ?? null,
      subjectName: row.subject_name ?? null,
    }));
  }

  private static async fetchAssignments(
    studentId: string,
    teacherId: string
  ): Promise<AssignmentRow[]> {
    // Strict scope: assignments authored by this teacher AND attached to a course
    // the student is actively booked into. Joined to the student's submission row
    // so we know status/score in one round trip.
    const q = `
      SELECT
        a.id,
        a.course_id,
        a.title,
        a.description,
        a.assigned_date,
        a.due_date,
        a.max_score,
        a.submission_type,
        sub.status   AS submission_status,
        sub.score    AS my_score,
        sub.submitted_at
      FROM assignments a
      JOIN course_bookings cb
        ON cb.course_id = a.course_id
       AND cb.student_id = $1
       AND cb.teacher_id = $2
       AND cb.status = ANY($3::text[])
       AND cb.is_deleted = false
      LEFT JOIN assignment_recipients ar
        ON ar.assignment_id = a.id
       AND ar.student_id = $1
      LEFT JOIN assignment_submissions sub
        ON sub.assignment_id = a.id
       AND sub.student_id = $1
      WHERE a.teacher_id = $2
        AND a.is_active = true
        AND a.deleted_at IS NULL
        AND (a.visibility = 'all_students' OR ar.student_id = $1)
      ORDER BY a.due_date DESC NULLS LAST, a.assigned_date DESC
      LIMIT $4
    `;
    const r = await pool.query(q, [
      studentId,
      teacherId,
      ACTIVE_BOOKING_STATUSES as unknown as string[],
      SLICE_LIMIT,
    ]);
    return r.rows.map((row) => ({
      id: String(row.id),
      courseId: String(row.course_id),
      title: String(row.title ?? ''),
      description: row.description ?? null,
      assignedDate: row.assigned_date,
      dueDate: row.due_date ?? null,
      maxScore: Number(row.max_score ?? 0),
      submissionType: String(row.submission_type ?? 'text'),
      submissionStatus: row.submission_status ?? null,
      myScore: row.my_score !== null && row.my_score !== undefined ? Number(row.my_score) : null,
      submittedAt: row.submitted_at ?? null,
    }));
  }

  private static async fetchExams(
    studentId: string,
    teacherId: string
  ): Promise<ExamRow[]> {
    const q = `
      SELECT
        e.id,
        e.course_id,
        e.exam_type,
        e.exam_date,
        e.max_score,
        e.description,
        eg.score AS my_score
      FROM exams e
      JOIN course_bookings cb
        ON cb.course_id = e.course_id
       AND cb.student_id = $1
       AND cb.teacher_id = $2
       AND cb.status = ANY($3::text[])
       AND cb.is_deleted = false
      LEFT JOIN exam_grades eg
        ON eg.exam_id = e.id
       AND eg.student_id = $1
      WHERE e.teacher_id = $2
      ORDER BY e.exam_date DESC
      LIMIT $4
    `;
    const r = await pool.query(q, [
      studentId,
      teacherId,
      ACTIVE_BOOKING_STATUSES as unknown as string[],
      SLICE_LIMIT,
    ]);
    return r.rows.map((row) => ({
      id: String(row.id),
      courseId: String(row.course_id),
      examType: row.exam_type as 'daily' | 'monthly',
      examDate: row.exam_date,
      maxScore: Number(row.max_score ?? 0),
      description: row.description ?? null,
      myScore: row.my_score !== null && row.my_score !== undefined ? Number(row.my_score) : null,
    }));
  }

  private static async fetchInvoices(
    studentId: string,
    teacherId: string
  ): Promise<InvoiceRow[]> {
    const q = `
      SELECT
        ci.id,
        ci.course_id,
        ci.invoice_number,
        ci.invoice_type,
        ci.payment_mode,
        ci.amount_due,
        ci.discount_total,
        ci.amount_paid,
        ci.remaining_amount,
        ci.invoice_status,
        ci.invoice_date,
        ci.due_date
      FROM course_invoices ci
      WHERE ci.student_id = $1
        AND ci.teacher_id = $2
        AND ci.deleted_at IS NULL
      ORDER BY ci.created_at DESC
      LIMIT $3
    `;
    const r = await pool.query(q, [studentId, teacherId, SLICE_LIMIT]);
    return r.rows.map((row) => ({
      id: String(row.id),
      courseId: String(row.course_id),
      invoiceNumber: row.invoice_number ?? null,
      invoiceType: String(row.invoice_type),
      paymentMode: String(row.payment_mode),
      amountDue: Number(row.amount_due ?? 0),
      discountTotal: Number(row.discount_total ?? 0),
      amountPaid: Number(row.amount_paid ?? 0),
      remainingAmount: Number(row.remaining_amount ?? 0),
      invoiceStatus: String(row.invoice_status),
      invoiceDate: row.invoice_date,
      dueDate: row.due_date ?? null,
    }));
  }

  // ---- derived alerts --------------------------------------------------------

  /**
   * Surface the three highest-signal things the student/parent should act on:
   *   - overdue invoices
   *   - assignments due within the next 3 days that aren't yet submitted
   *   - exams scheduled within the next 7 days
   * Order is by urgency.
   */
  private static buildAlerts(
    assignments: AssignmentRow[],
    exams: ExamRow[],
    invoices: InvoiceRow[]
  ): Alert[] {
    const now = new Date();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const alerts: Alert[] = [];

    for (const inv of invoices) {
      if (inv.invoiceStatus === 'overdue' && Number(inv.remainingAmount) > 0) {
        alerts.push({
          kind: 'overdue_invoice',
          invoiceId: inv.id,
          courseId: inv.courseId,
          amount: Number(inv.remainingAmount),
        });
      }
    }
    for (const a of assignments) {
      if (!a.dueDate || a.submissionStatus) continue;
      const due = new Date(a.dueDate).getTime();
      if (due - now.getTime() <= threeDaysMs && due >= now.getTime()) {
        alerts.push({
          kind: 'assignment_due_soon',
          assignmentId: a.id,
          courseId: a.courseId,
          dueDate: a.dueDate,
        });
      }
    }
    for (const e of exams) {
      const date = new Date(e.examDate).getTime();
      if (date - now.getTime() <= sevenDaysMs && date >= now.getTime()) {
        alerts.push({
          kind: 'upcoming_exam',
          examId: e.id,
          courseId: e.courseId,
          examDate: e.examDate,
        });
      }
    }
    return alerts;
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

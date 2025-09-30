import pool from '@/config/database';

export interface SessionWithComputedTimes {
  id: string;
  course_id: string;
  teacher_id: string;
  weekday: number;
  start_time: string; // HH:MM:SS
  end_time: string;   // HH:MM:SS
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  course_id: string;
  teacher_id: string;
  student_id: string;
  occurred_on: string; // date
  checkin_at: string; // timestamptz
}

export class AttendanceModel {
  // Find active session for teacher at current time (server time)
  static async findActiveSessionForTeacherNow(teacherId: string): Promise<SessionWithComputedTimes | null> {
    const q = `
      SELECT id, course_id, teacher_id, weekday, start_time, end_time
      FROM sessions
      WHERE teacher_id = $1
        AND is_deleted = false
        AND state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND weekday = EXTRACT(DOW FROM NOW())::int
        AND start_time <= (NOW()::time)
        AND end_time   >= (NOW()::time)
      ORDER BY start_time ASC
      LIMIT 1
    `;
    const r = await pool.query(q, [teacherId]);
    return r.rows[0] || null;
  }

  // Verify student is in this session via explicit attendees or confirmed booking for the course
  static async isStudentEligibleForSession(sessionId: string, courseId: string, studentId: string): Promise<boolean> {
    const q = `
      SELECT 1 FROM session_attendees WHERE session_id = $1 AND student_id = $2
      UNION ALL
      SELECT 1 FROM course_bookings WHERE course_id = $3 AND student_id = $2 AND status = 'confirmed' AND is_deleted = false
      LIMIT 1
    `;
    const r = await pool.query(q, [sessionId, studentId, courseId]);
    return r.rows.length > 0;
  }

  static async hasCheckedIn(sessionId: string, studentId: string, occurredOnISO: string): Promise<boolean> {
    const q = `SELECT 1 FROM session_attendance WHERE session_id = $1 AND student_id = $2 AND occurred_on = $3::date LIMIT 1`;
    const r = await pool.query(q, [sessionId, studentId, occurredOnISO]);
    return r.rows.length > 0;
  }

  static async checkIn(params: { sessionId: string; courseId: string; teacherId: string; studentId: string; occurredOnISO: string; source?: 'qr' | 'manual' | 'system'; }): Promise<AttendanceRecord> {
    const q = `
      INSERT INTO session_attendance (session_id, course_id, teacher_id, student_id, occurred_on, source)
      VALUES ($1, $2, $3, $4, $5::date, $6)
      ON CONFLICT (session_id, student_id, occurred_on) DO UPDATE SET updated_at = NOW()
      RETURNING id, session_id, course_id, teacher_id, student_id, occurred_on, checkin_at
    `;
    const r = await pool.query(q, [
      params.sessionId,
      params.courseId,
      params.teacherId,
      params.studentId,
      params.occurredOnISO,
      params.source || 'qr',
    ]);
    return r.rows[0] as AttendanceRecord;
  }

  static async getCheckedInStudentIds(sessionId: string, occurredOnISO: string): Promise<string[]> {
    const q = `
      SELECT DISTINCT student_id
      FROM session_attendance
      WHERE session_id = $1 AND occurred_on = $2::date
    `;
    const r = await pool.query(q, [sessionId, occurredOnISO]);
    return r.rows.map((row: any) => String(row.student_id));
  }
}

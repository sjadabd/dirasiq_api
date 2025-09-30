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

  // Strict: student must be explicitly attached to the session in session_attendees
  static async isStudentEligibleForSession(sessionId: string, _courseId: string, studentId: string): Promise<boolean> {
    const q = `SELECT 1 FROM session_attendees WHERE session_id = $1 AND student_id = $2 LIMIT 1`;
    const r = await pool.query(q, [sessionId, studentId]);
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

  // Get all students of a session with their attendance status for a given date
  static async getSessionAttendanceForDate(sessionId: string, dateISO: string): Promise<Array<{ student_id: string; student_name: string; status: 'present' | 'absent' | 'leave'; checkin_at: string | null }>> {
    const q = `
      SELECT
        sa.student_id::text,
        u.name AS student_name,
        a.meta->>'status' AS raw_status,
        a.checkin_at
      FROM session_attendees sa
      JOIN users u ON u.id = sa.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
      LEFT JOIN session_attendance a
        ON a.session_id = sa.session_id
       AND a.student_id = sa.student_id
       AND a.occurred_on = $2::date
      WHERE sa.session_id = $1
      ORDER BY u.name ASC
    `;
    const r = await pool.query(q, [sessionId, dateISO]);
    return r.rows.map((row: any) => {
      const raw = row.raw_status as string | null;
      let status: 'present' | 'absent' | 'leave';
      if (raw === 'leave') status = 'leave';
      else if (raw === 'present') status = 'present';
      else if (raw === 'absent') status = 'absent';
      else if (row.checkin_at) status = 'present';
      else status = 'absent';
      return {
        student_id: String(row.student_id),
        student_name: String(row.student_name),
        status,
        checkin_at: row.checkin_at || null,
      };
    });
  }

  // Bulk set attendance statuses for a session and date
  static async bulkSetAttendanceStatuses(params: {
    sessionId: string;
    courseId: string;
    teacherId: string;
    dateISO: string;
    items: Array<{ studentId: string; status: 'present' | 'absent' | 'leave' }>;
  }): Promise<{ updated: number }> {
    if (!params.items || params.items.length === 0) return { updated: 0 };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updated = 0;
      for (const it of params.items) {
        const q = `
          INSERT INTO session_attendance (session_id, course_id, teacher_id, student_id, occurred_on, source, meta)
          VALUES ($1, $2, $3, $4, $5::date, 'manual', jsonb_build_object('status', ($6::text)))
          ON CONFLICT (session_id, student_id, occurred_on)
          DO UPDATE SET
            meta = jsonb_set(COALESCE(session_attendance.meta, '{}'::jsonb), '{status}', to_jsonb(($6::text))),
            source = 'manual',
            updated_at = NOW()
        `;
        await client.query(q, [
          params.sessionId,
          params.courseId,
          params.teacherId,
          it.studentId,
          params.dateISO,
          it.status,
        ]);
        updated++;
      }
      await client.query('COMMIT');
      return { updated };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Get a student's attendance records for a specific course
  static async getStudentAttendanceByCourse(studentId: string, courseId: string): Promise<Array<{ occurred_on: string; status: 'present' | 'absent' | 'leave'; checkin_at: string | null; session_id: string }>> {
    const q = `
      SELECT
        a.session_id::text,
        a.occurred_on::text,
        a.checkin_at,
        a.meta->>'status' AS raw_status
      FROM session_attendance a
      WHERE a.student_id = $1
        AND a.course_id = $2
      ORDER BY a.occurred_on DESC, a.checkin_at DESC NULLS LAST
    `;
    const r = await pool.query(q, [studentId, courseId]);
    return r.rows.map((row: any) => {
      const raw = row.raw_status as string | null;
      let status: 'present' | 'absent' | 'leave';
      if (raw === 'leave') status = 'leave';
      else if (raw === 'absent') status = 'absent';
      else if (row.checkin_at) status = 'present';
      else status = 'absent';
      return {
        session_id: String(row.session_id),
        occurred_on: String(row.occurred_on),
        checkin_at: row.checkin_at || null,
        status,
      };
    });
  }
}

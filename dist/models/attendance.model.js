"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class AttendanceModel {
    static async findActiveSessionForTeacherNow(teacherId) {
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
        const r = await database_1.default.query(q, [teacherId]);
        return r.rows[0] || null;
    }
    static async isStudentEligibleForSession(sessionId, _courseId, studentId) {
        const q = `SELECT 1 FROM session_attendees WHERE session_id = $1 AND student_id = $2 LIMIT 1`;
        const r = await database_1.default.query(q, [sessionId, studentId]);
        return r.rows.length > 0;
    }
    static async hasCheckedIn(sessionId, studentId, occurredOnISO) {
        const q = `SELECT 1 FROM session_attendance WHERE session_id = $1 AND student_id = $2 AND occurred_on = $3::date LIMIT 1`;
        const r = await database_1.default.query(q, [sessionId, studentId, occurredOnISO]);
        return r.rows.length > 0;
    }
    static async checkIn(params) {
        const q = `
      INSERT INTO session_attendance (session_id, course_id, teacher_id, student_id, occurred_on, source)
      VALUES ($1, $2, $3, $4, $5::date, $6)
      ON CONFLICT (session_id, student_id, occurred_on) DO UPDATE SET updated_at = NOW()
      RETURNING id, session_id, course_id, teacher_id, student_id, occurred_on, checkin_at
    `;
        const r = await database_1.default.query(q, [
            params.sessionId,
            params.courseId,
            params.teacherId,
            params.studentId,
            params.occurredOnISO,
            params.source || 'qr',
        ]);
        return r.rows[0];
    }
    static async getCheckedInStudentIds(sessionId, occurredOnISO) {
        const q = `
      SELECT DISTINCT student_id
      FROM session_attendance
      WHERE session_id = $1 AND occurred_on = $2::date
    `;
        const r = await database_1.default.query(q, [sessionId, occurredOnISO]);
        return r.rows.map((row) => String(row.student_id));
    }
    static async getSessionAttendanceForDate(sessionId, dateISO) {
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
        const r = await database_1.default.query(q, [sessionId, dateISO]);
        return r.rows.map((row) => {
            const raw = row.raw_status;
            let status;
            if (raw === 'leave')
                status = 'leave';
            else if (raw === 'present')
                status = 'present';
            else if (raw === 'absent')
                status = 'absent';
            else if (row.checkin_at)
                status = 'present';
            else
                status = 'absent';
            return {
                student_id: String(row.student_id),
                student_name: String(row.student_name),
                status,
                checkin_at: row.checkin_at || null,
            };
        });
    }
    static async bulkSetAttendanceStatuses(params) {
        if (!params.items || params.items.length === 0)
            return { updated: 0 };
        const client = await database_1.default.connect();
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
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    static async getStudentAttendanceByCourse(studentId, courseId) {
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
        const r = await database_1.default.query(q, [studentId, courseId]);
        return r.rows.map((row) => {
            const raw = row.raw_status;
            let status;
            if (raw === 'leave')
                status = 'leave';
            else if (raw === 'absent')
                status = 'absent';
            else if (row.checkin_at)
                status = 'present';
            else
                status = 'absent';
            return {
                session_id: String(row.session_id),
                occurred_on: String(row.occurred_on),
                checkin_at: row.checkin_at || null,
                status,
            };
        });
    }
}
exports.AttendanceModel = AttendanceModel;
//# sourceMappingURL=attendance.model.js.map
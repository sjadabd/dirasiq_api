"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class SessionModel {
    static async createSession(input) {
        const query = `
      INSERT INTO sessions (
        course_id, teacher_id, title, weekday, start_time, end_time, recurrence,
        flex_type, flex_minutes, flex_alternates, hard_constraints, soft_constraints, state
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      ) RETURNING *
    `;
        const values = [
            input.course_id,
            input.teacher_id,
            input.title ?? null,
            input.weekday,
            input.start_time,
            input.end_time,
            input.recurrence ?? true,
            input.flex_type ?? 'window',
            input.flex_minutes ?? null,
            input.flex_alternates ? JSON.stringify(input.flex_alternates) : null,
            input.hard_constraints ? JSON.stringify(input.hard_constraints) : null,
            input.soft_constraints ? JSON.stringify(input.soft_constraints) : null,
            input.state ?? 'draft'
        ];
        const result = await database_1.default.query(query, values);
        return result.rows[0];
    }
    static async addAttendees(sessionId, studentIds) {
        if (!studentIds || studentIds.length === 0)
            return;
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const insert = `INSERT INTO session_attendees (session_id, student_id) VALUES ($1, $2)
                      ON CONFLICT DO NOTHING`;
            for (const sid of studentIds) {
                await client.query(insert, [sessionId, sid]);
            }
            await client.query('COMMIT');
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    static async removeAttendees(sessionId, studentIds) {
        if (!studentIds || studentIds.length === 0)
            return 0;
        const q = `
      DELETE FROM session_attendees
      WHERE session_id = $1 AND student_id = ANY($2::uuid[])
    `;
        const r = await database_1.default.query(q, [sessionId, studentIds]);
        return typeof r.rowCount === 'number' ? r.rowCount : 0;
    }
    static async listAttendeeIds(sessionId) {
        const q = `
      SELECT student_id FROM session_attendees
      WHERE session_id = $1
      ORDER BY student_id
    `;
        const r = await database_1.default.query(q, [sessionId]);
        return r.rows.map((row) => String(row.student_id));
    }
    static async listAttendeesDetailed(sessionId) {
        const q = `
      SELECT
        sa.student_id::text,
        u.name AS student_name,
        sg.grade_id::text,
        g.name AS grade_name,
        sg.study_year::text
      FROM session_attendees sa
      JOIN users u
        ON u.id = sa.student_id
       AND u.user_type = 'student'
       AND u.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT sg.grade_id, sg.study_year, sg.updated_at
        FROM student_grades sg
        WHERE sg.student_id = sa.student_id
          AND sg.is_active = true
          AND sg.deleted_at IS NULL
        ORDER BY sg.updated_at DESC
        LIMIT 1
      ) sg ON true
      LEFT JOIN grades g ON g.id = sg.grade_id
      WHERE sa.session_id = $1
      ORDER BY u.name ASC
    `;
        const r = await database_1.default.query(q, [sessionId]);
        return r.rows.map((row) => ({
            student_id: String(row.student_id),
            student_name: String(row.student_name),
            grade_id: row.grade_id ? String(row.grade_id) : null,
            grade_name: row.grade_name ? String(row.grade_name) : null,
            study_year: row.study_year ? String(row.study_year) : null,
        }));
    }
    static async getTeacherSessions(teacherId, page = 1, limit = 20, filters) {
        const offset = (page - 1) * limit;
        const countConds = ['teacher_id = $1', 'is_deleted = false'];
        const countParams = [teacherId];
        let pIndex = 2;
        if (filters && filters.weekday !== undefined && filters.weekday !== null) {
            countConds.push(`weekday = $${pIndex}`);
            countParams.push(filters.weekday);
            pIndex++;
        }
        if (filters && filters.courseId) {
            countConds.push(`course_id = $${pIndex}`);
            countParams.push(filters.courseId);
            pIndex++;
        }
        const countQ = `SELECT COUNT(*) FROM sessions WHERE ${countConds.join(' AND ')}`;
        const listConds = ['s.teacher_id = $1', 's.is_deleted = false'];
        const listParams = [teacherId];
        let lIndex = 2;
        if (filters && filters.weekday !== undefined && filters.weekday !== null) {
            listConds.push(`s.weekday = $${lIndex}`);
            listParams.push(filters.weekday);
            lIndex++;
        }
        if (filters && filters.courseId) {
            listConds.push(`s.course_id = $${lIndex}`);
            listParams.push(filters.courseId);
            lIndex++;
        }
        const listQ = `
      SELECT
        s.*,
        c.course_name,
        c.study_year,
        c.grade_id,
        c.subject_id,
        g.name AS grade_name,
        sub.name AS subject_name,
        (
          SELECT COUNT(*)::int
          FROM session_attendees sa
          WHERE sa.session_id = s.id
        ) AS attendees_count
      FROM sessions s
      JOIN courses c ON c.id = s.course_id
      LEFT JOIN grades g ON g.id = c.grade_id
      LEFT JOIN subjects sub ON sub.id = c.subject_id
      WHERE ${listConds.join(' AND ')}
      ORDER BY s.weekday, s.start_time
      LIMIT $${lIndex} OFFSET $${lIndex + 1}
    `;
        const total = parseInt((await database_1.default.query(countQ, countParams)).rows[0].count);
        const sessions = (await database_1.default.query(listQ, [...listParams, limit, offset])).rows;
        return { sessions, total };
    }
    static async getStudentWeeklySchedule(studentId, weekStartISO) {
        const query = `
      SELECT s.*, c.course_name, u.name as teacher_name
      FROM sessions s
      JOIN courses c ON c.id = s.course_id
      JOIN users u ON u.id = s.teacher_id
      WHERE s.is_deleted = false
        AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
        AND EXISTS (
          SELECT 1 FROM session_attendees sa
          WHERE sa.session_id = s.id AND sa.student_id = $1
        )
    `;
        const result = await database_1.default.query(query, [studentId]);
        const weekStart = new Date(weekStartISO);
        weekStart.setHours(0, 0, 0, 0);
        const schedule = result.rows.map((row) => {
            const weekday = Number(row.weekday);
            const dayOffset = (weekday - weekStart.getDay() + 7) % 7;
            const date = new Date(weekStart.getTime() + dayOffset * 24 * 60 * 60 * 1000);
            const [sh, sm, ss] = String(row.start_time).split(':').map((x) => parseInt(x, 10));
            const [eh, em, es] = String(row.end_time).split(':').map((x) => parseInt(x, 10));
            const startAt = new Date(date);
            startAt.setHours(sh || 0, sm || 0, ss || 0, 0);
            const endAt = new Date(date);
            endAt.setHours(eh || 0, em || 0, es || 0, 0);
            return {
                sessionId: row.id,
                courseId: row.course_id,
                courseName: row.course_name,
                teacherId: row.teacher_id,
                teacherName: row.teacher_name,
                title: row.title,
                weekday,
                startTime: row.start_time,
                endTime: row.end_time,
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString(),
                state: row.state,
                flexType: row.flex_type,
                flexMinutes: row.flex_minutes,
                flexAlternates: row.flex_alternates,
            };
        });
        const byDay = {};
        for (const s of schedule) {
            const dayKey = s.startAt.substring(0, 10);
            byDay[dayKey] = byDay[dayKey] || [];
            byDay[dayKey].push(s);
        }
        for (const sessions of Object.values(byDay)) {
            sessions.sort((a, b) => a.startAt.localeCompare(b.startAt));
            for (let i = 0; i < sessions.length; i++) {
                const A = sessions[i];
                const aStart = new Date(A.startAt).getTime();
                const aEnd = new Date(A.endAt).getTime();
                for (let j = i + 1; j < sessions.length; j++) {
                    const B = sessions[j];
                    const bStart = new Date(B.startAt).getTime();
                    const bEnd = new Date(B.endAt).getTime();
                    const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
                    if (overlap > 0) {
                        A.conflict = true;
                        B.conflict = true;
                    }
                }
            }
        }
        return schedule;
    }
    static async getById(id) {
        const q = `SELECT * FROM sessions WHERE id = $1 AND is_deleted = false`;
        const r = await database_1.default.query(q, [id]);
        return r.rows[0] ? r.rows[0] : null;
    }
    static async hasConflict(params) {
        const q = `
      SELECT 1
      FROM sessions
      WHERE teacher_id = $1
        AND weekday = $2
        AND is_deleted = false
        AND (start_time < $4::time)
        AND (end_time   > $3::time)
        ${params.excludeSessionId ? 'AND id <> $5' : ''}
      LIMIT 1
    `;
        const args = [
            params.teacherId,
            params.weekday,
            params.startTime,
            params.endTime,
            params.excludeSessionId,
        ].filter((v) => v !== undefined);
        const r = await database_1.default.query(q, args);
        return r.rows.length > 0;
    }
    static async updateSession(id, input) {
        const fields = [];
        const values = [];
        let idx = 1;
        const setJson = (col, val) => {
            fields.push(`${col} = $${idx}`);
            values.push(val !== undefined && val !== null ? JSON.stringify(val) : null);
            idx++;
        };
        if (input.title !== undefined) {
            fields.push(`title = $${idx}`);
            values.push(input.title);
            idx++;
        }
        if (input.weekday !== undefined) {
            fields.push(`weekday = $${idx}`);
            values.push(input.weekday);
            idx++;
        }
        if (input.start_time !== undefined) {
            fields.push(`start_time = $${idx}`);
            values.push(input.start_time);
            idx++;
        }
        if (input.end_time !== undefined) {
            fields.push(`end_time = $${idx}`);
            values.push(input.end_time);
            idx++;
        }
        if (input.recurrence !== undefined) {
            fields.push(`recurrence = $${idx}`);
            values.push(input.recurrence);
            idx++;
        }
        if (input.flex_type !== undefined) {
            fields.push(`flex_type = $${idx}`);
            values.push(input.flex_type);
            idx++;
        }
        if (input.flex_minutes !== undefined) {
            fields.push(`flex_minutes = $${idx}`);
            values.push(input.flex_minutes);
            idx++;
        }
        if (input.flex_alternates !== undefined) {
            setJson('flex_alternates', input.flex_alternates);
        }
        if (input.hard_constraints !== undefined) {
            setJson('hard_constraints', input.hard_constraints);
        }
        if (input.soft_constraints !== undefined) {
            setJson('soft_constraints', input.soft_constraints);
        }
        if (input.state !== undefined) {
            fields.push(`state = $${idx}`);
            values.push(input.state);
            idx++;
        }
        if (fields.length === 0)
            return await this.getById(id);
        fields.push(`updated_at = NOW()`);
        values.push(id);
        const q = `
      UPDATE sessions
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;
        const r = await database_1.default.query(q, values);
        return r.rows[0] || null;
    }
    static async softDeleteSession(id) {
        const q = `UPDATE sessions SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND is_deleted = false`;
        const r = await database_1.default.query(q, [id]);
        const affected = typeof r?.rowCount === 'number' ? r.rowCount : 0;
        return affected > 0;
    }
}
exports.SessionModel = SessionModel;
//# sourceMappingURL=session.model.js.map
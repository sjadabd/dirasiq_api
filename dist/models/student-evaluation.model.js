"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentEvaluationModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class StudentEvaluationModel {
    static async upsertMany(teacherId, evalDate, items) {
        if (!items || items.length === 0)
            return [];
        const rows = [];
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            for (const it of items) {
                const q = `
          INSERT INTO student_evaluations (
            student_id, teacher_id, eval_date, eval_date_date,
            scientific_level, behavioral_level, attendance_level,
            homework_preparation, participation_level, instruction_following,
            guidance, notes, created_at, updated_at
          ) VALUES (
            $1, $2, $3, DATE($3),
            $4, $5, $6,
            $7, $8, $9,
            $10, $11, NOW(), NOW()
          )
          ON CONFLICT (student_id, teacher_id, eval_date_date)
          DO UPDATE SET
            scientific_level = EXCLUDED.scientific_level,
            behavioral_level = EXCLUDED.behavioral_level,
            attendance_level = EXCLUDED.attendance_level,
            homework_preparation = EXCLUDED.homework_preparation,
            participation_level = EXCLUDED.participation_level,
            instruction_following = EXCLUDED.instruction_following,
            guidance = EXCLUDED.guidance,
            notes = EXCLUDED.notes,
            eval_date = EXCLUDED.eval_date,
            updated_at = NOW()
          RETURNING *;
        `;
                const r = await client.query(q, [
                    it.student_id,
                    teacherId,
                    evalDate,
                    it.scientific_level,
                    it.behavioral_level,
                    it.attendance_level,
                    it.homework_preparation,
                    it.participation_level,
                    it.instruction_following,
                    it.guidance ?? null,
                    it.notes ?? null,
                ]);
                rows.push(r.rows[0]);
            }
            await client.query('COMMIT');
            return rows;
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    static async update(id, patch) {
        const fields = [];
        const values = [];
        let p = 1;
        const setField = (name, val) => {
            fields.push(`${name} = $${p}`);
            values.push(val);
            p++;
        };
        const allowed = [
            'scientific_level', 'behavioral_level', 'attendance_level', 'homework_preparation', 'participation_level', 'instruction_following', 'guidance', 'notes', 'eval_date'
        ];
        for (const key of allowed) {
            const v = patch[key];
            if (v !== undefined)
                setField(key, v);
        }
        if (fields.length === 0) {
            const r0 = await database_1.default.query('SELECT * FROM student_evaluations WHERE id = $1', [id]);
            return r0.rows[0] || null;
        }
        if (patch.eval_date !== undefined) {
            fields.push(`eval_date_date = DATE($${p - 1})`);
        }
        const q = `
      UPDATE student_evaluations
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${p}
      RETURNING *;
    `;
        values.push(id);
        const r = await database_1.default.query(q, values);
        return r.rows[0] || null;
    }
    static async getById(id) {
        const r = await database_1.default.query('SELECT * FROM student_evaluations WHERE id = $1', [id]);
        return r.rows[0] || null;
    }
    static async listForTeacher(teacherId, options) {
        const page = options.page && options.page > 0 ? options.page : 1;
        const limit = options.limit && options.limit > 0 ? options.limit : 20;
        const offset = (page - 1) * limit;
        const where = ['teacher_id = $1'];
        const vals = [teacherId];
        let p = 2;
        if (options.studentId) {
            where.push(`student_id = $${p}`);
            vals.push(options.studentId);
            p++;
        }
        if (options.from) {
            where.push(`eval_date_date >= $${p}`);
            vals.push(options.from);
            p++;
        }
        if (options.to) {
            where.push(`eval_date_date <= $${p}`);
            vals.push(options.to);
            p++;
        }
        const dataQ = `SELECT * FROM student_evaluations WHERE ${where.join(' AND ')} ORDER BY eval_date_date DESC, created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
        const data = (await database_1.default.query(dataQ, [...vals, limit, offset])).rows;
        const countQ = `SELECT COUNT(*)::int AS c FROM student_evaluations WHERE ${where.join(' AND ')}`;
        const total = (await database_1.default.query(countQ, vals)).rows[0].c;
        return { data, total };
    }
    static async listForStudent(studentId, options) {
        const page = options.page && options.page > 0 ? options.page : 1;
        const limit = options.limit && options.limit > 0 ? options.limit : 20;
        const offset = (page - 1) * limit;
        const where = ['student_id = $1'];
        const vals = [studentId];
        let p = 2;
        if (options.from) {
            where.push(`eval_date_date >= $${p}`);
            vals.push(options.from);
            p++;
        }
        if (options.to) {
            where.push(`eval_date_date <= $${p}`);
            vals.push(options.to);
            p++;
        }
        const dataQ = `SELECT * FROM student_evaluations WHERE ${where.join(' AND ')} ORDER BY eval_date_date DESC, created_at DESC LIMIT $${p} OFFSET $${p + 1}`;
        const data = (await database_1.default.query(dataQ, [...vals, limit, offset])).rows;
        const countQ = `SELECT COUNT(*)::int AS c FROM student_evaluations WHERE ${where.join(' AND ')}`;
        const total = (await database_1.default.query(countQ, vals)).rows[0].c;
        return { data, total };
    }
}
exports.StudentEvaluationModel = StudentEvaluationModel;
//# sourceMappingURL=student-evaluation.model.js.map
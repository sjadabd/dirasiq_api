"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherDashboardController = void 0;
const database_1 = __importDefault(require("../../config/database"));
const types_1 = require("../../types");
class TeacherDashboardController {
    static async getDashboard(req, res) {
        try {
            const teacherId = req.user?.id;
            if (!teacherId) {
                res.status(401).json({
                    success: false,
                    message: 'المصادقة مطلوبة',
                    errors: ['المستخدم غير مصادق عليه']
                });
                return;
            }
            const queries = {
                totalCourses: `
          SELECT COUNT(*)::int AS count
          FROM courses
          WHERE teacher_id = $1 AND is_deleted = false
        `,
                activeCourses: `
          SELECT COUNT(*)::int AS count
          FROM courses
          WHERE teacher_id = $1
            AND is_deleted = false
            AND end_date >= CURRENT_DATE
        `,
                totalStudents: `
          SELECT COUNT(DISTINCT student_id)::int AS count
          FROM course_bookings
          WHERE teacher_id = $1
            AND is_deleted = false
        `,
                activeStudents: `
          SELECT COUNT(DISTINCT student_id)::int AS count
          FROM course_bookings
          WHERE teacher_id = $1
            AND is_deleted = false
            AND status = $2
        `,
                sessionsToday: `
          SELECT COUNT(*)::int AS count
          FROM sessions
          WHERE teacher_id = $1
            AND is_deleted = false
            AND weekday = EXTRACT(DOW FROM CURRENT_DATE)::int
        `,
                depositsTotals: `
          SELECT
            COALESCE(SUM(amount), 0)::float AS total_deposit,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0)::float AS received_deposit
          FROM reservation_payments
          WHERE teacher_id = $1
       `,
                studentInvoicesTotals: `
         SELECT
           COALESCE(SUM(amount_due), 0)::float AS total_due,
           COALESCE(SUM(amount_paid), 0)::float AS amount_paid,
           COALESCE(SUM(remaining_amount), 0)::float AS amount_remaining
         FROM course_invoices
         WHERE teacher_id = $1 AND deleted_at IS NULL
       `,
            };
            const [totalCoursesR, activeCoursesR, totalStudentsR, activeStudentsR, sessionsTodayR, depositsTotalsR, studentInvoicesTotalsR] = await Promise.all([
                database_1.default.query(queries.totalCourses, [teacherId]),
                database_1.default.query(queries.activeCourses, [teacherId]),
                database_1.default.query(queries.totalStudents, [teacherId]),
                database_1.default.query(queries.activeStudents, [teacherId, types_1.BookingStatus.CONFIRMED]),
                database_1.default.query(queries.sessionsToday, [teacherId]),
                database_1.default.query(queries.depositsTotals, [teacherId]),
                database_1.default.query(queries.studentInvoicesTotals, [teacherId])
            ]);
            const totalDeposit = Number(depositsTotalsR.rows[0]?.total_deposit ?? 0);
            const receivedDeposit = Number(depositsTotalsR.rows[0]?.received_deposit ?? 0);
            const remainingDeposit = Math.max(0, totalDeposit - receivedDeposit);
            res.status(200).json({
                success: true,
                message: 'بيانات لوحة التحكم للمعلم',
                data: {
                    totalStudents: totalStudentsR.rows[0]?.count ?? 0,
                    totalCourses: totalCoursesR.rows[0]?.count ?? 0,
                    activeStudents: activeStudentsR.rows[0]?.count ?? 0,
                    activeCourses: activeCoursesR.rows[0]?.count ?? 0,
                    sessionsToday: sessionsTodayR.rows[0]?.count ?? 0,
                    totalDeposit,
                    receivedDeposit,
                    remainingDeposit,
                    depositInvoices: {
                        totalAmount: totalDeposit,
                        receivedAmount: receivedDeposit,
                        remainingAmount: remainingDeposit,
                    },
                    studentInvoices: {
                        totalDue: Number(studentInvoicesTotalsR.rows[0]?.total_due ?? 0),
                        amountPaid: Number(studentInvoicesTotalsR.rows[0]?.amount_paid ?? 0),
                        amountRemaining: Number(studentInvoicesTotalsR.rows[0]?.amount_remaining ?? 0),
                    },
                }
            });
        }
        catch (error) {
            console.error('Error in TeacherDashboardController.getDashboard:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getTodayUpcomingSessions(req, res) {
        try {
            const teacherId = req.user?.id;
            if (!teacherId) {
                res.status(401).json({
                    success: false,
                    message: 'المصادقة مطلوبة',
                    errors: ['المستخدم غير مصادق عليه']
                });
                return;
            }
            const q = `
        SELECT
          s.id,
          s.course_id,
          s.teacher_id,
          s.title,
          s.weekday,
          s.start_time,
          s.end_time,
          s.state,
          c.course_name
        FROM sessions s
        JOIN courses c ON c.id = s.course_id
        WHERE s.teacher_id = $1
          AND s.is_deleted = false
          AND s.weekday = EXTRACT(DOW FROM CURRENT_DATE)::int
          AND s.state IN ('draft','proposed','conflict','confirmed','negotiating')
          AND s.start_time >= CURRENT_TIME
        ORDER BY s.start_time ASC
      `;
            const r = await database_1.default.query(q, [teacherId]);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const items = r.rows.map((row) => {
                const [sh, sm, ss] = String(row.start_time).split(':').map((x) => parseInt(x, 10));
                const [eh, em, es] = String(row.end_time).split(':').map((x) => parseInt(x, 10));
                const startAt = new Date(today);
                startAt.setHours(sh || 0, sm || 0, ss || 0, 0);
                const endAt = new Date(today);
                endAt.setHours(eh || 0, em || 0, es || 0, 0);
                return {
                    sessionId: String(row.id),
                    courseId: String(row.course_id),
                    courseName: String(row.course_name),
                    title: row.title || null,
                    startTime: row.start_time,
                    endTime: row.end_time,
                    startAt: startAt.toISOString(),
                    endAt: endAt.toISOString(),
                    state: row.state,
                };
            });
            res.status(200).json({
                success: true,
                message: 'الدروس القادمة لليوم',
                data: items,
                count: items.length,
            });
        }
        catch (error) {
            console.error('Error in TeacherDashboardController.getTodayUpcomingSessions:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.TeacherDashboardController = TeacherDashboardController;
//# sourceMappingURL=dashboard.controller.js.map
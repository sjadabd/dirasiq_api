"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentDashboardController = void 0;
const student_service_1 = require("../../services/student/student.service");
class StudentDashboardController {
    static async getOverview(req, res) {
        try {
            const studentId = req.user.id;
            const result = await student_service_1.StudentService.getDashboardOverview(studentId);
            res.status(result.success ? 200 : 400).json(result);
        }
        catch (error) {
            console.error('Error in StudentDashboardController.getOverview:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async getWeeklySchedule(req, res) {
        try {
            const studentId = req.user.id;
            const result = await student_service_1.StudentService.getWeeklySchedule(studentId);
            res.status(result.success ? 200 : 400).json(result);
        }
        catch (error) {
            console.error('Error in StudentDashboardController.getWeeklySchedule:', error);
            res
                .status(500)
                .json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
}
exports.StudentDashboardController = StudentDashboardController;
//# sourceMappingURL=dashboard.controller.js.map
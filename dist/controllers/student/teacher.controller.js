"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentTeacherController = void 0;
const express_validator_1 = require("express-validator");
const student_service_1 = require("../../services/student/student.service");
class StudentTeacherController {
    static async getSuggestedTeachers(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.query)('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage('المسافة القصوى غير صحيحة').run(req),
                (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req),
                (0, express_validator_1.query)('search').optional().isString().trim().run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(e => e.msg)
                });
                return;
            }
            const studentId = req.user.id;
            const { maxDistance = '5', page = '1', limit = '10', search } = req.query;
            const result = await student_service_1.StudentService.getSuggestedTeachersForStudent(studentId, search, Number(maxDistance), Number(page), Number(limit));
            res.status(result.success ? 200 : 400).json(result);
        }
        catch (error) {
            console.error('Error in getSuggestedTeachers controller:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async getTeacherSubjectsAndCourses(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.param)('teacherId').isString().notEmpty().withMessage('معرف المعلم مطلوب').run(req),
                (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
                (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req),
                (0, express_validator_1.query)('search').optional().isString().trim().run(req),
                (0, express_validator_1.query)('gradeId').optional().isString().trim().run(req),
                (0, express_validator_1.query)('subjectId').optional().isString().trim().run(req),
                (0, express_validator_1.query)('studyYear').optional().isString().trim().run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(e => e.msg)
                });
                return;
            }
            const { teacherId } = req.params;
            const { page = '1', limit = '10', search, gradeId, subjectId, studyYear } = req.query;
            const result = await student_service_1.StudentService.getTeacherSubjectsAndCoursesForStudent(teacherId, Number(page), Number(limit), search, gradeId, subjectId, studyYear);
            res.status(result.success ? 200 : 400).json(result);
        }
        catch (error) {
            console.error('Error in getTeacherSubjectsAndCourses controller:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
}
exports.StudentTeacherController = StudentTeacherController;
//# sourceMappingURL=teacher.controller.js.map
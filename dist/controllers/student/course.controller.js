"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentCourseController = void 0;
const express_validator_1 = require("express-validator");
const student_service_1 = require("../../services/student/student.service");
class StudentCourseController {
    static async getSuggestedCourses(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage('المسافة القصوى غير صحيحة').run(req),
                (0, express_validator_1.body)('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
                (0, express_validator_1.body)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const studentId = req.user.id;
            const { maxDistance = 5, page = 1, limit = 10 } = req.query;
            const gradesResult = await student_service_1.StudentService.getActiveGrades(studentId);
            if (!gradesResult.success) {
                res.status(404).json(gradesResult);
                return;
            }
            const locationResult = await student_service_1.StudentService.validateStudentLocation(studentId);
            if (!locationResult.success) {
                res.status(400).json(locationResult);
                return;
            }
            const studentGrades = gradesResult.data.grades;
            const studentLocation = locationResult.data.location;
            const result = await student_service_1.StudentService.getSuggestedCoursesForStudent(studentId, studentGrades, studentLocation, Number(maxDistance), Number(page), Number(limit));
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in getSuggestedCourses controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getCourseById(req, res) {
        try {
            const { id } = req.params;
            const studentId = req.user.id;
            if (!id) {
                res.status(400).json({
                    success: false,
                    message: 'معرف الدورة مطلوب',
                    errors: ['معرف الدورة مطلوب']
                });
                return;
            }
            const result = await student_service_1.StudentService.getCourseByIdForStudent(id, studentId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in getCourseById controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.StudentCourseController = StudentCourseController;
//# sourceMappingURL=course.controller.js.map
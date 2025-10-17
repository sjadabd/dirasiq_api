"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const exam_controller_1 = require("../../controllers/teacher/exam.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.create);
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.list);
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.getById);
router.patch('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.update);
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.remove);
router.get('/:id/students', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.students);
router.put('/:examId/grade/:studentId', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, exam_controller_1.TeacherExamController.grade);
exports.default = router;
//# sourceMappingURL=exam.routes.js.map
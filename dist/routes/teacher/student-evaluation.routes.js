"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const student_evaluation_controller_1 = require("../../controllers/teacher/student-evaluation.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/bulk-upsert', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, student_evaluation_controller_1.TeacherStudentEvaluationController.bulkUpsert);
router.patch('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, student_evaluation_controller_1.TeacherStudentEvaluationController.update);
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, student_evaluation_controller_1.TeacherStudentEvaluationController.list);
router.get('/students-with-eval', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, student_evaluation_controller_1.TeacherStudentEvaluationController.studentsWithEvaluation);
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, student_evaluation_controller_1.TeacherStudentEvaluationController.getById);
exports.default = router;
//# sourceMappingURL=student-evaluation.routes.js.map
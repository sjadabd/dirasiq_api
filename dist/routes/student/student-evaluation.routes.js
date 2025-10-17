"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const student_evaluation_controller_1 = require("../../controllers/student/student-evaluation.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, student_evaluation_controller_1.StudentStudentEvaluationController.list);
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, student_evaluation_controller_1.StudentStudentEvaluationController.getById);
exports.default = router;
//# sourceMappingURL=student-evaluation.routes.js.map
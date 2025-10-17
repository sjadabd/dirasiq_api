"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const exam_controller_1 = require("../../controllers/student/exam.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, exam_controller_1.StudentExamController.list);
router.get('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, exam_controller_1.StudentExamController.getById);
router.get('/:id/my-grade', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, exam_controller_1.StudentExamController.myGrade);
router.get('/report/by-type', auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent, exam_controller_1.StudentExamController.report);
exports.default = router;
//# sourceMappingURL=exam.routes.js.map
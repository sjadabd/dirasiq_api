"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const teacher_controller_1 = require("../../controllers/student/teacher.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/suggested', teacher_controller_1.StudentTeacherController.getSuggestedTeachers);
router.get('/:teacherId/subjects-courses', teacher_controller_1.StudentTeacherController.getTeacherSubjectsAndCourses);
exports.default = router;
//# sourceMappingURL=teacher.routes.js.map
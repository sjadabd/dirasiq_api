"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const roster_controller_1 = require("../../controllers/teacher/roster.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher);
router.get('/', roster_controller_1.TeacherRosterController.listAllStudents);
router.get('/by-course/:courseId', roster_controller_1.TeacherRosterController.listStudentsByCourse);
router.get('/by-session/:sessionId', roster_controller_1.TeacherRosterController.listStudentsBySession);
router.get('/sessions/names', roster_controller_1.TeacherRosterController.listSessionNames);
router.get('/courses/names', roster_controller_1.TeacherRosterController.listCourseNames);
exports.default = router;
//# sourceMappingURL=roster.routes.js.map
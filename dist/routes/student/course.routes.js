"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const course_controller_1 = require("../../controllers/student/course.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/suggested', course_controller_1.StudentCourseController.getSuggestedCourses);
router.get('/:id', course_controller_1.StudentCourseController.getCourseById);
exports.default = router;
//# sourceMappingURL=course.routes.js.map
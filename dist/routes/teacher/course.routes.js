"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const course_controller_1 = require("../../controllers/teacher/course.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.use(auth_middleware_1.requireTeacher);
router.post('/', course_controller_1.CourseController.create);
router.get('/', course_controller_1.CourseController.getAll);
router.get('/names', course_controller_1.CourseController.listNamesForActiveYear);
router.get('/deleted-not-expired', course_controller_1.CourseController.getDeletedNotExpired);
router.get('/:id', course_controller_1.CourseController.getById);
router.put('/:id', course_controller_1.CourseController.update);
router.delete('/:id', course_controller_1.CourseController.delete);
router.patch('/:id/restore', course_controller_1.CourseController.restore);
exports.default = router;
//# sourceMappingURL=course.routes.js.map
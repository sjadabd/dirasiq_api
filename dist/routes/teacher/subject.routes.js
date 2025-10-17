"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subject_controller_1 = require("../../controllers/teacher/subject.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.use(auth_middleware_1.requireTeacher);
router.post('/', subject_controller_1.SubjectController.create);
router.get('/', subject_controller_1.SubjectController.getAll);
router.get('/all', subject_controller_1.SubjectController.getAllSubjects);
router.get('/:id', subject_controller_1.SubjectController.getById);
router.put('/:id', subject_controller_1.SubjectController.update);
router.delete('/:id', subject_controller_1.SubjectController.delete);
router.patch('/:id/restore', subject_controller_1.SubjectController.restore);
router.delete('/:id/hard', subject_controller_1.SubjectController.hardDelete);
exports.default = router;
//# sourceMappingURL=subject.routes.js.map
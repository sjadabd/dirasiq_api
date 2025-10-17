"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const expense_controller_1 = require("../../controllers/teacher/expense.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, expense_controller_1.TeacherExpenseController.create);
router.get('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, expense_controller_1.TeacherExpenseController.list);
router.patch('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, expense_controller_1.TeacherExpenseController.update);
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, expense_controller_1.TeacherExpenseController.remove);
exports.default = router;
//# sourceMappingURL=expense.routes.js.map
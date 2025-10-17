"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const academic_year_controller_1 = require("../../controllers/super_admin/academic-year.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.use(auth_middleware_1.requireSuperAdmin);
router.post('/', academic_year_controller_1.AcademicYearController.create);
router.get('/active', academic_year_controller_1.AcademicYearController.getActive);
router.get('/', academic_year_controller_1.AcademicYearController.getAll);
router.get('/:id', academic_year_controller_1.AcademicYearController.getById);
router.put('/:id', academic_year_controller_1.AcademicYearController.update);
router.delete('/:id', academic_year_controller_1.AcademicYearController.delete);
router.patch('/:id/activate', academic_year_controller_1.AcademicYearController.activate);
exports.default = router;
//# sourceMappingURL=academic-year.routes.js.map
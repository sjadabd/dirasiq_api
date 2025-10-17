"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const teacher_search_controller_1 = require("../controllers/teacher-search.controller");
const router = (0, express_1.Router)();
router.get('/search/coordinates', teacher_search_controller_1.TeacherSearchController.searchByCoordinates);
router.get('/search/location', teacher_search_controller_1.TeacherSearchController.searchByLocation);
router.get('/governorates', teacher_search_controller_1.TeacherSearchController.getGovernorates);
router.get('/cities/:governorate', teacher_search_controller_1.TeacherSearchController.getCities);
exports.default = router;
//# sourceMappingURL=teacher-search.routes.js.map
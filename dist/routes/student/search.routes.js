"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const search_controller_1 = require("../../controllers/student/search.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken, auth_middleware_1.requireStudent);
router.get('/unified', search_controller_1.StudentSearchController.unified);
exports.default = router;
//# sourceMappingURL=search.routes.js.map
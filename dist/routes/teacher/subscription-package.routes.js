"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscription_package_controller_1 = require("../../controllers/super_admin/subscription-package.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const optionalAuth_1 = require("../../middleware/optionalAuth");
const router = (0, express_1.Router)();
router.get('/active', optionalAuth_1.optionalAuth, subscription_package_controller_1.SubscriptionPackageController.getActivePackages);
router.get('/:id', subscription_package_controller_1.SubscriptionPackageController.getPackageById);
router.post('/:id/activate', auth_middleware_1.authenticateToken, auth_middleware_1.requireTeacher, subscription_package_controller_1.SubscriptionPackageController.activateForTeacher);
exports.default = router;
//# sourceMappingURL=subscription-package.routes.js.map
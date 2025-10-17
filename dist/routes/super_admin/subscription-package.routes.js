"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const subscription_package_controller_1 = require("../../controllers/super_admin/subscription-package.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.use(auth_middleware_1.requireSuperAdmin);
router.get('/active', subscription_package_controller_1.SubscriptionPackageController.getActivePackages);
router.get('/free', subscription_package_controller_1.SubscriptionPackageController.getFreePackage);
router.get('/:id', subscription_package_controller_1.SubscriptionPackageController.getPackageById);
router.post('/', subscription_package_controller_1.SubscriptionPackageController.createPackage);
router.put('/:id', subscription_package_controller_1.SubscriptionPackageController.updatePackage);
router.patch('/:id/activate', subscription_package_controller_1.SubscriptionPackageController.activatePackage);
router.patch('/:id/deactivate', subscription_package_controller_1.SubscriptionPackageController.deactivatePackage);
router.delete('/:id', subscription_package_controller_1.SubscriptionPackageController.deletePackage);
router.get('/', subscription_package_controller_1.SubscriptionPackageController.getAllPackages);
exports.default = router;
//# sourceMappingURL=subscription-package.routes.js.map
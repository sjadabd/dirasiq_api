"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const news_controller_1 = require("../../controllers/super_admin/news.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/', news_controller_1.NewsController.getAll);
router.get('/:id', news_controller_1.NewsController.getById);
router.use(auth_middleware_1.requireSuperAdmin);
router.post('/', news_controller_1.NewsController.create);
router.put('/:id', news_controller_1.NewsController.update);
router.delete('/:id', news_controller_1.NewsController.delete);
router.patch('/:id/publish', news_controller_1.NewsController.publish);
exports.default = router;
//# sourceMappingURL=news.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentSearchController = void 0;
const express_validator_1 = require("express-validator");
const search_service_1 = require("../../services/student/search.service");
class StudentSearchController {
    static async unified(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.query)('q')
                    .optional()
                    .isString()
                    .isLength({ min: 1 })
                    .withMessage('نص البحث غير صالح')
                    .run(req),
                (0, express_validator_1.query)('maxDistance')
                    .optional()
                    .isFloat({ min: 0.5, max: 50 })
                    .withMessage('المسافة القصوى غير صحيحة')
                    .run(req),
                (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
                (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد غير صحيح').run(req),
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل التحقق من البيانات',
                    errors: errors.array().map((e) => e.msg),
                });
                return;
            }
            const studentId = req.user?.id;
            const { q, maxDistance, page, limit } = req.query;
            const params = {};
            if (typeof q === 'string' && q.trim() !== '')
                params.q = q;
            if (typeof maxDistance === 'string' && maxDistance !== '')
                params.maxDistance = Number(maxDistance);
            if (typeof page === 'string' && page !== '')
                params.page = Number(page);
            if (typeof limit === 'string' && limit !== '')
                params.limit = Number(limit);
            const result = await search_service_1.StudentUnifiedSearchService.unifiedSearch(studentId, params);
            res.status(result.success ? 200 : 400).json(result);
        }
        catch (error) {
            console.error('Error in StudentSearchController.unified:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
}
exports.StudentSearchController = StudentSearchController;
//# sourceMappingURL=search.controller.js.map
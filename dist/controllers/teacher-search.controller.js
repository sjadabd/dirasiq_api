"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherSearchController = void 0;
const express_validator_1 = require("express-validator");
const teacher_search_service_1 = require("../services/teacher-search.service");
class TeacherSearchController {
    static async searchByCoordinates(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('latitude').isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
                (0, express_validator_1.body)('longitude').isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
                (0, express_validator_1.body)('maxDistance').optional().isFloat({ min: 0.1, max: 50 }).withMessage('المسافة القصوى غير صحيحة').run(req),
                (0, express_validator_1.body)('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
                (0, express_validator_1.body)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { latitude, longitude, maxDistance, page, limit } = req.query;
            const searchParams = {
                latitude: Number(latitude),
                longitude: Number(longitude)
            };
            if (maxDistance)
                searchParams.maxDistance = Number(maxDistance);
            if (page)
                searchParams.page = Number(page);
            if (limit)
                searchParams.limit = Number(limit);
            const result = await teacher_search_service_1.TeacherSearchService.searchTeachersByCoordinates(searchParams);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in searchByCoordinates controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async searchByLocation(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('governorate').optional().isString().withMessage('المحافظة غير صحيحة').run(req),
                (0, express_validator_1.body)('city').optional().isString().withMessage('المدينة غير صحيحة').run(req),
                (0, express_validator_1.body)('district').optional().isString().withMessage('المنطقة غير صحيحة').run(req),
                (0, express_validator_1.body)('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة غير صحيح').run(req),
                (0, express_validator_1.body)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('الحد الأقصى غير صحيح').run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { governorate, city, district, page, limit } = req.query;
            if (!governorate && !city && !district) {
                res.status(400).json({
                    success: false,
                    message: 'الموقع مطلوب',
                    errors: ['الموقع مطلوب']
                });
                return;
            }
            const searchParams = {
                governorate: governorate,
                city: city,
                district: district
            };
            if (page)
                searchParams.page = Number(page);
            if (limit)
                searchParams.limit = Number(limit);
            const result = await teacher_search_service_1.TeacherSearchService.searchTeachersByLocation(searchParams);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in searchByLocation controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getGovernorates(_req, res) {
        try {
            const result = await teacher_search_service_1.TeacherSearchService.getAvailableGovernorates();
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in getGovernorates controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getCities(req, res) {
        try {
            const { governorate } = req.params;
            if (!governorate) {
                res.status(400).json({
                    success: false,
                    message: 'المحافظة مطلوبة',
                    errors: ['المحافظة مطلوبة']
                });
                return;
            }
            const result = await teacher_search_service_1.TeacherSearchService.getAvailableCities(governorate);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in getCities controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.TeacherSearchController = TeacherSearchController;
//# sourceMappingURL=teacher-search.controller.js.map
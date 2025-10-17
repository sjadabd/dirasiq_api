"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcademicYearController = void 0;
const express_validator_1 = require("express-validator");
const academic_year_service_1 = require("../../services/super_admin/academic-year.service");
class AcademicYearController {
    static async create(req, res) {
        try {
            await (0, express_validator_1.body)('year')
                .notEmpty()
                .withMessage('السنة الأكاديمية مطلوبة')
                .isLength({ min: 9, max: 9 })
                .withMessage('يجب أن تكون السنة 9 أحرف')
                .matches(/^\d{4}-\d{4}$/)
                .withMessage('يجب أن تكون السنة بصيغة YYYY-YYYY')
                .run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { year } = req.body;
            const result = await academic_year_service_1.AcademicYearService.create({ year });
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in create academic year controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getAll(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
                (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req),
                (0, express_validator_1.query)('search').optional().isString().withMessage('Search must be a string').run(req),
                (0, express_validator_1.query)('is_active').optional().isIn(['true', 'false', 'null']).withMessage('is_active must be true, false, or null').run(req)
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
            const page = parseInt(req.query['page']) || 1;
            const limit = parseInt(req.query['limit']) || 10;
            let search = req.query['search'];
            if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
                search = undefined;
            }
            let isActive = undefined;
            const isActiveParam = req.query['is_active'];
            if (isActiveParam === 'true') {
                isActive = true;
            }
            else if (isActiveParam === 'false') {
                isActive = false;
            }
            const result = await academic_year_service_1.AcademicYearService.getAll(page, limit, search, isActive);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get all academic years controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getById(req, res) {
        try {
            await (0, express_validator_1.param)('id')
                .isUUID()
                .withMessage('ID must be a valid UUID')
                .run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const id = req.params['id'] || '';
            const result = await academic_year_service_1.AcademicYearService.getById(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in get academic year by ID controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getActive(_req, res) {
        try {
            const result = await academic_year_service_1.AcademicYearService.getActive();
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in get active academic year controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async update(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.param)('id').isUUID().withMessage('ID must be a valid UUID').run(req),
                (0, express_validator_1.body)('year').optional().isLength({ min: 9, max: 9 }).withMessage('يجب أن تكون السنة 9 أحرف').run(req),
                (0, express_validator_1.body)('year').optional().matches(/^\d{4}-\d{4}$/).withMessage('يجب أن تكون السنة بصيغة YYYY-YYYY').run(req),
                (0, express_validator_1.body)('is_active').optional().isBoolean().withMessage('is_active must be a boolean').run(req)
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
            const id = req.params['id'] || '';
            const { year, is_active } = req.body;
            const result = await academic_year_service_1.AcademicYearService.update(id, { year, is_active });
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in update academic year controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async delete(req, res) {
        try {
            await (0, express_validator_1.param)('id')
                .isUUID()
                .withMessage('ID must be a valid UUID')
                .run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const id = req.params['id'] || '';
            const result = await academic_year_service_1.AcademicYearService.delete(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in delete academic year controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async activate(req, res) {
        try {
            await (0, express_validator_1.param)('id')
                .isUUID()
                .withMessage('ID must be a valid UUID')
                .run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const id = req.params['id'] || '';
            const result = await academic_year_service_1.AcademicYearService.activate(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in activate academic year controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.AcademicYearController = AcademicYearController;
//# sourceMappingURL=academic-year.controller.js.map
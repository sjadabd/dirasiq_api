"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeController = void 0;
const express_validator_1 = require("express-validator");
const grade_service_1 = require("../../services/super_admin/grade.service");
class GradeController {
    static async create(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('name').notEmpty().withMessage('اسم الصف مطلوب').run(req),
                (0, express_validator_1.body)('description').optional().isString().withMessage('Description must be a string').run(req),
                (0, express_validator_1.body)('isActive').optional().isBoolean().withMessage('isActive must be a boolean').run(req)
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
            const result = await grade_service_1.GradeService.create(req.body);
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in create grade controller:', error);
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
                (0, express_validator_1.query)('search').optional().isString().withMessage('Search must be a string').run(req)
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
            const result = await grade_service_1.GradeService.getAll(page, limit, search);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get all grades controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getAllActive(_req, res) {
        try {
            const result = await grade_service_1.GradeService.getAllActive();
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get all active grades controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getActive(_req, res) {
        try {
            const result = await grade_service_1.GradeService.getActive();
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get active grades controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getById(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('ID must be a valid UUID').run(req);
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
            const result = await grade_service_1.GradeService.getById(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in get grade by ID controller:', error);
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
                (0, express_validator_1.body)('name').optional().notEmpty().withMessage('اسم الصف مطلوب').run(req),
                (0, express_validator_1.body)('description').optional().isString().withMessage('Description must be a string').run(req),
                (0, express_validator_1.body)('isActive').optional().isBoolean().withMessage('isActive must be a boolean').run(req)
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
            const result = await grade_service_1.GradeService.update(id, req.body);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in update grade controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async delete(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('ID must be a valid UUID').run(req);
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
            const result = await grade_service_1.GradeService.delete(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in delete grade controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getUserGrades(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.query)('study_year').optional().isString().withMessage('Study year must be a string').run(req)
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
            const userId = req.user.id;
            const userType = req.user.userType;
            const studyYear = req.query['study_year'];
            const result = await grade_service_1.GradeService.getUserGrades(userId, userType, studyYear);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in get user grades controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.GradeController = GradeController;
//# sourceMappingURL=grade.controller.js.map
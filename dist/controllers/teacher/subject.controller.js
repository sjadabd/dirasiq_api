"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectController = void 0;
const express_validator_1 = require("express-validator");
const subject_service_1 = require("../../services/teacher/subject.service");
class SubjectController {
    static async create(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('name').notEmpty().withMessage('اسم المادة مطلوب').run(req),
                (0, express_validator_1.body)('description').optional().isString().withMessage('Description must be a string').run(req)
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
            const teacherId = req.user.id;
            const result = await subject_service_1.SubjectService.create(teacherId, req.body);
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in create subject controller:', error);
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
                (0, express_validator_1.query)('is_deleted').optional().custom((value) => {
                    if (value === undefined || value === null || value === 'null') {
                        return true;
                    }
                    if (value === 'true' || value === 'false') {
                        return true;
                    }
                    throw new Error('is_deleted must be true, false, or null');
                }).withMessage('is_deleted must be true, false, or null').run(req)
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
            const teacherId = req.user.id;
            const page = parseInt(req.query['page']) || 1;
            const limit = parseInt(req.query['limit']) || 10;
            const isDeletedParam = req.query['is_deleted'];
            let includeDeleted = null;
            if (isDeletedParam === 'true') {
                includeDeleted = true;
            }
            else if (isDeletedParam === 'false') {
                includeDeleted = false;
            }
            let search = req.query['search'];
            if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
                search = undefined;
            }
            const result = await subject_service_1.SubjectService.getAllByTeacher(teacherId, page, limit, search, includeDeleted);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get all subjects controller:', error);
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
            const teacherId = req.user.id;
            const id = req.params['id'] || '';
            const result = await subject_service_1.SubjectService.getById(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in get subject by ID controller:', error);
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
                (0, express_validator_1.body)('name').optional().notEmpty().withMessage('اسم المادة مطلوب').run(req),
                (0, express_validator_1.body)('description').optional().isString().withMessage('Description must be a string').run(req)
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
            const teacherId = req.user.id;
            const id = req.params['id'] || '';
            const result = await subject_service_1.SubjectService.update(id, teacherId, req.body);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in update subject controller:', error);
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
            const teacherId = req.user.id;
            const id = req.params['id'] || '';
            const result = await subject_service_1.SubjectService.delete(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in delete subject controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async restore(req, res) {
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
            const teacherId = req.user.id;
            const id = req.params['id'] || '';
            const result = await subject_service_1.SubjectService.restore(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in restore subject controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async hardDelete(req, res) {
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
            const teacherId = req.user.id;
            const id = req.params['id'] || '';
            const result = await subject_service_1.SubjectService.hardDelete(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in hard delete subject controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getAllSubjects(req, res) {
        try {
            const teacherId = req.user.id;
            const result = await subject_service_1.SubjectService.getAllSubjects(teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get all subjects controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.SubjectController = SubjectController;
//# sourceMappingURL=subject.controller.js.map
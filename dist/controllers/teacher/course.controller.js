"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseController = void 0;
const express_validator_1 = require("express-validator");
const course_service_1 = require("../../services/teacher/course.service");
class CourseController {
    static async listNamesForActiveYear(req, res) {
        try {
            const teacherId = req.user?.id;
            if (!teacherId) {
                res.status(401).json({ success: false, message: 'التحقق مطلوب', errors: ['التحقق مطلوب'] });
                return;
            }
            const result = await course_service_1.CourseService.listNamesForActiveYear(teacherId);
            res.status(result.success ? 200 : 400).json(result);
        }
        catch (error) {
            console.error('Error in listNamesForActiveYear controller:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم', errors: ['حدث خطأ في الخادم'] });
        }
    }
    static async create(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('study_year').notEmpty().withMessage('السنة الدراسية مطلوبة').run(req),
                (0, express_validator_1.body)('grade_id').isUUID().withMessage('Grade ID must be a valid UUID').run(req),
                (0, express_validator_1.body)('subject_id').isUUID().withMessage('Subject ID must be a valid UUID').run(req),
                (0, express_validator_1.body)('course_name').notEmpty().withMessage('اسم الدورة مطلوب').run(req),
                (0, express_validator_1.body)('start_date').isISO8601().withMessage('Start date must be a valid date').run(req),
                (0, express_validator_1.body)('end_date').isISO8601().withMessage('End date must be a valid date').run(req),
                (0, express_validator_1.body)('price').isFloat({ min: 0 }).withMessage('السعر غير صحيح').run(req),
                (0, express_validator_1.body)('seats_count').isInt({ min: 1 }).withMessage('عدد المقاعد غير صحيح').run(req),
                (0, express_validator_1.body)('course_images').optional().isArray().withMessage('Course images must be an array').run(req),
                (0, express_validator_1.body)('description').optional().isString().withMessage('Description must be a string').run(req),
                (0, express_validator_1.body)('has_reservation').optional().isBoolean().toBoolean().withMessage('has_reservation يجب أن يكون قيمة منطقية').run(req),
                (0, express_validator_1.body)('reservation_amount').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat().withMessage('مبلغ العربون يجب أن يكون رقمًا أكبر من صفر').run(req)
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
            const result = await course_service_1.CourseService.create(teacherId, req.body);
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in create course controller:', error);
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
                (0, express_validator_1.query)('study_year').optional().isString().withMessage('Study year must be a string').run(req),
                (0, express_validator_1.query)('deleted').optional().custom((value) => {
                    if (value === undefined || value === null || value === 'null') {
                        return true;
                    }
                    if (value === 'true' || value === 'false') {
                        return true;
                    }
                    throw new Error('deleted must be true, false, or null');
                }).withMessage('deleted must be true, false, or null').run(req),
                (0, express_validator_1.query)('grade_id').optional().custom((value) => {
                    if (value && value !== 'null' && value !== 'undefined' && value !== '') {
                        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                        if (!uuidRegex.test(value)) {
                            throw new Error('Grade ID must be a valid UUID');
                        }
                    }
                    return true;
                }).run(req),
                (0, express_validator_1.query)('subject_id').optional().custom((value) => {
                    if (value && value !== 'null' && value !== 'undefined' && value !== '') {
                        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                        if (!uuidRegex.test(value)) {
                            throw new Error('Subject ID must be a valid UUID');
                        }
                    }
                    return true;
                }).run(req)
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
            let search = req.query['search'];
            if (search === 'null' || search === 'undefined' || search === '' || search === undefined) {
                search = undefined;
            }
            let studyYear = req.query['study_year'];
            if (studyYear === 'null' || studyYear === 'undefined' || studyYear === '' || studyYear === undefined) {
                studyYear = undefined;
            }
            let gradeId = req.query['grade_id'];
            if (gradeId === 'null' || gradeId === 'undefined' || gradeId === '' || gradeId === undefined) {
                gradeId = undefined;
            }
            let subjectId = req.query['subject_id'];
            if (subjectId === 'null' || subjectId === 'undefined' || subjectId === '' || subjectId === undefined) {
                subjectId = undefined;
            }
            let deleted = undefined;
            const deletedParam = req.query['deleted'];
            if (deletedParam === 'true') {
                deleted = true;
            }
            else if (deletedParam === 'false') {
                deleted = false;
            }
            const result = await course_service_1.CourseService.getAllByTeacher(teacherId, page, limit, search, studyYear, gradeId, subjectId, deleted);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get all courses controller:', error);
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
            const result = await course_service_1.CourseService.getById(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in get course by ID controller:', error);
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
                (0, express_validator_1.body)('study_year').optional().isString().withMessage('Study year must be a string').run(req),
                (0, express_validator_1.body)('grade_id').optional().isUUID().withMessage('Grade ID must be a valid UUID').run(req),
                (0, express_validator_1.body)('subject_id').optional().isUUID().withMessage('Subject ID must be a valid UUID').run(req),
                (0, express_validator_1.body)('course_name').optional().notEmpty().withMessage('اسم الدورة مطلوب').run(req),
                (0, express_validator_1.body)('start_date').optional().isISO8601().withMessage('Start date must be a valid date').run(req),
                (0, express_validator_1.body)('end_date').optional().isISO8601().withMessage('End date must be a valid date').run(req),
                (0, express_validator_1.body)('price').optional().isFloat({ min: 0 }).withMessage('السعر غير صحيح').run(req),
                (0, express_validator_1.body)('seats_count').optional().isInt({ min: 1 }).withMessage('عدد المقاعد غير صحيح').run(req),
                (0, express_validator_1.body)('course_images').optional().isArray().withMessage('Course images must be an array').run(req),
                (0, express_validator_1.body)('description').optional().isString().withMessage('Description must be a string').run(req),
                (0, express_validator_1.body)('has_reservation').optional().isBoolean().toBoolean().withMessage('has_reservation يجب أن يكون قيمة منطقية').run(req),
                (0, express_validator_1.body)('reservation_amount').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat().withMessage('مبلغ العربون يجب أن يكون رقمًا أكبر من صفر').run(req)
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
            const result = await course_service_1.CourseService.update(id, teacherId, req.body);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in update course controller:', error);
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
            const result = await course_service_1.CourseService.delete(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in delete course controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getDeletedNotExpired(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').run(req),
                (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').run(req)
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
            const result = await course_service_1.CourseService.getDeletedNotExpired(teacherId, page, limit);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('Error in get deleted not expired courses controller:', error);
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
            const result = await course_service_1.CourseService.restore(id, teacherId);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in restore course controller:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.CourseController = CourseController;
//# sourceMappingURL=course.controller.js.map
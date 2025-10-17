"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionPackageController = void 0;
const express_validator_1 = require("express-validator");
const subscription_package_service_1 = require("../../services/super_admin/subscription-package.service");
const teacher_subscription_service_1 = require("../../services/teacher-subscription.service");
class SubscriptionPackageController {
    static async createPackage(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('name').notEmpty().withMessage('الاسم مطلوب').run(req),
                (0, express_validator_1.body)('description').optional().isLength({ max: 1000 }).withMessage('الوصف طويل جداً').run(req),
                (0, express_validator_1.body)('maxStudents').isInt({ min: 1 }).withMessage('عدد الطلاب مطلوب').run(req),
                (0, express_validator_1.body)('price').isFloat({ min: 0 }).withMessage('السعر مطلوب').run(req),
                (0, express_validator_1.body)('durationDays').isInt({ min: 1 }).withMessage('مدة الباقة مطلوبة').run(req),
                (0, express_validator_1.body)('isFree').optional().isBoolean().withMessage('قيمة غير صحيحة').run(req)
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
            const { name, description, maxStudents, price, durationDays, isFree } = req.body;
            const result = await subscription_package_service_1.SubscriptionPackageService.createPackage({
                name,
                description,
                maxStudents: Number(maxStudents),
                price: Number(price),
                durationDays: Number(durationDays),
                isFree: isFree || false
            });
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in createPackage controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getPackageById(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('معرف غير صحيح').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { id } = req.params;
            const result = await subscription_package_service_1.SubscriptionPackageService.getPackageById(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in getPackageById controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getAllPackages(req, res) {
        try {
            const { page = 1, limit = 10, search = null, isActive = null, isFree = null, sortBy = null, deleted = false } = req.query;
            const pageNum = Number(page);
            const limitNum = Number(limit);
            if (isNaN(pageNum) || pageNum < 1) {
                res.status(400).json({
                    success: false,
                    message: 'رقم الصفحة غير صحيح',
                    errors: ['رقم الصفحة غير صحيح']
                });
                return;
            }
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                res.status(400).json({
                    success: false,
                    message: 'الحد غير صحيح',
                    errors: ['الحد غير صحيح']
                });
                return;
            }
            if (search && typeof search === 'string' && search.length > 100) {
                res.status(400).json({
                    success: false,
                    message: 'البحث طويل جداً',
                    errors: ['البحث طويل جداً']
                });
                return;
            }
            let isActiveBool = null;
            let isFreeBool = null;
            if (isActive !== null && isActive !== 'null') {
                if (isActive === 'true')
                    isActiveBool = true;
                else if (isActive === 'false')
                    isActiveBool = false;
                else {
                    res.status(400).json({
                        success: false,
                        message: 'قيمة غير صحيحة',
                        errors: ['قيمة غير صحيحة']
                    });
                    return;
                }
            }
            if (isFree !== null && isFree !== 'null') {
                if (isFree === 'true')
                    isFreeBool = true;
                else if (isFree === 'false')
                    isFreeBool = false;
                else {
                    res.status(400).json({
                        success: false,
                        message: 'قيمة غير صحيحة',
                        errors: ['قيمة غير صحيحة']
                    });
                    return;
                }
            }
            const params = {
                page: pageNum,
                limit: limitNum,
                deleted: deleted === 'true'
            };
            if (search && search !== 'null')
                params.search = search;
            if (isActiveBool !== null)
                params.isActive = isActiveBool;
            if (isFreeBool !== null)
                params.isFree = isFreeBool;
            if (sortBy && sortBy !== 'null') {
                try {
                    params.sortBy = JSON.parse(sortBy);
                }
                catch {
                }
            }
            const result = await subscription_package_service_1.SubscriptionPackageService.getAllPackages(params);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in getAllPackages controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async updatePackage(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.param)('id').isUUID().withMessage('معرف غير صحيح').run(req),
                (0, express_validator_1.body)('name').optional().notEmpty().withMessage('الاسم مطلوب').run(req),
                (0, express_validator_1.body)('description').optional().isLength({ max: 1000 }).withMessage('الوصف طويل جداً').run(req),
                (0, express_validator_1.body)('maxStudents').optional().isInt({ min: 1 }).withMessage('عدد الطلاب مطلوب').run(req),
                (0, express_validator_1.body)('price').optional().isFloat({ min: 0 }).withMessage('السعر مطلوب').run(req),
                (0, express_validator_1.body)('durationDays').optional().isInt({ min: 1 }).withMessage('مدة الباقة مطلوبة').run(req),
                (0, express_validator_1.body)('isFree').optional().isBoolean().withMessage('قيمة غير صحيحة').run(req),
                (0, express_validator_1.body)('isActive').optional().isBoolean().withMessage('قيمة غير صحيحة').run(req)
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
            const { id } = req.params;
            const updateData = req.body;
            if (updateData.maxStudents)
                updateData.maxStudents = Number(updateData.maxStudents);
            if (updateData.price)
                updateData.price = Number(updateData.price);
            if (updateData.durationDays)
                updateData.durationDays = Number(updateData.durationDays);
            const result = await subscription_package_service_1.SubscriptionPackageService.updatePackage(id, updateData);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in updatePackage controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async activatePackage(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('معرف غير صحيح').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { id } = req.params;
            const result = await subscription_package_service_1.SubscriptionPackageService.activatePackage(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in activatePackage controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async deactivatePackage(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('معرف غير صحيح').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { id } = req.params;
            const result = await subscription_package_service_1.SubscriptionPackageService.deactivatePackage(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in deactivatePackage controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async deletePackage(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('معرف غير صحيح').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { id } = req.params;
            const result = await subscription_package_service_1.SubscriptionPackageService.deletePackage(id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in deletePackage controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async getActivePackages(_req, res) {
        try {
            const user = res.locals?.user;
            const teacherId = user?.userId || null;
            const data = await subscription_package_service_1.SubscriptionPackageService.getActivePackages(teacherId || undefined);
            res.status(200).json({
                success: true,
                message: teacherId
                    ? 'تم جلب الباقات مع تحديد اشتراكك الحالي ✅'
                    : 'تم جلب الباقات العامة (لم يتم تحديد اشتراك)',
                data,
            });
        }
        catch (error) {
            console.error('Error in getActivePackages controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async getFreePackage(_req, res) {
        try {
            const result = await subscription_package_service_1.SubscriptionPackageService.getFreePackage();
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(404).json(result);
            }
        }
        catch (error) {
            console.error('Error in getFreePackage controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async activateForTeacher(req, res) {
        try {
            await (0, express_validator_1.param)('id').isUUID().withMessage('معرف غير صحيح').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(e => e.msg)
                });
                return;
            }
            const teacher = req.user;
            if (!teacher?.id) {
                res.status(401).json({
                    success: false,
                    message: 'المصادقة مطلوبة',
                    errors: ['المستخدم غير مصادق عليه']
                });
                return;
            }
            const { id } = req.params;
            const result = await teacher_subscription_service_1.TeacherSubscriptionService.activateForTeacher(teacher.id, id);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in activateForTeacher controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.SubscriptionPackageController = SubscriptionPackageController;
//# sourceMappingURL=subscription-package.controller.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherSubscriptionService = void 0;
const subscription_package_model_1 = require("../models/subscription-package.model");
const teacher_subscription_model_1 = require("../models/teacher-subscription.model");
class TeacherSubscriptionService {
    static async create(data) {
        try {
            const subscription = await teacher_subscription_model_1.TeacherSubscriptionModel.create(data);
            return {
                success: true,
                message: 'تم إنشاء الاشتراك بنجاح',
                data: subscription
            };
        }
        catch (error) {
            console.error('Error creating teacher subscription:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async findById(id) {
        try {
            const subscription = await teacher_subscription_model_1.TeacherSubscriptionModel.findById(id);
            if (!subscription) {
                return {
                    success: false,
                    message: 'الاشتراك غير موجود',
                    errors: ['الاشتراك غير موجود']
                };
            }
            return {
                success: true,
                message: 'تم العثور على الاشتراك',
                data: subscription
            };
        }
        catch (error) {
            console.error('Error finding subscription by ID:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async findByTeacherId(teacherId) {
        try {
            const subscriptions = await teacher_subscription_model_1.TeacherSubscriptionModel.findByTeacherId(teacherId);
            return {
                success: true,
                message: 'تم العثور على الاشتراك',
                data: subscriptions,
                count: subscriptions.length
            };
        }
        catch (error) {
            console.error('Error finding teacher subscriptions:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async findActiveByTeacherId(teacherId) {
        try {
            const active = await teacher_subscription_model_1.TeacherSubscriptionModel.findActiveByTeacherId(teacherId);
            if (!active) {
                return {
                    success: false,
                    message: 'لا يوجد اشتراك نشط',
                    errors: ['لا يوجد اشتراك نشط']
                };
            }
            return {
                success: true,
                message: 'تم العثور على الاشتراك النشط',
                data: active
            };
        }
        catch (error) {
            console.error('Error getting active subscription:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async update(id, data) {
        try {
            const updated = await teacher_subscription_model_1.TeacherSubscriptionModel.update(id, data);
            if (!updated) {
                return {
                    success: false,
                    message: 'الاشتراك غير موجود أو لم يتم تحديثه',
                    errors: ['الاشتراك غير موجود أو لم يتم تحديثه']
                };
            }
            return {
                success: true,
                message: 'تم تحديث الاشتراك بنجاح',
                data: updated
            };
        }
        catch (error) {
            console.error('Error updating subscription:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async delete(id) {
        try {
            const deleted = await teacher_subscription_model_1.TeacherSubscriptionModel.delete(id);
            if (!deleted) {
                return {
                    success: false,
                    message: 'الاشتراك غير موجود أو لم يتم حذفه',
                    errors: ['الاشتراك غير موجود أو لم يتم حذفه']
                };
            }
            return {
                success: true,
                message: 'تم حذف الاشتراك بنجاح'
            };
        }
        catch (error) {
            console.error('Error deleting subscription:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async activateForTeacher(teacherId, packageId) {
        try {
            const pkg = await subscription_package_model_1.SubscriptionPackageModel.findById(packageId);
            if (!pkg || !pkg.isActive) {
                return {
                    success: false,
                    message: 'الباقة غير موجودة أو غير مفعلة',
                    errors: ['الباقة غير موجودة أو غير مفعلة']
                };
            }
            const current = await teacher_subscription_model_1.TeacherSubscriptionModel.findActiveByTeacherId(teacherId);
            if (current) {
                await teacher_subscription_model_1.TeacherSubscriptionModel.update(current.id, { isActive: false });
            }
            const startDate = new Date();
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + Number(pkg.durationDays || 30));
            const created = await teacher_subscription_model_1.TeacherSubscriptionModel.create({
                teacherId,
                subscriptionPackageId: pkg.id,
                startDate,
                endDate
            });
            return {
                success: true,
                message: 'تم تفعيل الباقة للمعلم بنجاح',
                data: created
            };
        }
        catch (error) {
            console.error('Error activating subscription for teacher:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
}
exports.TeacherSubscriptionService = TeacherSubscriptionService;
//# sourceMappingURL=teacher-subscription.service.js.map
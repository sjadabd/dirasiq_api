"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionPackageService = void 0;
const subscription_package_model_1 = require("../../models/subscription-package.model");
class SubscriptionPackageService {
    static async createPackage(data) {
        try {
            const existingPackage = await subscription_package_model_1.SubscriptionPackageModel.findByName(data.name);
            if (existingPackage) {
                return {
                    success: false,
                    message: 'اسم الباقة موجود بالفعل',
                    errors: ['اسم الباقة موجود بالفعل']
                };
            }
            const existingPackageWithSameSpecs = await subscription_package_model_1.SubscriptionPackageModel.findBySpecifications({
                maxStudents: data.maxStudents,
                price: data.price,
                durationDays: data.durationDays,
                isFree: data.isFree || false
            });
            if (existingPackageWithSameSpecs) {
                return {
                    success: false,
                    message: 'يوجد باقة بنفس المواصفات',
                    errors: ['يوجد باقة بنفس المواصفات']
                };
            }
            if (data.maxStudents <= 0) {
                return {
                    success: false,
                    message: 'عدد الطلاب يجب أن يكون أكبر من صفر',
                    errors: ['عدد الطلاب يجب أن يكون أكبر من صفر']
                };
            }
            if (data.price < 0) {
                return {
                    success: false,
                    message: 'السعر يجب أن يكون أكبر من أو يساوي صفر',
                    errors: ['السعر يجب أن يكون أكبر من أو يساوي صفر']
                };
            }
            if (data.durationDays <= 0) {
                return {
                    success: false,
                    message: 'مدة الباقة يجب أن تكون أكبر من صفر',
                    errors: ['مدة الباقة يجب أن تكون أكبر من صفر']
                };
            }
            if (data.isFree && data.price !== 0) {
                return {
                    success: false,
                    message: 'الباقة المجانية يجب أن يكون سعرها صفر',
                    errors: ['الباقة المجانية يجب أن يكون سعرها صفر']
                };
            }
            const package_ = await subscription_package_model_1.SubscriptionPackageModel.create(data);
            return {
                success: true,
                message: 'تم إنشاء الباقة بنجاح',
                data: package_
            };
        }
        catch (error) {
            console.error('Error creating subscription package:', error);
            return {
                success: false,
                message: 'فشل في إنشاء الباقة',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async getPackageById(id) {
        try {
            const package_ = await subscription_package_model_1.SubscriptionPackageModel.findById(id);
            if (!package_) {
                return {
                    success: false,
                    message: 'الباقة غير موجودة',
                    errors: ['الباقة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم العثور على الباقة',
                data: package_
            };
        }
        catch (error) {
            console.error('Error getting subscription package:', error);
            return {
                success: false,
                message: 'فشل في جلب الباقة',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async getAllPackages(params) {
        try {
            const result = await subscription_package_model_1.SubscriptionPackageModel.findAll(params);
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: result.packages,
                count: result.total
            };
        }
        catch (error) {
            console.error('Error getting subscription packages:', error);
            return {
                success: false,
                message: 'فشل في جلب الباقات',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async updatePackage(id, data) {
        try {
            const existingPackage = await subscription_package_model_1.SubscriptionPackageModel.findById(id);
            if (!existingPackage) {
                return {
                    success: false,
                    message: 'الباقة غير موجودة',
                    errors: ['الباقة غير موجودة']
                };
            }
            if (data.name && data.name !== existingPackage.name) {
                const packageWithSameName = await subscription_package_model_1.SubscriptionPackageModel.findByName(data.name);
                if (packageWithSameName) {
                    return {
                        success: false,
                        message: 'اسم الباقة موجود بالفعل',
                        errors: ['اسم الباقة موجود بالفعل']
                    };
                }
            }
            if (data.maxStudents !== undefined && data.maxStudents <= 0) {
                return {
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: ['عدد الطلاب يجب أن يكون أكبر من صفر']
                };
            }
            if (data.price !== undefined && data.price < 0) {
                return {
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: ['السعر يجب أن يكون أكبر من أو يساوي صفر']
                };
            }
            if (data.durationDays !== undefined && data.durationDays <= 0) {
                return {
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: ['مدة الباقة يجب أن تكون أكبر من صفر']
                };
            }
            if (data.isFree === true && data.price !== undefined && data.price !== 0) {
                return {
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: ['الباقة المجانية يجب أن يكون سعرها صفر']
                };
            }
            const updatedPackage = await subscription_package_model_1.SubscriptionPackageModel.update(id, data);
            if (!updatedPackage) {
                return {
                    success: false,
                    message: 'فشل في العملية',
                    errors: ['حدث خطأ في الخادم']
                };
            }
            return {
                success: true,
                message: 'تم تحديث الباقة بنجاح',
                data: updatedPackage
            };
        }
        catch (error) {
            console.error('Error updating subscription package:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async activatePackage(id) {
        try {
            const success = await subscription_package_model_1.SubscriptionPackageModel.activate(id);
            if (!success) {
                return {
                    success: false,
                    message: 'الباقة غير موجودة',
                    errors: ['الباقة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم تفعيل الباقة بنجاح'
            };
        }
        catch (error) {
            console.error('Error activating subscription package:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async deactivatePackage(id) {
        try {
            const success = await subscription_package_model_1.SubscriptionPackageModel.deactivate(id);
            if (!success) {
                return {
                    success: false,
                    message: 'الباقة غير موجودة',
                    errors: ['الباقة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم إلغاء تفعيل الباقة بنجاح'
            };
        }
        catch (error) {
            console.error('Error deactivating subscription package:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async deletePackage(id) {
        try {
            const success = await subscription_package_model_1.SubscriptionPackageModel.delete(id);
            if (!success) {
                return {
                    success: false,
                    message: 'الباقة غير موجودة',
                    errors: ['الباقة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم حذف الباقة بنجاح'
            };
        }
        catch (error) {
            console.error('Error deleting subscription package:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async getActivePackages(teacher_id) {
        try {
            const packages = await subscription_package_model_1.SubscriptionPackageModel.getActivePackages(teacher_id);
            return {
                success: true,
                message: 'تم العثور على الباقات النشطة',
                data: packages
            };
        }
        catch (error) {
            console.error('Error getting active subscription packages:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async getFreePackage() {
        try {
            const package_ = await subscription_package_model_1.SubscriptionPackageModel.getFreePackage();
            if (!package_) {
                return {
                    success: false,
                    message: 'لا توجد باقة مجانية',
                    errors: ['لا توجد باقة مجانية']
                };
            }
            return {
                success: true,
                message: 'تم العثور على الباقة المجانية',
                data: package_
            };
        }
        catch (error) {
            console.error('Error getting free subscription package:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
}
exports.SubscriptionPackageService = SubscriptionPackageService;
//# sourceMappingURL=subscription-package.service.js.map
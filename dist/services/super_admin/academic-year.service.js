"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AcademicYearService = void 0;
const academic_year_model_1 = require("../../models/academic-year.model");
class AcademicYearService {
    static async create(data) {
        try {
            const yearPattern = /^\d{4}-\d{4}$/;
            if (!yearPattern.test(data.year)) {
                return {
                    success: false,
                    message: 'تنسيق السنة الأكاديمية غير صحيح',
                    errors: ['يجب أن تكون السنة بصيغة YYYY-YYYY']
                };
            }
            const existingYear = await academic_year_model_1.AcademicYearModel.yearExists(data.year);
            if (existingYear) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية موجودة بالفعل',
                    errors: ['السنة الأكاديمية موجودة بالفعل']
                };
            }
            const academicYear = await academic_year_model_1.AcademicYearModel.create(data);
            return {
                success: true,
                message: 'تم إنشاء السنة الأكاديمية',
                data: { academicYear }
            };
        }
        catch (error) {
            console.error('Error creating academic year:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAll(page = 1, limit = 10, search, isActive) {
        try {
            const result = await academic_year_model_1.AcademicYearModel.findAll(page, limit, search, isActive);
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: result.academicYears,
                count: result.total
            };
        }
        catch (error) {
            console.error('Error getting academic years:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getById(id) {
        try {
            const academicYear = await academic_year_model_1.AcademicYearModel.findById(id);
            if (!academicYear) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: { academicYear }
            };
        }
        catch (error) {
            console.error('Error getting academic year:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getActive() {
        try {
            const academicYear = await academic_year_model_1.AcademicYearModel.getActive();
            if (!academicYear) {
                return {
                    success: false,
                    message: 'لا توجد سنة أكاديمية نشطة',
                    errors: ['لا توجد سنة أكاديمية نشطة']
                };
            }
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: { academicYear }
            };
        }
        catch (error) {
            console.error('Error getting active academic year:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async update(id, data) {
        try {
            const exists = await academic_year_model_1.AcademicYearModel.exists(id);
            if (!exists) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            if (data.year) {
                const yearPattern = /^\d{4}-\d{4}$/;
                if (!yearPattern.test(data.year)) {
                    return {
                        success: false,
                        message: 'تنسيق السنة الأكاديمية غير صحيح',
                        errors: ['يجب أن تكون السنة بصيغة YYYY-YYYY']
                    };
                }
                const existingYear = await academic_year_model_1.AcademicYearModel.yearExists(data.year, id);
                if (existingYear) {
                    return {
                        success: false,
                        message: 'السنة الأكاديمية موجودة بالفعل',
                        errors: ['السنة الأكاديمية موجودة بالفعل']
                    };
                }
            }
            const academicYear = await academic_year_model_1.AcademicYearModel.update(id, data);
            if (!academicYear) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم تحديث السنة الأكاديمية',
                data: { academicYear }
            };
        }
        catch (error) {
            console.error('Error updating academic year:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async delete(id) {
        try {
            const academicYear = await academic_year_model_1.AcademicYearModel.findById(id);
            if (!academicYear) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            if (academicYear.is_active) {
                return {
                    success: false,
                    message: 'لا يمكن حذف السنة الأكاديمية النشطة',
                    errors: ['لا يمكن حذف السنة الأكاديمية النشطة']
                };
            }
            const deleted = await academic_year_model_1.AcademicYearModel.delete(id);
            if (!deleted) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم حذف السنة الأكاديمية'
            };
        }
        catch (error) {
            console.error('Error deleting academic year:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async activate(id) {
        try {
            const exists = await academic_year_model_1.AcademicYearModel.exists(id);
            if (!exists) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            const academicYear = await academic_year_model_1.AcademicYearModel.activate(id);
            if (!academicYear) {
                return {
                    success: false,
                    message: 'السنة الأكاديمية غير موجودة',
                    errors: ['السنة الأكاديمية غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم تفعيل السنة الأكاديمية',
                data: { academicYear }
            };
        }
        catch (error) {
            console.error('Error activating academic year:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
}
exports.AcademicYearService = AcademicYearService;
//# sourceMappingURL=academic-year.service.js.map
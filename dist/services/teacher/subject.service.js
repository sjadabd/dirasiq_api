"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectService = void 0;
const subject_model_1 = require("../../models/subject.model");
const user_model_1 = require("../../models/user.model");
class SubjectService {
    static async create(teacherId, data) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return {
                    success: false,
                    message: 'المعلم غير موجود',
                    errors: ['المعلم غير موجود']
                };
            }
            const existingSubject = await subject_model_1.SubjectModel.nameExistsForTeacher(teacherId, data.name);
            if (existingSubject) {
                return {
                    success: false,
                    message: 'المادة موجودة بالفعل',
                    errors: ['المادة موجودة بالفعل']
                };
            }
            const subject = await subject_model_1.SubjectModel.create(teacherId, data);
            return {
                success: true,
                message: 'تم إنشاء المادة',
                data: { subject }
            };
        }
        catch (error) {
            console.error('Error creating subject:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAllByTeacher(teacherId, page = 1, limit = 10, search, includeDeleted = false) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return {
                    success: false,
                    message: 'المعلم غير موجود',
                    errors: ['المعلم غير موجود']
                };
            }
            const result = await subject_model_1.SubjectModel.findAllByTeacher(teacherId, page, limit, search, includeDeleted);
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: result.subjects,
                count: result.total
            };
        }
        catch (error) {
            console.error('Error getting subjects:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getById(id, teacherId) {
        try {
            const subject = await subject_model_1.SubjectModel.findByIdAndTeacher(id, teacherId);
            if (!subject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: { subject }
            };
        }
        catch (error) {
            console.error('Error getting subject:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async update(id, teacherId, data) {
        try {
            const existingSubject = await subject_model_1.SubjectModel.findByIdAndTeacher(id, teacherId);
            if (!existingSubject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            if (data.name && data.name !== existingSubject.name) {
                const nameExists = await subject_model_1.SubjectModel.nameExistsForTeacher(teacherId, data.name, id);
                if (nameExists) {
                    return {
                        success: false,
                        message: 'المادة موجودة بالفعل',
                        errors: ['المادة موجودة بالفعل']
                    };
                }
            }
            const subject = await subject_model_1.SubjectModel.update(id, teacherId, data);
            if (!subject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم تحديث المادة',
                data: { subject }
            };
        }
        catch (error) {
            console.error('Error updating subject:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async delete(id, teacherId) {
        try {
            const existingSubject = await subject_model_1.SubjectModel.findByIdAndTeacher(id, teacherId);
            if (!existingSubject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            const deleted = await subject_model_1.SubjectModel.delete(id, teacherId);
            if (!deleted) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم حذف المادة'
            };
        }
        catch (error) {
            console.error('Error deleting subject:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async restore(id, teacherId) {
        try {
            const existingSubject = await subject_model_1.SubjectModel.findByIdAndTeacher(id, teacherId, true);
            if (!existingSubject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            if (!existingSubject.deleted_at) {
                return {
                    success: false,
                    message: 'المادة غير محذوفة',
                    errors: ['المادة غير محذوفة']
                };
            }
            const restored = await subject_model_1.SubjectModel.restore(id, teacherId);
            if (!restored) {
                return {
                    success: false,
                    message: 'فشل في استعادة المادة',
                    errors: ['فشل في استعادة المادة']
                };
            }
            return {
                success: true,
                message: 'تم استعادة المادة'
            };
        }
        catch (error) {
            console.error('Error restoring subject:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async hardDelete(id, teacherId) {
        try {
            const existingSubject = await subject_model_1.SubjectModel.findByIdAndTeacher(id, teacherId, true);
            if (!existingSubject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            const deleted = await subject_model_1.SubjectModel.hardDelete(id, teacherId);
            if (!deleted) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم حذف المادة نهائياً'
            };
        }
        catch (error) {
            console.error('Error hard deleting subject:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAllSubjects(teacherId) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return {
                    success: false,
                    message: 'المعلم غير موجود',
                    errors: ['المعلم غير موجود']
                };
            }
            const result = await subject_model_1.SubjectModel.findAllByTeacher(teacherId, 1, 1000, undefined, false);
            const simpleSubjects = result.subjects.map(subject => ({
                id: subject.id,
                name: subject.name
            }));
            return {
                success: true,
                message: 'تم جلب المواد بنجاح',
                data: simpleSubjects,
                count: simpleSubjects.length
            };
        }
        catch (error) {
            console.error('Error getting all subjects:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
}
exports.SubjectService = SubjectService;
//# sourceMappingURL=subject.service.js.map
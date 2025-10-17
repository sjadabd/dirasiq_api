"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GradeService = void 0;
const grade_model_1 = require("../../models/grade.model");
class GradeService {
    static async create(data) {
        try {
            const existingGrade = await grade_model_1.GradeModel.nameExists(data.name);
            if (existingGrade) {
                return {
                    success: false,
                    message: 'الصف موجود بالفعل',
                    errors: ['الصف موجود بالفعل']
                };
            }
            const grade = await grade_model_1.GradeModel.create(data);
            return {
                success: true,
                message: 'تم إنشاء الصف',
                data: { grade }
            };
        }
        catch (error) {
            console.error('Error creating grade:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAll(page = 1, limit = 10, search) {
        try {
            const result = await grade_model_1.GradeModel.findAll(page, limit, search);
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: result.grades,
                count: result.total
            };
        }
        catch (error) {
            console.error('Error getting grades:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getAllActive() {
        try {
            const grades = await grade_model_1.GradeModel.findActive();
            return { success: true, data: grades };
        }
        catch (err) {
            return { success: false, message: 'فشل في جلب الصفوف', errors: [err.message] };
        }
    }
    static async getActive() {
        try {
            const grades = await grade_model_1.GradeModel.findActive();
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: grades
            };
        }
        catch (error) {
            console.error('Error getting active grades:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getById(id) {
        try {
            const grade = await grade_model_1.GradeModel.findById(id);
            if (!grade) {
                return {
                    success: false,
                    message: 'الصف غير موجود',
                    errors: ['الصف غير موجود']
                };
            }
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: { grade }
            };
        }
        catch (error) {
            console.error('Error getting grade:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async update(id, data) {
        try {
            const existingGrade = await grade_model_1.GradeModel.findById(id);
            if (!existingGrade) {
                return {
                    success: false,
                    message: 'الصف غير موجود',
                    errors: ['الصف غير موجود']
                };
            }
            if (data.name && data.name !== existingGrade.name) {
                const nameExists = await grade_model_1.GradeModel.nameExists(data.name, id);
                if (nameExists) {
                    return {
                        success: false,
                        message: 'الصف موجود بالفعل',
                        errors: ['الصف موجود بالفعل']
                    };
                }
            }
            const updatedGrade = await grade_model_1.GradeModel.update(id, data);
            if (!updatedGrade) {
                return {
                    success: false,
                    message: 'الصف غير موجود',
                    errors: ['الصف غير موجود']
                };
            }
            return {
                success: true,
                message: 'تم تحديث الصف',
                data: { grade: updatedGrade }
            };
        }
        catch (error) {
            console.error('Error updating grade:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async delete(id) {
        try {
            const existingGrade = await grade_model_1.GradeModel.findById(id);
            if (!existingGrade) {
                return {
                    success: false,
                    message: 'الصف غير موجود',
                    errors: ['الصف غير موجود']
                };
            }
            const deleted = await grade_model_1.GradeModel.delete(id);
            if (!deleted) {
                return {
                    success: false,
                    message: 'فشلت العملية',
                    errors: ['خطأ داخلي في الخادم']
                };
            }
            return {
                success: true,
                message: 'تم حذف الصف'
            };
        }
        catch (error) {
            console.error('Error deleting grade:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getUserGrades(userId, userType, studyYear) {
        try {
            const { UserModel } = await Promise.resolve().then(() => __importStar(require('../../models/user.model')));
            const user = await UserModel.findById(userId);
            if (!user) {
                return {
                    success: false,
                    message: 'المستخدم غير موجود',
                    errors: ['المستخدم غير موجود']
                };
            }
            let activeStudyYear = studyYear;
            if (!activeStudyYear) {
                const { AcademicYearModel } = await Promise.resolve().then(() => __importStar(require('../../models/academic-year.model')));
                const activeAcademicYear = await AcademicYearModel.getActive();
                if (activeAcademicYear) {
                    activeStudyYear = activeAcademicYear.year;
                }
            }
            if (!activeStudyYear) {
                return {
                    success: false,
                    message: 'لا توجد سنة دراسية نشطة',
                    errors: ['لا توجد سنة دراسية نشطة']
                };
            }
            let userGrades = [];
            if (userType === 'teacher') {
                const { TeacherGradeModel } = await Promise.resolve().then(() => __importStar(require('../../models/teacher-grade.model')));
                const teacherGrades = await TeacherGradeModel.findByTeacherId(userId);
                const filteredGrades = teacherGrades.filter(tg => tg.studyYear === activeStudyYear);
                userGrades = await Promise.all(filteredGrades.map(async (tg) => {
                    const grade = await grade_model_1.GradeModel.findById(tg.gradeId);
                    return {
                        id: tg.id,
                        gradeId: tg.gradeId,
                        gradeName: grade?.name || 'غير محدد',
                        studyYear: tg.studyYear,
                        createdAt: tg.createdAt
                    };
                }));
            }
            else if (userType === 'student') {
                const { StudentGradeModel } = await Promise.resolve().then(() => __importStar(require('../../models/student-grade.model')));
                const studentGrades = await StudentGradeModel.findByStudentId(userId);
                const filteredGrades = studentGrades.filter(sg => sg.studyYear === activeStudyYear);
                userGrades = await Promise.all(filteredGrades.map(async (sg) => {
                    const grade = await grade_model_1.GradeModel.findById(sg.gradeId);
                    return {
                        id: sg.id,
                        gradeId: sg.gradeId,
                        gradeName: grade?.name || 'غير محدد',
                        studyYear: sg.studyYear,
                        createdAt: sg.createdAt
                    };
                }));
            }
            else {
                return {
                    success: false,
                    message: 'نوع المستخدم غير مدعوم',
                    errors: ['نوع المستخدم غير مدعوم']
                };
            }
            return {
                success: true,
                message: 'تم جلب المراحل بنجاح',
                data: {
                    userType,
                    studyYear: activeStudyYear,
                    grades: userGrades
                }
            };
        }
        catch (error) {
            console.error('Error getting user grades:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
}
exports.GradeService = GradeService;
//# sourceMappingURL=grade.service.js.map
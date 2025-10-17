"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseService = void 0;
const course_model_1 = require("../../models/course.model");
const grade_model_1 = require("../../models/grade.model");
const notification_model_1 = require("../../models/notification.model");
const subject_model_1 = require("../../models/subject.model");
const user_model_1 = require("../../models/user.model");
const notification_service_1 = require("../../services/notification.service");
const image_service_1 = require("../../utils/image.service");
const academic_year_service_1 = require("../super_admin/academic-year.service");
class CourseService {
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
            const yearPattern = /^\d{4}-\d{4}$/;
            if (!yearPattern.test(data.study_year)) {
                return {
                    success: false,
                    message: 'السنة الدراسية غير صحيحة',
                    errors: ['السنة الدراسية غير صحيحة']
                };
            }
            const grade = await grade_model_1.GradeModel.findById(data.grade_id);
            if (!grade) {
                return {
                    success: false,
                    message: 'الصف غير موجود',
                    errors: ['الصف غير موجود']
                };
            }
            const subject = await subject_model_1.SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
            if (!subject) {
                return {
                    success: false,
                    message: 'المادة غير موجودة',
                    errors: ['المادة لا تنتمي للمعلم']
                };
            }
            const startDate = new Date(data.start_date);
            const endDate = new Date(data.end_date);
            const currentDate = new Date();
            if (endDate <= startDate) {
                return {
                    success: false,
                    message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
                    errors: ['تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية']
                };
            }
            if (endDate <= currentDate) {
                return {
                    success: false,
                    message: 'تاريخ الانتهاء يجب أن يكون في المستقبل',
                    errors: ['تاريخ الانتهاء يجب أن يكون في المستقبل']
                };
            }
            if (data.price < 0) {
                return {
                    success: false,
                    message: 'السعر غير صحيح',
                    errors: ['السعر غير صحيح']
                };
            }
            const hasReservation = data.has_reservation === true;
            const reservationAmount = data.reservation_amount ?? null;
            if (hasReservation) {
                if (reservationAmount === null || reservationAmount === undefined) {
                    return {
                        success: false,
                        message: 'يجب تحديد مبلغ العربون عند تفعيل خاصية الحجز',
                        errors: ['مطلوب مبلغ العربون']
                    };
                }
                if (reservationAmount <= 0) {
                    return {
                        success: false,
                        message: 'مبلغ العربون يجب أن يكون أكبر من صفر',
                        errors: ['مبلغ العربون غير صحيح']
                    };
                }
                if (reservationAmount > data.price) {
                    return {
                        success: false,
                        message: 'مبلغ العربون لا يمكن أن يتجاوز سعر الكورس',
                        errors: ['مبلغ العربون أكبر من السعر']
                    };
                }
            }
            if (data.seats_count <= 0) {
                return {
                    success: false,
                    message: 'عدد المقاعد غير صحيح',
                    errors: ['عدد المقاعد غير صحيح']
                };
            }
            const existingCourse = await course_model_1.CourseModel.courseExistsForTeacher(teacherId, data.study_year, data.course_name, data.grade_id, data.subject_id);
            if (existingCourse) {
                return {
                    success: false,
                    message: 'الدورة موجودة بالفعل',
                    errors: ['الدورة موجودة بالفعل']
                };
            }
            let processedImages = [];
            if (data.course_images && data.course_images.length > 0) {
                try {
                    processedImages = await image_service_1.ImageService.processCourseImages(data.course_images);
                }
                catch (error) {
                    return {
                        success: false,
                        message: 'خطأ في معالجة الصورة',
                        errors: ['خطأ في معالجة الصورة']
                    };
                }
            }
            const courseData = {
                ...data,
                course_images: processedImages,
                has_reservation: hasReservation,
                reservation_amount: hasReservation ? reservationAmount : null
            };
            const course = await course_model_1.CourseModel.create(teacherId, courseData);
            try {
                const notificationService = new notification_service_1.NotificationService({
                    appId: process.env['ONESIGNAL_APP_ID'] || '',
                    restApiKey: process.env['ONESIGNAL_REST_API_KEY'] || ''
                });
                await notificationService.createAndSendNotification({
                    title: '📢 دورة جديدة متاحة',
                    message: `تمت إضافة دورة جديدة: ${course.course_name}`,
                    type: notification_model_1.NotificationType.NEW_COURSE_AVAILABLE,
                    priority: notification_model_1.NotificationPriority.HIGH,
                    recipientType: notification_model_1.RecipientType.STUDENTS,
                    data: {
                        courseId: course.id,
                        gradeId: course.grade_id,
                        studyYear: course.study_year,
                        course: {
                            id: course.id,
                            study_year: course.study_year,
                            grade_id: course.grade_id,
                            grade_name: grade.name,
                            subject_id: course.subject_id,
                            subject_name: subject.name,
                            course_name: course.course_name,
                            course_images: course.course_images,
                            description: course.description,
                            start_date: course.start_date,
                            end_date: course.end_date,
                            price: course.price,
                            seats_count: course.seats_count,
                            has_reservation: course.has_reservation,
                            reservation_amount: course.reservation_amount,
                            teacher: {
                                id: teacherId,
                                name: teacher.name
                            }
                        }
                    },
                    createdBy: teacherId
                });
            }
            catch (notifyErr) {
                console.error('فشل إرسال الإشعار:', notifyErr);
            }
            return {
                success: true,
                message: 'تم إنشاء الدورة',
                data: { course }
            };
        }
        catch (error) {
            console.error('Error creating course:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async listNamesForActiveYear(teacherId) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return { success: false, message: 'المعلم غير موجود', errors: ['المعلم غير موجود'] };
            }
            const active = await academic_year_service_1.AcademicYearService.getActive();
            const studyYear = active.success ? active.data?.academicYear?.year : undefined;
            if (!studyYear) {
                return { success: false, message: 'لا توجد سنة دراسية مفعلة', errors: ['لا توجد سنة دراسية مفعلة'] };
            }
            const rows = await course_model_1.CourseModel.findNamesByTeacherAndYear(teacherId, studyYear);
            return {
                success: true,
                message: 'تم جلب أسماء الدورات بنجاح',
                data: rows.map(r => ({ id: r.id, name: r.course_name }))
            };
        }
        catch (error) {
            console.error('Error listing course names:', error);
            return { success: false, message: 'فشلت العملية', errors: ['خطأ داخلي في الخادم'] };
        }
    }
    static async getAllByTeacher(teacherId, page = 1, limit = 10, search, studyYear, gradeId, subjectId, deleted) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return {
                    success: false,
                    message: 'المعلم غير موجود',
                    errors: ['المعلم غير موجود']
                };
            }
            const result = await course_model_1.CourseModel.findAllByTeacher(teacherId, page, limit, search, studyYear, gradeId, subjectId, deleted);
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: result.courses,
                count: result.total
            };
        }
        catch (error) {
            console.error('Error getting courses:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getById(id, teacherId) {
        try {
            const course = await course_model_1.CourseModel.findByIdWithRelations(id, teacherId);
            if (!course) {
                return {
                    success: false,
                    message: 'الدورة غير موجودة',
                    errors: ['الدورة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تمت العملية بنجاح',
                data: {
                    course: {
                        ...course,
                        grade: {
                            id: course.grade_id,
                            name: course.grade_name
                        },
                        subject: {
                            id: course.subject_id,
                            name: course.subject_name
                        }
                    }
                }
            };
        }
        catch (error) {
            console.error('Error getting course:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async update(id, teacherId, data) {
        try {
            const existingCourse = await course_model_1.CourseModel.findByIdAndTeacher(id, teacherId);
            if (!existingCourse) {
                return {
                    success: false,
                    message: 'الدورة غير موجودة',
                    errors: ['الدورة غير موجودة']
                };
            }
            if (data.study_year) {
                const yearPattern = /^\d{4}-\d{4}$/;
                if (!yearPattern.test(data.study_year)) {
                    return {
                        success: false,
                        message: 'السنة الدراسية غير صحيحة',
                        errors: ['السنة الدراسية غير صحيحة']
                    };
                }
            }
            if (data.grade_id) {
                const grade = await grade_model_1.GradeModel.findById(data.grade_id);
                if (!grade) {
                    return {
                        success: false,
                        message: 'الصف غير موجود',
                        errors: ['الصف غير موجود']
                    };
                }
            }
            if (data.subject_id) {
                const subject = await subject_model_1.SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
                if (!subject) {
                    return {
                        success: false,
                        message: 'المادة غير موجودة',
                        errors: ['المادة لا تنتمي للمعلم']
                    };
                }
            }
            if (data.start_date && data.end_date) {
                const startDate = new Date(data.start_date);
                const endDate = new Date(data.end_date);
                const currentDate = new Date();
                if (endDate <= startDate) {
                    return {
                        success: false,
                        message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
                        errors: ['تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية']
                    };
                }
                if (endDate <= currentDate) {
                    return {
                        success: false,
                        message: 'تاريخ الانتهاء يجب أن يكون في المستقبل',
                        errors: ['تاريخ الانتهاء يجب أن يكون في المستقبل']
                    };
                }
            }
            else if (data.end_date) {
                const endDate = new Date(data.end_date);
                const currentDate = new Date();
                const existingStartDate = new Date(existingCourse.start_date);
                if (endDate <= existingStartDate) {
                    return {
                        success: false,
                        message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
                        errors: ['تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية']
                    };
                }
                if (endDate <= currentDate) {
                    return {
                        success: false,
                        message: 'تاريخ الانتهاء يجب أن يكون في المستقبل',
                        errors: ['تاريخ الانتهاء يجب أن يكون في المستقبل']
                    };
                }
            }
            else if (data.start_date) {
                const startDate = new Date(data.start_date);
                const existingEndDate = new Date(existingCourse.end_date);
                if (existingEndDate <= startDate) {
                    return {
                        success: false,
                        message: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
                        errors: ['تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية']
                    };
                }
            }
            if (data.price !== undefined && data.price < 0) {
                return {
                    success: false,
                    message: 'السعر غير صحيح',
                    errors: ['السعر غير صحيح']
                };
            }
            const effectivePrice = data.price !== undefined ? data.price : existingCourse.price;
            if (data.has_reservation !== undefined) {
                if (data.has_reservation === true) {
                    const resAmount = data.reservation_amount !== undefined ? data.reservation_amount : existingCourse.reservation_amount;
                    if (resAmount === null || resAmount === undefined) {
                        return {
                            success: false,
                            message: 'يجب تحديد مبلغ العربون عند تفعيل خاصية الحجز',
                            errors: ['مطلوب مبلغ العربون']
                        };
                    }
                    if (resAmount <= 0) {
                        return {
                            success: false,
                            message: 'مبلغ العربون يجب أن يكون أكبر من صفر',
                            errors: ['مبلغ العربون غير صحيح']
                        };
                    }
                    if (resAmount > effectivePrice) {
                        return {
                            success: false,
                            message: 'مبلغ العربون لا يمكن أن يتجاوز سعر الكورس',
                            errors: ['مبلغ العربون أكبر من السعر']
                        };
                    }
                }
            }
            if (data.reservation_amount !== undefined) {
                if (data.reservation_amount !== null) {
                    if (data.reservation_amount <= 0) {
                        return {
                            success: false,
                            message: 'مبلغ العربون يجب أن يكون أكبر من صفر',
                            errors: ['مبلغ العربون غير صحيح']
                        };
                    }
                    if (data.reservation_amount > effectivePrice) {
                        return {
                            success: false,
                            message: 'مبلغ العربون لا يمكن أن يتجاوز سعر الكورس',
                            errors: ['مبلغ العربون أكبر من السعر']
                        };
                    }
                }
            }
            if (data.seats_count !== undefined && data.seats_count <= 0) {
                return {
                    success: false,
                    message: 'عدد المقاعد غير صحيح',
                    errors: ['عدد المقاعد غير صحيح']
                };
            }
            if (data.course_name && data.course_name !== existingCourse.course_name) {
                const studyYear = data.study_year || existingCourse.study_year;
                const gradeId = data.grade_id || existingCourse.grade_id;
                const subjectId = data.subject_id || existingCourse.subject_id;
                const nameExists = await course_model_1.CourseModel.courseExistsForTeacher(teacherId, studyYear, data.course_name, gradeId, subjectId, id);
                if (nameExists) {
                    return {
                        success: false,
                        message: 'الدورة موجودة بالفعل',
                        errors: ['الدورة موجودة بالفعل']
                    };
                }
            }
            let processedImages = existingCourse.course_images;
            if (data.course_images) {
                try {
                    processedImages = await image_service_1.ImageService.updateCourseImages(data.course_images, existingCourse.course_images);
                }
                catch (error) {
                    return {
                        success: false,
                        message: 'خطأ في معالجة الصورة',
                        errors: ['خطأ في معالجة الصورة']
                    };
                }
            }
            const updateData = {
                ...data,
                course_images: processedImages,
                ...(data.has_reservation === false ? { reservation_amount: null } : {})
            };
            const course = await course_model_1.CourseModel.update(id, teacherId, updateData);
            if (!course) {
                return {
                    success: false,
                    message: 'الدورة غير موجودة',
                    errors: ['الدورة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم تحديث الدورة',
                data: { course }
            };
        }
        catch (error) {
            console.error('Error updating course:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async delete(id, teacherId) {
        try {
            const existingCourse = await course_model_1.CourseModel.findByIdAndTeacher(id, teacherId);
            if (!existingCourse) {
                return {
                    success: false,
                    message: 'الدورة غير موجودة',
                    errors: ['الدورة غير موجودة']
                };
            }
            const deleted = await course_model_1.CourseModel.softDelete(id, teacherId);
            if (!deleted) {
                return {
                    success: false,
                    message: 'الدورة غير موجودة',
                    errors: ['الدورة غير موجودة']
                };
            }
            return {
                success: true,
                message: 'تم حذف الدورة'
            };
        }
        catch (error) {
            console.error('Error deleting course:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async getDeletedNotExpired(teacherId, page = 1, limit = 10) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return {
                    success: false,
                    message: 'المعلم غير موجود',
                    errors: ['المعلم غير موجود']
                };
            }
            const result = await course_model_1.CourseModel.findDeletedNotExpiredByTeacher(teacherId, page, limit);
            return {
                success: true,
                message: 'تم جلب الدورات المحذوفة غير المنتهية الصلاحية',
                data: result.courses,
                count: result.total
            };
        }
        catch (error) {
            console.error('Error getting deleted not expired courses:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
    static async restore(id, teacherId) {
        try {
            const teacher = await user_model_1.UserModel.findById(teacherId);
            if (!teacher || teacher.userType !== 'teacher') {
                return {
                    success: false,
                    message: 'المعلم غير موجود',
                    errors: ['المعلم غير موجود']
                };
            }
            const restoredCourse = await course_model_1.CourseModel.restore(id, teacherId);
            if (!restoredCourse) {
                return {
                    success: false,
                    message: 'لا يمكن استرجاع الدورة - إما أنها غير موجودة أو منتهية الصلاحية',
                    errors: ['لا يمكن استرجاع الدورة - إما أنها غير موجودة أو منتهية الصلاحية']
                };
            }
            return {
                success: true,
                message: 'تم استرجاع الدورة بنجاح',
                data: { course: restoredCourse }
            };
        }
        catch (error) {
            console.error('Error restoring course:', error);
            return {
                success: false,
                message: 'فشلت العملية',
                errors: ['خطأ داخلي في الخادم']
            };
        }
    }
}
exports.CourseService = CourseService;
//# sourceMappingURL=course.service.js.map
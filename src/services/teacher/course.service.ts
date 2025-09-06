import { CourseModel } from '@/models/course.model';
import { GradeModel } from '@/models/grade.model';
import { SubjectModel } from '@/models/subject.model';
import { UserModel } from '@/models/user.model';
import { ApiResponse, CreateCourseRequest, UpdateCourseRequest } from '@/types';
import { ImageService } from '@/utils/image.service';

export class CourseService {
  // Create new course
  static async create(teacherId: string, data: CreateCourseRequest): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود']
        };
      }

      // Validate study year format
      const yearPattern = /^\d{4}-\d{4}$/;
      if (!yearPattern.test(data.study_year)) {
        return {
          success: false,
          message: 'السنة الدراسية غير صحيحة',
          errors: ['السنة الدراسية غير صحيحة']
        };
      }

      // Validate grade exists
      const grade = await GradeModel.findById(data.grade_id);
      if (!grade) {
        return {
          success: false,
          message: 'الصف غير موجود',
          errors: ['الصف غير موجود']
        };
      }

      // Validate subject exists and belongs to teacher
      const subject = await SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
      if (!subject) {
        return {
          success: false,
          message: 'المادة غير موجودة',
          errors: ['المادة لا تنتمي للمعلم']
        };
      }

      // Validate dates
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      if (endDate <= startDate) {
        return {
          success: false,
          message: 'نطاق التاريخ غير صحيح',
          errors: ['نطاق التاريخ غير صحيح']
        };
      }

      // Validate price
      if (data.price < 0) {
        return {
          success: false,
          message: 'السعر غير صحيح',
          errors: ['السعر غير صحيح']
        };
      }

      // Validate seats count
      if (data.seats_count <= 0) {
        return {
          success: false,
          message: 'عدد المقاعد غير صحيح',
          errors: ['عدد المقاعد غير صحيح']
        };
      }

      // Check if course already exists for this teacher with same name, year, grade, and subject
      const existingCourse = await CourseModel.courseExistsForTeacher(
        teacherId,
        data.study_year,
        data.course_name,
        data.grade_id,
        data.subject_id
      );
      if (existingCourse) {
        return {
          success: false,
          message: 'الدورة موجودة بالفعل',
          errors: ['الدورة موجودة بالفعل']
        };
      }

      // Process images if provided
      let processedImages: string[] = [];
      if (data.course_images && data.course_images.length > 0) {
        try {
          processedImages = await ImageService.processCourseImages(data.course_images);
        } catch (error) {
          return {
            success: false,
            message: 'خطأ في معالجة الصورة',
            errors: ['خطأ في معالجة الصورة']
          };
        }
      }

      // Create course with processed images
      const courseData = { ...data, course_images: processedImages };
      const course = await CourseModel.create(teacherId, courseData);

      return {
        success: true,
        message: 'تم إنشاء الدورة',
        data: { course }
      };
    } catch (error) {
      console.error('Error creating course:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get all courses for a teacher with pagination and filters
  static async getAllByTeacher(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    studyYear?: string,
    gradeId?: string,
    subjectId?: string,
    deleted?: boolean
  ): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود']
        };
      }

      const result = await CourseModel.findAllByTeacher(teacherId, page, limit, search, studyYear, gradeId, subjectId, deleted);

      return {
        success: true,
        message: 'تمت العملية بنجاح',
        data: result.courses,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting courses:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get course by ID
  static async getById(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      const course = await CourseModel.findByIdWithRelations(id, teacherId);

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
        data: { course }
      };
    } catch (error) {
      console.error('Error getting course:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Update course
  static async update(id: string, teacherId: string, data: UpdateCourseRequest): Promise<ApiResponse> {
    try {
      // Check if course exists and belongs to teacher
      const existingCourse = await CourseModel.findByIdAndTeacher(id, teacherId);
      if (!existingCourse) {
        return {
          success: false,
          message: 'الدورة غير موجودة',
          errors: ['الدورة غير موجودة']
        };
      }

      // Validate study year format if provided
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

      // Validate grade exists if provided
      if (data.grade_id) {
        const grade = await GradeModel.findById(data.grade_id);
        if (!grade) {
          return {
            success: false,
            message: 'الصف غير موجود',
            errors: ['الصف غير موجود']
          };
        }
      }

      // Validate subject exists and belongs to teacher if provided
      if (data.subject_id) {
        const subject = await SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
        if (!subject) {
          return {
            success: false,
            message: 'المادة غير موجودة',
            errors: ['المادة لا تنتمي للمعلم']
          };
        }
      }

      // Validate dates if provided
      if (data.start_date && data.end_date) {
        const startDate = new Date(data.start_date);
        const endDate = new Date(data.end_date);
        if (endDate <= startDate) {
          return {
            success: false,
            message: 'نطاق التاريخ غير صحيح',
            errors: ['نطاق التاريخ غير صحيح']
          };
        }
      }

      // Validate price if provided
      if (data.price !== undefined && data.price < 0) {
        return {
          success: false,
          message: 'السعر غير صحيح',
          errors: ['السعر غير صحيح']
        };
      }

      // Validate seats count if provided
      if (data.seats_count !== undefined && data.seats_count <= 0) {
        return {
          success: false,
          message: 'عدد المقاعد غير صحيح',
          errors: ['عدد المقاعد غير صحيح']
        };
      }

      // Check if new course already exists for this teacher with same name, year, grade, and subject
      if (data.course_name && data.course_name !== existingCourse.course_name) {
        const studyYear = data.study_year || existingCourse.study_year;
        const gradeId = data.grade_id || existingCourse.grade_id;
        const subjectId = data.subject_id || existingCourse.subject_id;

        const nameExists = await CourseModel.courseExistsForTeacher(
          teacherId,
          studyYear,
          data.course_name,
          gradeId,
          subjectId,
          id
        );
        if (nameExists) {
          return {
            success: false,
            message: 'الدورة موجودة بالفعل',
            errors: ['الدورة موجودة بالفعل']
          };
        }
      }

      // Process images if provided
      let processedImages: string[] = existingCourse.course_images;
      if (data.course_images) {
        try {
          processedImages = await ImageService.updateCourseImages(data.course_images, existingCourse.course_images);
        } catch (error) {
          return {
            success: false,
            message: 'خطأ في معالجة الصورة',
            errors: ['خطأ في معالجة الصورة']
          };
        }
      }

      // Update course with processed images
      const updateData = { ...data, course_images: processedImages };
      const course = await CourseModel.update(id, teacherId, updateData);

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
    } catch (error) {
      console.error('Error updating course:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Soft delete course
  static async delete(id: string, teacherId: string): Promise<ApiResponse> {
    try {
      // Check if course exists and belongs to teacher
      const existingCourse = await CourseModel.findByIdAndTeacher(id, teacherId);
      if (!existingCourse) {
        return {
          success: false,
          message: 'الدورة غير موجودة',
          errors: ['الدورة غير موجودة']
        };
      }

      // Soft delete course
      const deleted = await CourseModel.softDelete(id, teacherId);

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
    } catch (error) {
      console.error('Error deleting course:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }



}

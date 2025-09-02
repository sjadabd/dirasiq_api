import { CourseModel } from '@/models/course.model';
import { GradeModel } from '@/models/grade.model';
import { SubjectModel } from '@/models/subject.model';
import { UserModel } from '@/models/user.model';
import { ApiResponse, CreateCourseRequest, UpdateCourseRequest } from '@/types';
import { ImageService } from '@/utils/image.service';
import { getMessage } from '@/utils/messages';

export class CourseService {
  // Create new course
  static async create(teacherId: string, data: CreateCourseRequest): Promise<ApiResponse> {
    try {
      // Validate teacher exists and is a teacher
      const teacher = await UserModel.findById(teacherId);
      if (!teacher || teacher.userType !== 'teacher') {
        return {
          success: false,
          message: getMessage('COURSE.TEACHER_NOT_FOUND'),
          errors: [getMessage('COURSE.TEACHER_NOT_FOUND')]
        };
      }

      // Validate study year format
      const yearPattern = /^\d{4}-\d{4}$/;
      if (!yearPattern.test(data.study_year)) {
        return {
          success: false,
          message: getMessage('COURSE.INVALID_STUDY_YEAR'),
          errors: [getMessage('COURSE.INVALID_STUDY_YEAR')]
        };
      }

      // Validate grade exists and belongs to teacher
      const grade = await GradeModel.findByIdAndTeacher(data.grade_id, teacherId);
      if (!grade) {
        return {
          success: false,
          message: getMessage('COURSE.GRADE_NOT_FOUND'),
          errors: [getMessage('COURSE.GRADE_NOT_OWNED')]
        };
      }

      // Validate subject exists and belongs to teacher
      const subject = await SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
      if (!subject) {
        return {
          success: false,
          message: getMessage('COURSE.SUBJECT_NOT_FOUND'),
          errors: [getMessage('COURSE.SUBJECT_NOT_OWNED')]
        };
      }

      // Validate dates
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      if (endDate <= startDate) {
        return {
          success: false,
          message: getMessage('COURSE.INVALID_DATE_RANGE'),
          errors: [getMessage('COURSE.INVALID_DATE_RANGE')]
        };
      }

      // Validate price
      if (data.price < 0) {
        return {
          success: false,
          message: getMessage('COURSE.INVALID_PRICE'),
          errors: [getMessage('COURSE.INVALID_PRICE')]
        };
      }

      // Validate seats count
      if (data.seats_count <= 0) {
        return {
          success: false,
          message: getMessage('COURSE.INVALID_SEATS_COUNT'),
          errors: [getMessage('COURSE.INVALID_SEATS_COUNT')]
        };
      }

      // Check if course name already exists for this teacher in the same year
      const existingCourse = await CourseModel.nameExistsForTeacher(teacherId, data.study_year, data.course_name);
      if (existingCourse) {
        return {
          success: false,
          message: getMessage('COURSE.ALREADY_EXISTS'),
          errors: [getMessage('COURSE.ALREADY_EXISTS')]
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
            message: getMessage('COURSE.IMAGE_PROCESSING_ERROR'),
            errors: [getMessage('COURSE.IMAGE_PROCESSING_ERROR')]
          };
        }
      }

      // Create course with processed images
      const courseData = { ...data, course_images: processedImages };
      const course = await CourseModel.create(teacherId, courseData);

      return {
        success: true,
        message: getMessage('COURSE.CREATED'),
        data: { course }
      };
    } catch (error) {
      console.error('Error creating course:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('COURSE.TEACHER_NOT_FOUND'),
          errors: [getMessage('COURSE.TEACHER_NOT_FOUND')]
        };
      }

      const result = await CourseModel.findAllByTeacher(teacherId, page, limit, search, studyYear, gradeId, subjectId, deleted);

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: result.courses,
        count: result.total
      };
    } catch (error) {
      console.error('Error getting courses:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('COURSE.NOT_FOUND'),
          errors: [getMessage('COURSE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('GENERAL.SUCCESS'),
        data: { course }
      };
    } catch (error) {
      console.error('Error getting course:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('COURSE.NOT_FOUND'),
          errors: [getMessage('COURSE.NOT_FOUND')]
        };
      }

      // Validate study year format if provided
      if (data.study_year) {
        const yearPattern = /^\d{4}-\d{4}$/;
        if (!yearPattern.test(data.study_year)) {
          return {
            success: false,
            message: getMessage('COURSE.INVALID_STUDY_YEAR'),
            errors: [getMessage('COURSE.INVALID_STUDY_YEAR')]
          };
        }
      }

      // Validate grade exists and belongs to teacher if provided
      if (data.grade_id) {
        const grade = await GradeModel.findByIdAndTeacher(data.grade_id, teacherId);
        if (!grade) {
          return {
            success: false,
            message: getMessage('COURSE.GRADE_NOT_FOUND'),
            errors: [getMessage('COURSE.GRADE_NOT_OWNED')]
          };
        }
      }

      // Validate subject exists and belongs to teacher if provided
      if (data.subject_id) {
        const subject = await SubjectModel.findByIdAndTeacher(data.subject_id, teacherId);
        if (!subject) {
          return {
            success: false,
            message: getMessage('COURSE.SUBJECT_NOT_FOUND'),
            errors: [getMessage('COURSE.SUBJECT_NOT_OWNED')]
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
            message: getMessage('COURSE.INVALID_DATE_RANGE'),
            errors: [getMessage('COURSE.INVALID_DATE_RANGE')]
          };
        }
      }

      // Validate price if provided
      if (data.price !== undefined && data.price < 0) {
        return {
          success: false,
          message: getMessage('COURSE.INVALID_PRICE'),
          errors: [getMessage('COURSE.INVALID_PRICE')]
        };
      }

      // Validate seats count if provided
      if (data.seats_count !== undefined && data.seats_count <= 0) {
        return {
          success: false,
          message: getMessage('COURSE.INVALID_SEATS_COUNT'),
          errors: [getMessage('COURSE.INVALID_SEATS_COUNT')]
        };
      }

      // Check if new course name already exists for this teacher in the same year
      if (data.course_name && data.course_name !== existingCourse.course_name) {
        const studyYear = data.study_year || existingCourse.study_year;
        const nameExists = await CourseModel.nameExistsForTeacher(teacherId, studyYear, data.course_name, id);
        if (nameExists) {
          return {
            success: false,
            message: getMessage('COURSE.ALREADY_EXISTS'),
            errors: [getMessage('COURSE.ALREADY_EXISTS')]
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
            message: getMessage('COURSE.IMAGE_PROCESSING_ERROR'),
            errors: [getMessage('COURSE.IMAGE_PROCESSING_ERROR')]
          };
        }
      }

      // Update course with processed images
      const updateData = { ...data, course_images: processedImages };
      const course = await CourseModel.update(id, teacherId, updateData);

      if (!course) {
        return {
          success: false,
          message: getMessage('COURSE.NOT_FOUND'),
          errors: [getMessage('COURSE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('COURSE.UPDATED'),
        data: { course }
      };
    } catch (error) {
      console.error('Error updating course:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('COURSE.NOT_FOUND'),
          errors: [getMessage('COURSE.NOT_FOUND')]
        };
      }

      // Soft delete course
      const deleted = await CourseModel.softDelete(id, teacherId);

      if (!deleted) {
        return {
          success: false,
          message: getMessage('COURSE.NOT_FOUND'),
          errors: [getMessage('COURSE.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('COURSE.DELETED')
      };
    } catch (error) {
      console.error('Error deleting course:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }
}

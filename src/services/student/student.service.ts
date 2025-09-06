import { CourseModel } from '@/models/course.model';
import { StudentGradeModel } from '@/models/student-grade.model';
import { UserModel } from '@/models/user.model';
import { ApiResponse, StudentGrade } from '@/types';

export class StudentService {
  // Get active grades for student
  static async getActiveGrades(studentId: string): Promise<ApiResponse> {
    try {
      const studentGrades = await StudentGradeModel.findActiveByStudentId(studentId);

      if (!studentGrades || studentGrades.length === 0) {
        return {
          success: false,
          message: 'لا يوجد صف نشط',
          errors: ['لا يوجد صف نشط']
        };
      }

      return {
        success: true,
        message: 'تم العثور على الصفوف',
        data: { grades: studentGrades }
      };
    } catch (error) {
      console.error('Error getting active grades for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get student by ID
  static async getStudentById(studentId: string): Promise<ApiResponse> {
    try {
      const student = await UserModel.findById(studentId);

      if (!student || student.userType !== 'student') {
        return {
          success: false,
          message: 'الطالب غير موجود',
          errors: ['الطالب غير موجود']
        };
      }

      return {
        success: true,
        message: 'تم العثور على الطالب',
        data: { student }
      };
    } catch (error) {
      console.error('Error getting student by ID:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Validate student location
  static async validateStudentLocation(studentId: string): Promise<ApiResponse> {
    try {
      const student = await UserModel.findById(studentId);

      if (!student || student.userType !== 'student') {
        return {
          success: false,
          message: 'الطالب غير موجود',
          errors: ['الطالب غير موجود']
        };
      }

      if (!student.latitude || !student.longitude) {
        return {
          success: false,
          message: 'الموقع غير محدد',
          errors: ['الموقع غير محدد']
        };
      }

      return {
        success: true,
        message: 'الموقع صحيح',
        data: {
          location: {
            latitude: student.latitude,
            longitude: student.longitude
          }
        }
      };
    } catch (error) {
      console.error('Error validating student location:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get suggested courses for student based on grade and location
  static async getSuggestedCoursesForStudent(
    studentGrades: StudentGrade[],
    studentLocation: { latitude: number; longitude: number },
    maxDistance: number = 5,
    page: number = 1,
    limit: number = 10
  ): Promise<ApiResponse> {
    try {
      const offset = (page - 1) * limit;

      // Get courses that match student's grades
      const gradeIds = studentGrades.map(sg => sg.gradeId);
      const courses = await CourseModel.findByGradesAndLocation(
        gradeIds,
        studentLocation,
        maxDistance,
        limit,
        offset
      );

      if (!courses || courses.length === 0) {
        return {
          success: true,
          message: 'لم يتم العثور على دورات',
          data: { courses: [], count: 0 },
          count: 0
        };
      }

      return {
        success: true,
        message: 'تم العثور على الدورات',
        data: { courses },
        count: courses.length
      };
    } catch (error) {
      console.error('Error getting suggested courses for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Get course details by ID for student
  static async getCourseByIdForStudent(courseId: string, studentId: string): Promise<ApiResponse> {
    try {
      const course = await CourseModel.findById(courseId);

      if (!course) {
        return {
          success: false,
          message: 'الدورة غير موجودة',
          errors: ['الدورة غير موجودة']
        };
      }

      // Get teacher details
      const teacher = await UserModel.findById(course.teacher_id);
      if (!teacher) {
        return {
          success: false,
          message: 'المعلم غير موجود',
          errors: ['المعلم غير موجود']
        };
      }

      // Calculate distance between student and teacher
      const student = await UserModel.findById(studentId);
      let distance = null;
      if (student && student.latitude && student.longitude && teacher.latitude && teacher.longitude) {
        distance = this.calculateDistance(
          student.latitude,
          student.longitude,
          teacher.latitude,
          teacher.longitude
        );
      }

      const courseWithDetails = {
        ...course,
        teacher: {
          id: teacher.id,
          name: teacher.name,
          phone: (teacher as any).phone,
          address: (teacher as any).address,
          bio: (teacher as any).bio,
          experienceYears: (teacher as any).experienceYears,
          distance: distance
        }
      };

      return {
        success: true,
        message: 'تم العثور على الدورة',
        data: { course: courseWithDetails }
      };
    } catch (error) {
      console.error('Error getting course by ID for student:', error);
      return {
        success: false,
        message: 'فشلت العملية',
        errors: ['خطأ داخلي في الخادم']
      };
    }
  }

  // Calculate distance between two points using Haversine formula
  private static calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  // Convert degrees to radians
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

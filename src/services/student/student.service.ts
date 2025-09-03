import { StudentGradeModel } from '@/models/student-grade.model';
import { UserModel } from '@/models/user.model';
import { ApiResponse } from '@/types';
import { getMessage } from '@/utils/messages';

export class StudentService {
  // Get active grades for student
  static async getActiveGrades(studentId: string): Promise<ApiResponse> {
    try {
      const studentGrades = await StudentGradeModel.findActiveByStudentId(studentId);

      if (!studentGrades || studentGrades.length === 0) {
        return {
          success: false,
          message: getMessage('STUDENT.NO_ACTIVE_GRADE'),
          errors: [getMessage('STUDENT.NO_ACTIVE_GRADE')]
        };
      }

      return {
        success: true,
        message: getMessage('STUDENT.GRADES_FOUND'),
        data: { grades: studentGrades }
      };
    } catch (error) {
      console.error('Error getting active grades for student:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('STUDENT.NOT_FOUND'),
          errors: [getMessage('STUDENT.NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('STUDENT.STUDENT_FOUND'),
        data: { student }
      };
    } catch (error) {
      console.error('Error getting student by ID:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
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
          message: getMessage('STUDENT.NOT_FOUND'),
          errors: [getMessage('STUDENT.NOT_FOUND')]
        };
      }

      if (!student.latitude || !student.longitude) {
        return {
          success: false,
          message: getMessage('STUDENT.LOCATION_NOT_SET'),
          errors: [getMessage('STUDENT.LOCATION_NOT_SET')]
        };
      }

      return {
        success: true,
        message: getMessage('STUDENT.LOCATION_VALID'),
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
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }
}

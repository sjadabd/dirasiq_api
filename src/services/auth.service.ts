import { sendPasswordResetEmail, sendVerificationEmail } from '@/config/email';
import { StudentGradeModel } from '@/models/student-grade.model';
import { TeacherGradeModel } from '@/models/teacher-grade.model';
import { TokenModel } from '@/models/token.model';
import { UserModel } from '@/models/user.model';
import { GeocodingService } from '@/services/geocoding.service';
import {
  ApiResponse,
  LoginRequest,
  RegisterStudentRequest,
  RegisterSuperAdminRequest,
  RegisterTeacherRequest,
  User,
  UserStatus,
  UserType
} from '@/types';
import { getMessage } from '@/utils/messages';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export class AuthService {
  // Register super admin
  static async registerSuperAdmin(data: RegisterSuperAdminRequest): Promise<ApiResponse> {
    try {
      // Check if super admin already exists
      const superAdminExists = await UserModel.superAdminExists();
      if (superAdminExists) {
        return {
          success: false,
          message: getMessage('AUTH.SUPER_ADMIN_EXISTS'),
          errors: [getMessage('AUTH.SUPER_ADMIN_EXISTS')]
        };
      }

      // Create super admin
      const superAdmin = await UserModel.create({
        name: data.name,
        email: data.email,
        password: data.password,
        userType: UserType.SUPER_ADMIN,
        status: UserStatus.ACTIVE
      });

      return {
        success: true,
        message: getMessage('AUTH.SUPER_ADMIN_REGISTERED'),
        data: {
          user: this.sanitizeUser(superAdmin)
        }
      };
    } catch (error) {
      console.error('Error registering super admin:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Register teacher
  static async registerTeacher(data: RegisterTeacherRequest): Promise<ApiResponse> {
    try {
      // Create teacher
      const teacherData: Partial<User> = {
        name: data.name,
        email: data.email,
        password: data.password,
        userType: UserType.TEACHER,
        status: UserStatus.PENDING
      };

      // Add teacher-specific fields
      if (data.phone) teacherData.phone = data.phone;
      if (data.address) teacherData.address = data.address;
      if (data.bio) teacherData.bio = data.bio;
      if (data.experienceYears) teacherData.experienceYears = data.experienceYears;
      if (data.visitorId) teacherData.visitorId = data.visitorId;
      if (data.deviceInfo) teacherData.deviceInfo = data.deviceInfo;
      if (data.latitude !== undefined) teacherData.latitude = data.latitude;
      if (data.longitude !== undefined) teacherData.longitude = data.longitude;

      // Add location fields directly from request or use geocoding service
      if (data.formattedAddress) teacherData.formattedAddress = data.formattedAddress;
      if (data.country) teacherData.country = data.country;
      if (data.city) teacherData.city = data.city;
      if (data.state) teacherData.state = data.state;
      if (data.zipcode) teacherData.zipcode = data.zipcode;
      if (data.streetName) teacherData.streetName = data.streetName;
      if (data.suburb) teacherData.suburb = data.suburb;
      if (data.locationConfidence !== undefined) teacherData.locationConfidence = data.locationConfidence;

      // Get location details using geocoding service if coordinates provided but no address details
      if (data.latitude && data.longitude && !data.formattedAddress) {
        try {
          const geocodingService = new GeocodingService();
          const locationDetails = await geocodingService.getLocationDetails(data.latitude, data.longitude);

          if (locationDetails) {
            teacherData.formattedAddress = locationDetails.formattedAddress;
            teacherData.country = locationDetails.country;
            teacherData.city = locationDetails.city;
            teacherData.state = locationDetails.state;
            teacherData.zipcode = locationDetails.zipcode;
            teacherData.streetName = locationDetails.streetName;
            teacherData.suburb = locationDetails.suburb;
            teacherData.locationConfidence = locationDetails.confidence;
          }
        } catch (error) {
          console.error('Error getting location details:', error);
          // Continue with registration even if geocoding fails
        }
      }

      const teacher = await UserModel.create(teacherData);

      // Create teacher grade relationships
      if (data.gradeIds && data.gradeIds.length > 0 && data.studyYear) {
        try {
          await TeacherGradeModel.createMany(teacher.id, data.gradeIds, data.studyYear);
        } catch (error) {
          console.error('Error creating teacher grade relationships:', error);
          // Continue with registration even if grade relationships fail
        }
      }

      // Get verification code from database
      const verificationCode = await UserModel.getVerificationCode(data.email);

      // Send verification email
      const emailSent = await sendVerificationEmail(
        data.email,
        verificationCode || '',
        data.name
      );

      if (!emailSent) {
        return {
          success: false,
          message: getMessage('AUTH.EMAIL_SEND_FAILED'),
          errors: [getMessage('AUTH.EMAIL_SEND_FAILED')]
        };
      }

      return {
        success: true,
        message: getMessage('AUTH.TEACHER_REGISTERED'),
        data: {
          user: this.sanitizeUser(teacher)
        }
      };
    } catch (error) {
      console.error('Error registering teacher:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Register student
  static async registerStudent(data: RegisterStudentRequest): Promise<ApiResponse> {
    try {
      // Create student
      const studentData: Partial<User> = {
        name: data.name,
        email: data.email,
        password: data.password,
        userType: UserType.STUDENT,
        status: UserStatus.PENDING
      };

      // Add student-specific fields
      if (data.studentPhone) studentData.studentPhone = data.studentPhone;
      if (data.parentPhone) studentData.parentPhone = data.parentPhone;
      if (data.schoolName) studentData.schoolName = data.schoolName;
      if (data.gender) studentData.gender = data.gender;
      if (data.birthDate) studentData.birthDate = new Date(data.birthDate);
      if (data.latitude !== undefined) studentData.latitude = data.latitude;
      if (data.longitude !== undefined) studentData.longitude = data.longitude;

      // Add location fields directly from request or use geocoding service
      if (data.formattedAddress) studentData.formattedAddress = data.formattedAddress;
      if (data.country) studentData.country = data.country;
      if (data.city) studentData.city = data.city;
      if (data.state) studentData.state = data.state;
      if (data.zipcode) studentData.zipcode = data.zipcode;
      if (data.streetName) studentData.streetName = data.streetName;
      if (data.suburb) studentData.suburb = data.suburb;
      if (data.locationConfidence !== undefined) studentData.locationConfidence = data.locationConfidence;

      // Get location details using geocoding service if coordinates provided but no address details
      if (data.latitude && data.longitude && !data.formattedAddress) {
        try {
          const geocodingService = new GeocodingService();
          const locationDetails = await geocodingService.getLocationDetails(data.latitude, data.longitude);

          if (locationDetails) {
            studentData.formattedAddress = locationDetails.formattedAddress;
            studentData.country = locationDetails.country;
            studentData.city = locationDetails.city;
            studentData.state = locationDetails.state;
            studentData.zipcode = locationDetails.zipcode;
            studentData.streetName = locationDetails.streetName;
            studentData.suburb = locationDetails.suburb;
            studentData.locationConfidence = locationDetails.confidence;
          }
        } catch (error) {
          console.error('Error getting location details:', error);
          // Continue with registration even if geocoding fails
        }
      }

      const student = await UserModel.create(studentData);

      // Create student grade relationship
      try {
        await StudentGradeModel.create({
          studentId: student.id,
          gradeId: data.gradeId,
          studyYear: data.studyYear
        });
      } catch (error) {
        console.error('Error creating student grade relationship:', error);
        // Continue with registration even if grade relationship fails
      }

      // Get verification code from database
      const verificationCode = await UserModel.getVerificationCode(data.email);

      // Send verification email
      const emailSent = await sendVerificationEmail(
        data.email,
        verificationCode || '',
        data.name
      );

      if (!emailSent) {
        return {
          success: false,
          message: getMessage('AUTH.EMAIL_SEND_FAILED'),
          errors: [getMessage('AUTH.EMAIL_SEND_FAILED')]
        };
      }

      return {
        success: true,
        message: getMessage('STUDENT.REGISTRATION_SUCCESS'),
        data: {
          user: this.sanitizeUser(student)
        }
      };
    } catch (error) {
      console.error('Error registering student:', error);
      return {
        success: false,
        message: getMessage('GENERAL.OPERATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Login user
  static async login(data: LoginRequest): Promise<ApiResponse> {
    try {
      // Find user by email
      const user = await UserModel.findByEmail(data.email);
      if (!user) {
        return {
          success: false,
          message: getMessage('AUTH.INVALID_CREDENTIALS'),
          errors: [getMessage('AUTH.INVALID_CREDENTIALS')]
        };
      }

      // Check if user is active
      if (user.status !== UserStatus.ACTIVE) {
        return {
          success: false,
          message: getMessage('AUTH.ACCOUNT_NOT_ACTIVE'),
          errors: [getMessage('AUTH.ACCOUNT_NOT_ACTIVE_ERROR')]
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(data.password, user.password);
      if (!isPasswordValid) {
        return {
          success: false,
          message: getMessage('AUTH.INVALID_CREDENTIALS'),
          errors: [getMessage('AUTH.INVALID_CREDENTIALS')]
        };
      }

      // Check if profile is complete
      const isProfileComplete = this.isProfileComplete(user);

      // Generate token
      const token = await this.generateToken(user);

      return {
        success: true,
        message: getMessage('AUTH.LOGIN_SUCCESS'),
        data: {
          user: this.sanitizeUser(user),
          token,
          isProfileComplete: isProfileComplete,
          requiresProfileCompletion: !isProfileComplete
        }
      };
    } catch (error) {
      console.error('Error during login:', error);
      return {
        success: false,
        message: getMessage('AUTH.AUTHENTICATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Logout user
  static async logout(token: string): Promise<ApiResponse> {
    try {
      const deleted = await TokenModel.deleteByToken(token);

      if (!deleted) {
        return {
          success: false,
          message: getMessage('AUTH.INVALID_TOKEN'),
          errors: [getMessage('AUTH.TOKEN_NOT_FOUND')]
        };
      }

      return {
        success: true,
        message: getMessage('AUTH.LOGOUT_SUCCESS')
      };
    } catch (error) {
      console.error('Error during logout:', error);
      return {
        success: false,
        message: getMessage('AUTH.AUTHENTICATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Verify email for teacher or student
  static async verifyEmail(email: string, code: string): Promise<ApiResponse> {
    try {
      const verified = await UserModel.verifyEmail(email, code);

      if (!verified) {
        return {
          success: false,
          message: getMessage('AUTH.VERIFICATION_FAILED'),
          errors: [getMessage('AUTH.TOKEN_EXPIRED')]
        };
      }

      return {
        success: true,
        message: getMessage('AUTH.EMAIL_VERIFIED')
      };
    } catch (error) {
      console.error('Error verifying email:', error);
      return {
        success: false,
        message: getMessage('AUTH.VERIFICATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Resend verification code for teacher or student
  static async resendVerificationCode(email: string): Promise<ApiResponse> {
    try {
      const resent = await UserModel.resendVerificationCode(email);

      if (!resent) {
        return {
          success: false,
          message: getMessage('AUTH.VERIFICATION_FAILED'),
          errors: [getMessage('AUTH.EMAIL_NOT_VERIFIED')]
        };
      }

      // Get updated user to get new verification code
      const updatedUser = await UserModel.findByEmail(email);
      if (updatedUser) {
        const verificationCode = await UserModel.getVerificationCode(email);
        await sendVerificationEmail(email, verificationCode || '', updatedUser.name);
      }

      return {
        success: true,
        message: getMessage('AUTH.VERIFICATION_CODE_SENT')
      };
    } catch (error) {
      console.error('Error resending verification code:', error);
      return {
        success: false,
        message: getMessage('AUTH.VERIFICATION_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Request password reset
  static async requestPasswordReset(email: string): Promise<ApiResponse> {
    try {
      const resetCode = await UserModel.setPasswordResetCode(email);

      if (!resetCode) {
        return {
          success: false,
          message: getMessage('AUTH.USER_NOT_FOUND'),
          errors: [getMessage('AUTH.USER_NOT_FOUND')]
        };
      }

      const user = await UserModel.findByEmail(email);
      if (user) {
        const emailSent = await sendPasswordResetEmail(email, resetCode, user.name);

        if (!emailSent) {
          return {
            success: false,
            message: getMessage('AUTH.EMAIL_SEND_FAILED'),
            errors: [getMessage('AUTH.EMAIL_SEND_FAILED')]
          };
        }
      }

      return {
        success: true,
        message: getMessage('AUTH.PASSWORD_RESET_CODE_SENT')
      };
    } catch (error) {
      console.error('Error requesting password reset:', error);
      return {
        success: false,
        message: getMessage('AUTH.PASSWORD_RESET_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Reset password
  static async resetPassword(email: string, code: string, newPassword: string): Promise<ApiResponse> {
    try {
      const reset = await UserModel.resetPassword(email, code, newPassword);

      if (!reset) {
        return {
          success: false,
          message: getMessage('AUTH.RESET_CODE_INVALID'),
          errors: [getMessage('AUTH.RESET_CODE_INVALID')]
        };
      }

      return {
        success: true,
        message: getMessage('AUTH.PASSWORD_RESET_SUCCESS')
      };
    } catch (error) {
      console.error('Error resetting password:', error);
      return {
        success: false,
        message: getMessage('AUTH.PASSWORD_RESET_FAILED'),
        errors: [getMessage('SERVER.INTERNAL_ERROR')]
      };
    }
  }

  // Generate JWT token
  private static async generateToken(user: User): Promise<string> {
    const payload = {
      userId: user.id,
      email: user.email,
      userType: user.userType
    };

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error(getMessage('AUTH.JWT_SECRET_NOT_CONFIGURED'));
    }

    const expiresIn = process.env['JWT_EXPIRES_IN'] || '4h';

    const token = jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);

    // Calculate expiration time (4 AM Iraq time)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(4, 0, 0, 0); // 4 AM

    // Store token in database
    await TokenModel.create(user.id, token, tomorrow);

    return token;
  }

  // Check if user profile is complete
  private static isProfileComplete(user: User): boolean {
    if (user.userType === UserType.TEACHER) {
      // Check required teacher fields
      return !!(
        user.phone &&
        user.phone.trim() !== '' &&
        user.address &&
        user.address.trim() !== '' &&
        user.bio &&
        user.bio.trim() !== '' &&
        user.experienceYears !== null &&
        user.experienceYears !== undefined
      );
    } else if (user.userType === UserType.STUDENT) {
      // Check required student fields
      return !!(
        user.studentPhone &&
        user.studentPhone.trim() !== '' &&
        user.parentPhone &&
        user.parentPhone.trim() !== '' &&
        user.schoolName &&
        user.schoolName.trim() !== ''
      );
    }
    return false;
  }

  // Google OAuth authentication
  static async googleAuth(googleData: any, userType: 'teacher' | 'student'): Promise<ApiResponse> {
    try {
      const { email, name, sub } = googleData;

      // Check if user already exists
      const existingUser = await UserModel.findByEmail(email);

      if (existingUser) {
        // User exists, check if user type matches
        if (existingUser.userType !== (userType === 'teacher' ? UserType.TEACHER : UserType.STUDENT)) {
          return {
            success: false,
            message: 'نوع المستخدم لا يتطابق مع الحساب الموجود',
            errors: ['User type mismatch with existing account']
          };
        }

        // Check if profile is complete
        const isProfileComplete = this.isProfileComplete(existingUser);

        // Generate JWT token for existing user
        const token = jwt.sign(
          {
            userId: existingUser.id,
            userType: existingUser.userType,
            email: existingUser.email
          },
          process.env['JWT_SECRET'] || 'fallback-secret',
          { expiresIn: '7d' }
        );

        // Store token in database
        await TokenModel.create(
          existingUser.id,
          token,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        );

        return {
          success: true,
          message: 'تم تسجيل الدخول بنجاح',
          data: {
            user: this.sanitizeUser(existingUser),
            token,
            isNewUser: false,
            isProfileComplete: isProfileComplete,
            requiresProfileCompletion: !isProfileComplete
          }
        };
      }

      // User doesn't exist, create new user
      const tempPassword = `google_${sub}_${Date.now()}`; // Temporary password
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      let newUser: User;

      if (userType === 'teacher') {
        // Create teacher with minimal data
        newUser = await UserModel.create({
          name,
          email,
          password: hashedPassword,
          userType: UserType.TEACHER,
          status: UserStatus.ACTIVE,
          phone: '', // Will be filled later
          address: '', // Will be filled later
          bio: '', // Will be filled later
          experienceYears: 0, // Will be filled later
          deviceInfo: 'Google OAuth'
        });
      } else {
        // Create student with minimal data
        newUser = await UserModel.create({
          name,
          email,
          password: hashedPassword,
          userType: UserType.STUDENT,
          status: UserStatus.ACTIVE,
          studentPhone: '', // Will be filled later
          parentPhone: '', // Will be filled later
          schoolName: '' // Will be filled later
        });
      }

      // Generate JWT token for new user
      const token = jwt.sign(
        {
          userId: newUser.id,
          userType: newUser.userType,
          email: newUser.email
        },
        process.env['JWT_SECRET'] || 'fallback-secret',
        { expiresIn: '7d' }
      );

      // Store token in database
      await TokenModel.create(
        newUser.id,
        token,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      );

      return {
        success: true,
        message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح',
        data: {
          user: this.sanitizeUser(newUser),
          token,
          isNewUser: true,
          isProfileComplete: false, // New user always has incomplete profile
          requiresProfileCompletion: true
        }
      };
    } catch (error) {
      console.error('Error in googleAuth service:', error);
      return {
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      };
    }
  }

  // Complete profile for Google OAuth users
  static async completeProfile(userId: string, userType: string, profileData: any): Promise<ApiResponse> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        return {
          success: false,
          message: 'المستخدم غير موجود',
          errors: ['User not found']
        };
      }

      if (userType === 'teacher') {
        const { phone, address, bio, experienceYears, gradeIds, studyYear } = profileData;

        // Update teacher profile
        const updatedUser = await UserModel.update(userId, {
          phone,
          address,
          bio,
          experienceYears: parseInt(experienceYears)
        });

        // Create teacher grades
        for (const gradeId of gradeIds) {
          await TeacherGradeModel.create({
            teacherId: userId,
            gradeId,
            studyYear
          });
        }

        // Check if profile is now complete
        const isProfileComplete = updatedUser ? this.isProfileComplete(updatedUser) : false;

        return {
          success: true,
          message: 'تم تحديث الملف الشخصي بنجاح',
          data: {
            user: updatedUser ? this.sanitizeUser(updatedUser) : null,
            isProfileComplete: isProfileComplete,
            requiresProfileCompletion: !isProfileComplete
          }
        };
      } else if (userType === 'student') {
        const { gradeId, studyYear, studentPhone, parentPhone, schoolName, gender, birthDate } = profileData;

        // Update student profile
        const updatedUser = await UserModel.update(userId, {
          studentPhone,
          parentPhone,
          schoolName,
          gender,
          birthDate
        });

        // Create student grade
        await StudentGradeModel.create({
          studentId: userId,
          gradeId,
          studyYear
        });

        // Check if profile is now complete
        const isProfileComplete = updatedUser ? this.isProfileComplete(updatedUser) : false;

        return {
          success: true,
          message: 'تم تحديث الملف الشخصي بنجاح',
          data: {
            user: updatedUser ? this.sanitizeUser(updatedUser) : null,
            isProfileComplete: isProfileComplete,
            requiresProfileCompletion: !isProfileComplete
          }
        };
      }

      return {
        success: false,
        message: 'نوع المستخدم غير صحيح',
        errors: ['Invalid user type']
      };
    } catch (error) {
      console.error('Error in completeProfile service:', error);
      return {
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      };
    }
  }

  // Sanitize user data (remove sensitive information)
  private static sanitizeUser(user: User): Partial<User> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}

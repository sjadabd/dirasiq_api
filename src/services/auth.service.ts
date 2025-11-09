import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { sendPasswordResetEmail, sendVerificationEmail } from '../config/email';
import { GradeModel } from '../models/grade.model';
import { StudentGradeModel } from '../models/student-grade.model';
import { SubscriptionPackageModel } from '../models/subscription-package.model';
import { TeacherGradeModel } from '../models/teacher-grade.model';
import { TeacherSubscriptionModel } from '../models/teacher-subscription.model';
import { TokenModel } from '../models/token.model';
import { UserModel } from '../models/user.model';
import { GeocodingService } from '../services/geocoding.service';
import { QrService } from '../services/qr.service';
import { AcademicYearService } from '../services/super_admin/academic-year.service';
import {
  ApiResponse,
  LoginRequest,
  RegisterStudentRequest,
  RegisterSuperAdminRequest,
  RegisterTeacherRequest,
  User,
  UserStatus,
  UserType,
} from '../types';
import { ImageService } from '../utils/image.service';

export class AuthService {
  // Register super admin
  static async registerSuperAdmin(
    data: RegisterSuperAdminRequest
  ): Promise<ApiResponse> {
    try {
      // Check if super admin already exists
      const superAdminExists = await UserModel.superAdminExists();
      if (superAdminExists) {
        return {
          success: false,
          message: 'السوبر أدمن موجود بالفعل',
          errors: ['السوبر أدمن موجود بالفعل'],
        };
      }

      // Create super admin
      const superAdmin = await UserModel.create({
        name: data.name,
        email: data.email,
        password: data.password,
        userType: UserType.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      });

      return {
        success: true,
        message: 'تم تسجيل السوبر أدمن بنجاح',
        data: {
          user: this.sanitizeUser(superAdmin),
        },
      };
    } catch (error) {
      console.error('Error registering super admin:', error);
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Apple Sign-in authentication
  static async appleAuth(
    appleData: any,
    userType: 'teacher' | 'student'
  ): Promise<ApiResponse> {
    try {
      const { email, name, sub } = appleData;

      // Check if user already exists
      const existingUser = await UserModel.findByEmail(email);

      if (existingUser) {
        if (existingUser.authProvider !== 'apple') {
          return {
            success: false,
            message:
              'قمت بانشاء الحساب باستخدام طريقة أخرى الرجاء تسجيل الدخول بنفس الطريقة',
            errors: [
              'قمت بانشاء الحساب باستخدام البريد/Google الرجاء تسجيل الدخول بنفس الطريقة',
            ],
          };
        }

        // User exists, check user type
        if (
          existingUser.userType !==
          (userType === 'teacher' ? UserType.TEACHER : UserType.STUDENT)
        ) {
          return {
            success: false,
            message: 'نوع المستخدم لا يتطابق مع الحساب الموجود',
            errors: ['User type mismatch with existing account'],
          };
        }

        // Check profile completeness
        const isProfileComplete = this.isProfileComplete(existingUser);

        // Active academic year
        const academicYearResponse = await AcademicYearService.getActive();
        const activeAcademicYear = academicYearResponse.success
          ? academicYearResponse.data?.academicYear
          : null;

        // Enhanced user
        const enhancedUser = await this.getEnhancedUserData(existingUser);

        // Ensure teacher QR
        try {
          if (existingUser.userType === UserType.TEACHER) {
            await QrService.ensureTeacherQr(existingUser.id);
          }
        } catch (e) {
          console.error(
            'Auto-ensure teacher QR (apple existing user) failed:',
            e
          );
        }

        // Generate JWT and store token with OneSignal playerId
        const jwtSecret = process.env['JWT_SECRET'];
        if (!jwtSecret) console.warn('⚠️ Missing JWT_SECRET in environment!');
        const token = jwt.sign(
          {
            userId: existingUser.id,
            userType: existingUser.userType,
            email: existingUser.email,
          },
          jwtSecret || 'fallback-secret',
          { expiresIn: '7d' }
        );

        await TokenModel.create(
          existingUser.id,
          token,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          appleData.oneSignalPlayerId
        );

        return {
          success: true,
          message: 'تم تسجيل الدخول بنجاح',
          data: {
            user: {
              ...enhancedUser,
              studyYear: activeAcademicYear?.year,
            },
            token,
            isNewUser: false,
            isProfileComplete,
            requiresProfileCompletion: !isProfileComplete,
            activeAcademicYear,
          },
        };
      }

      // Create new user
      const tempPassword = `apple_${sub}_${randomUUID()}`;
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      let newUser: User;
      if (userType === 'teacher') {
        newUser = await UserModel.create({
          name,
          email,
          password: hashedPassword,
          userType: UserType.TEACHER,
          status: UserStatus.ACTIVE,

          authProvider: 'apple',
          oauthProviderId: sub,

          phone: '',
          address: '',
          bio: '',
          experienceYears: 0,
          deviceInfo: 'Apple SignIn',
        });

        // Auto-create free subscription and QR
        try {
          const freePackage = await SubscriptionPackageModel.getFreePackage();
          if (freePackage) {
            const startDate = new Date();
            const endDate = new Date(startDate);
            endDate.setDate(
              endDate.getDate() + Number(freePackage.durationDays || 30)
            );

            await TeacherSubscriptionModel.create({
              teacherId: newUser.id,
              subscriptionPackageId: freePackage.id,
              startDate,
              endDate,
            });
          }
        } catch (subErr) {
          console.error(
            'Failed to auto-create free subscription for Apple teacher:',
            subErr
          );
        }

        try {
          await QrService.ensureTeacherQr(newUser.id);
        } catch (e) {
          console.error(
            'Auto-ensure teacher QR (apple new teacher) failed:',
            e
          );
        }
      } else {
        newUser = await UserModel.create({
          name,
          email,
          password: hashedPassword,
          userType: UserType.STUDENT,
          status: UserStatus.ACTIVE,

          authProvider: 'apple',
          oauthProviderId: sub,

          studentPhone: '',
          parentPhone: '',
          schoolName: '',
        });
      }

      // Active academic year
      const academicYearResponse = await AcademicYearService.getActive();
      const activeAcademicYear = academicYearResponse.success
        ? academicYearResponse.data?.academicYear
        : null;

      const enhancedUser = await this.getEnhancedUserData(newUser);

      const jwtSecret2 = process.env['JWT_SECRET'];
      if (!jwtSecret2) console.warn('⚠️ Missing JWT_SECRET in environment!');
      const token = jwt.sign(
        {
          userId: newUser.id,
          userType: newUser.userType,
          email: newUser.email,
        },
        jwtSecret2 || 'fallback-secret',
        { expiresIn: '7d' }
      );

      await TokenModel.create(
        newUser.id,
        token,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        appleData.oneSignalPlayerId
      );

      return {
        success: true,
        message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح',
        data: {
          user: {
            ...enhancedUser,
            studyYear: activeAcademicYear?.year,
          },
          token,
          isNewUser: true,
          isProfileComplete: false,
          requiresProfileCompletion: true,
          activeAcademicYear,
        },
      };
    } catch (error) {
      console.error('Error in appleAuth service:', error);
      return {
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Register teacher
  static async registerTeacher(
    data: RegisterTeacherRequest
  ): Promise<ApiResponse> {
    try {
      // Normalize email and pre-check duplicates
      const emailLower = (data.email || '').toLowerCase();
      const existingProvider = await UserModel.getAuthProviderByEmail(emailLower);
      if (existingProvider) {
        return {
          success: false,
          message:
            existingProvider === 'google'
              ? 'هذا البريد مسجّل عبر Google، الرجاء تسجيل الدخول باستخدام Google'
              : 'البريد الإلكتروني مستخدم مسبقاً',
          errors: [
            existingProvider === 'google'
              ? 'Email already registered via Google'
              : 'Email already exists',
          ],
        };
      }

      // Create teacher
      const teacherData: Partial<User> = {
        name: data.name,
        email: emailLower,
        password: data.password,
        userType: UserType.TEACHER,
        status: UserStatus.PENDING,
      };

      // Add teacher-specific fields
      if (data.phone) teacherData.phone = data.phone;
      if (data.address) teacherData.address = data.address;
      if (data.bio) teacherData.bio = data.bio;
      if (data.experienceYears)
        teacherData.experienceYears = data.experienceYears;
      if (data.visitorId) teacherData.visitorId = data.visitorId;
      if (data.deviceInfo) teacherData.deviceInfo = data.deviceInfo;
      if (data.latitude !== undefined) teacherData.latitude = data.latitude;
      if (data.longitude !== undefined) teacherData.longitude = data.longitude;

      // Add location fields directly from request or use geocoding service
      if (data.formattedAddress)
        teacherData.formattedAddress = data.formattedAddress;
      if (data.country) teacherData.country = data.country;
      if (data.city) teacherData.city = data.city;
      if (data.state) teacherData.state = data.state;
      if (data.zipcode) teacherData.zipcode = data.zipcode;
      if (data.streetName) teacherData.streetName = data.streetName;
      if (data.suburb) teacherData.suburb = data.suburb;
      if (data.locationConfidence !== undefined)
        teacherData.locationConfidence = data.locationConfidence;

      // Get location details using geocoding service if coordinates provided but no address details
      if (data.latitude && data.longitude && !data.formattedAddress) {
        try {
          const geocodingService = new GeocodingService();
          const locationDetails = await geocodingService.getLocationDetails(
            data.latitude,
            data.longitude
          );

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

      // ✅ إنشاء اشتراك مجاني تلقائيًا للمعلم الجديد (مثلاً 20 طالب لمدة 30 يومًا حسب جدول الباقات)
      try {
        const freePackage = await SubscriptionPackageModel.getFreePackage();
        if (freePackage) {
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setDate(
            endDate.getDate() + Number(freePackage.durationDays || 30)
          );

          await TeacherSubscriptionModel.create({
            teacherId: teacher.id,
            subscriptionPackageId: freePackage.id,
            startDate,
            endDate,
          });
        } else {
          console.warn(
            'No free subscription package found. Skipping auto-subscription for teacher.'
          );
        }
      } catch (subErr) {
        console.error(
          'Failed to auto-create free subscription for teacher:',
          subErr
        );
      }

      // Create teacher grade relationships
      if (data.gradeIds && data.gradeIds.length > 0 && data.studyYear) {
        try {
          await TeacherGradeModel.createMany(
            teacher.id,
            data.gradeIds,
            data.studyYear
          );
        } catch (error) {
          console.error('Error creating teacher grade relationships:', error);
          // Continue with registration even if grade relationships fail
        }
      }

      // Get verification code from database
      const verificationCode = await UserModel.getVerificationCode(emailLower);

      // Send verification email
      const emailSent = await sendVerificationEmail(
        data.email,
        verificationCode || '',
        data.name
      );

      if (!emailSent) {
        return {
          success: false,
          message: 'فشل في إرسال البريد الإلكتروني',
          errors: ['فشل في إرسال البريد الإلكتروني'],
        };
      }

      return {
        success: true,
        message: 'تم تسجيل المعلم بنجاح',
        data: {
          user: this.sanitizeUser(teacher),
        },
      };
    } catch (error: any) {
      console.error('Error registering teacher:', error);
      if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
        return {
          success: false,
          message: 'البريد الإلكتروني مستخدم مسبقاً',
          errors: ['Email already exists'],
        };
      }
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Register student
  static async registerStudent(
    data: RegisterStudentRequest
  ): Promise<ApiResponse> {
    try {
      // Normalize email and pre-check duplicates
      const emailLower = (data.email || '').toLowerCase();
      const existingProvider = await UserModel.getAuthProviderByEmail(emailLower);
      if (existingProvider) {
        return {
          success: false,
          message:
            existingProvider === 'google'
              ? 'هذا البريد مسجّل عبر Google، الرجاء تسجيل الدخول باستخدام Google'
              : 'البريد الإلكتروني مستخدم مسبقاً',
          errors: [
            existingProvider === 'google'
              ? 'Email already registered via Google'
              : 'Email already exists',
          ],
        };
      }

      // Create student
      const studentData: Partial<User> = {
        name: data.name,
        email: emailLower,
        password: data.password,
        userType: UserType.STUDENT,
        status: UserStatus.PENDING,
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
      if (data.formattedAddress)
        studentData.formattedAddress = data.formattedAddress;
      if (data.country) studentData.country = data.country;
      if (data.city) studentData.city = data.city;
      if (data.state) studentData.state = data.state;
      if (data.zipcode) studentData.zipcode = data.zipcode;
      if (data.streetName) studentData.streetName = data.streetName;
      if (data.suburb) studentData.suburb = data.suburb;
      if (data.locationConfidence !== undefined)
        studentData.locationConfidence = data.locationConfidence;

      // Get location details using geocoding service if coordinates provided but no address details
      if (data.latitude && data.longitude && !data.formattedAddress) {
        try {
          const geocodingService = new GeocodingService();
          const locationDetails = await geocodingService.getLocationDetails(
            data.latitude,
            data.longitude
          );

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
          studyYear: data.studyYear,
        });
      } catch (error) {
        console.error('Error creating student grade relationship:', error);
        // Continue with registration even if grade relationship fails
      }

      // Get verification code from database
      const verificationCode = await UserModel.getVerificationCode(emailLower);

      // Send verification email
      const emailSent = await sendVerificationEmail(
        data.email,
        verificationCode || '',
        data.name
      );

      if (!emailSent) {
        return {
          success: false,
          message: 'فشل في إرسال البريد الإلكتروني',
          errors: ['فشل في إرسال البريد الإلكتروني'],
        };
      }

      return {
        success: true,
        message: 'تم تسجيل الطالب بنجاح',
        data: {
          user: this.sanitizeUser(student),
        },
      };
    } catch (error: any) {
      console.error('Error registering student:', error);
      if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
        return {
          success: false,
          message: 'البريد الإلكتروني مستخدم مسبقاً',
          errors: ['Email already exists'],
        };
      }
      return {
        success: false,
        message: 'فشل في العملية',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'بيانات الدخول غير صحيحة',
          errors: ['بيانات الدخول غير صحيحة'],
        };
      }

      // Check if user is active
      if (user.status !== UserStatus.ACTIVE) {
        return {
          success: false,
          message: 'الحساب غير مفعل',
          errors: [
            'الحساب غير مفعل، يرجى التحقق من بريدك الإلكتروني أو التواصل مع الدعم',
          ],
        };
      }

      if (user.authProvider && user.authProvider !== 'email') {
        return {
          success: false,
          message:
            'قمت بإنشاء الحساب باستخدام مزود خارجي الرجاء تسجيل الدخول بنفس الطريقة',
          errors: [
            'قمت بإنشاء الحساب باستخدام مزود خارجي الرجاء تسجيل الدخول بنفس الطريقة',
          ],
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        data.password,
        user.password
      );
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'بيانات الدخول غير صحيحة',
          errors: ['بيانات الدخول غير صحيحة'],
        };
      }

      // Check if profile is complete
      const isProfileComplete = this.isProfileComplete(user);

      // Get active academic year
      const academicYearResponse = await AcademicYearService.getActive();
      const activeAcademicYear = academicYearResponse.success
        ? academicYearResponse.data?.academicYear
        : null;

      // Get enhanced user data
      const enhancedUser = await this.getEnhancedUserData(user);

      // Ensure teacher QR exists (once) for teachers
      try {
        if (user.userType === UserType.TEACHER) {
          await QrService.ensureTeacherQr(user.id);
        }
      } catch (e) {
        console.error('Auto-ensure teacher QR on login failed:', e);
      }

      // حدد سياسة انتهاء الصلاحية حسب نوع المستخدم
      const now = new Date();
      let expiresAt: Date;
      let expiresInSeconds: number;
      if (user.userType === UserType.TEACHER) {
        // المعلّم: انتهاء عند الساعة 4 صباحاً لليوم التالي
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(4, 0, 0, 0);
        expiresAt = tomorrow;
        expiresInSeconds = Math.max(60, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      } else {
        // الطالب: مدة أطول (افتراضياً 7 أيام) ويمكن ضبطها عبر ENV
        const days = parseInt(process.env['STUDENT_TOKEN_TTL_DAYS'] || '7', 10);
        expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        expiresInSeconds = days * 24 * 60 * 60;
      }

      // إنشاء التوكن وفق مدة الصلاحية المحددة
      const token = await this.generateToken(user, expiresInSeconds);

      // ✅ خزّن التوكن والـ Player ID مع الجلسة مرة واحدة
      await TokenModel.create(user.id, token, expiresAt, data.oneSignalPlayerId);

      return {
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        data: {
          user: {
            ...enhancedUser,
            studyYear: activeAcademicYear?.year,
          },
          token,
          isProfileComplete,
          requiresProfileCompletion: !isProfileComplete,
          activeAcademicYear,
        },
      };
    } catch (error) {
      console.error('Error during login:', error);
      return {
        success: false,
        message: 'فشل في المصادقة',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'التوكن غير صحيح',
          errors: ['التوكن غير موجود أو منتهي الصلاحية'],
        };
      }

      return {
        success: true,
        message: 'تم تسجيل الخروج بنجاح',
      };
    } catch (error) {
      console.error('Error during logout:', error);
      return {
        success: false,
        message: 'فشل في المصادقة',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'فشل في التحقق من البريد الإلكتروني',
          errors: ['انتهت صلاحية الرمز'],
        };
      }

      // If teacher, ensure QR exists now that account is active
      try {
        const u = await UserModel.findByEmail(email);
        if (u && u.userType === UserType.TEACHER) {
          await QrService.ensureTeacherQr(u.id);
        }
      } catch (e) {
        console.error('Auto-ensure teacher QR on verifyEmail failed:', e);
      }

      return {
        success: true,
        message: 'تم التحقق من البريد الإلكتروني بنجاح',
      };
    } catch (error) {
      console.error('Error verifying email:', error);
      return {
        success: false,
        message: 'فشل في التحقق من البريد الإلكتروني',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'فشل في التحقق من البريد الإلكتروني',
          errors: ['البريد الإلكتروني غير محقق'],
        };
      }

      // Get updated user to get new verification code
      const updatedUser = await UserModel.findByEmail(email);
      if (updatedUser) {
        const verificationCode = await UserModel.getVerificationCode(email);
        await sendVerificationEmail(
          email,
          verificationCode || '',
          updatedUser.name
        );
      }

      return {
        success: true,
        message: 'تم إرسال رمز التحقق بنجاح',
      };
    } catch (error) {
      console.error('Error resending verification code:', error);
      return {
        success: false,
        message: 'فشل في التحقق من البريد الإلكتروني',
        errors: ['حدث خطأ في الخادم'],
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
          message: 'المستخدم غير موجود',
          errors: ['المستخدم غير موجود'],
        };
      }

      const user = await UserModel.findByEmail(email);
      if (user) {
        const emailSent = await sendPasswordResetEmail(
          email,
          resetCode,
          user.name
        );

        if (!emailSent) {
          return {
            success: false,
            message: 'فشل في إرسال البريد الإلكتروني',
            errors: ['فشل في إرسال البريد الإلكتروني'],
          };
        }
      }

      return {
        success: true,
        message: 'تم إرسال رمز إعادة تعيين كلمة المرور بنجاح',
      };
    } catch (error) {
      console.error('Error requesting password reset:', error);
      return {
        success: false,
        message: 'فشل في إعادة تعيين كلمة المرور',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Reset password
  static async resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<ApiResponse> {
    try {
      const reset = await UserModel.resetPassword(email, code, newPassword);

      if (!reset) {
        return {
          success: false,
          message: 'رمز إعادة التعيين غير صحيح أو منتهي الصلاحية',
          errors: ['رمز إعادة التعيين غير صحيح أو منتهي الصلاحية'],
        };
      }

      return {
        success: true,
        message: 'تم إعادة تعيين كلمة المرور بنجاح',
      };
    } catch (error) {
      console.error('Error resetting password:', error);
      return {
        success: false,
        message: 'فشل في إعادة تعيين كلمة المرور',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Generate JWT token (without saving to DB)
  private static async generateToken(user: User, expiresInSeconds: number): Promise<string> {
    const payload = {
      userId: user.id,
      email: user.email,
      userType: user.userType,
    };

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error('مفتاح JWT غير مُعد');
    }

    const token = jwt.sign(payload, secret, { expiresIn: expiresInSeconds } as jwt.SignOptions);
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
  static async googleAuth(
    googleData: any,
    userType: 'teacher' | 'student'
  ): Promise<ApiResponse> {
    try {
      const { email, name, sub } = googleData;

      // Check if user already exists
      const existingUser = await UserModel.findByEmail(email);

      if (existingUser) {
        if (existingUser.authProvider !== 'google') {
          return {
            success: false,
            message:
              'قمت بانشاء الحساب باستخدام البريد وكلمة المرور الرجاء تسجيل الدخول بنفس الطريقة',
            errors: [
              'قمت بانشاء الحساب باستخدام البريد وكلمة المرور الرجاء تسجيل الدخول بنفس الطريقة',
            ],
          };
        }

        // User exists, check if user type matches
        if (
          existingUser.userType !==
          (userType === 'teacher' ? UserType.TEACHER : UserType.STUDENT)
        ) {
          return {
            success: false,
            message: 'نوع المستخدم لا يتطابق مع الحساب الموجود',
            errors: ['User type mismatch with existing account'],
          };
        }

        // Check if profile is complete
        const isProfileComplete = this.isProfileComplete(existingUser);

        // Get active academic year
        const academicYearResponse = await AcademicYearService.getActive();
        const activeAcademicYear = academicYearResponse.success
          ? academicYearResponse.data?.academicYear
          : null;

        // Get enhanced user data
        const enhancedUser = await this.getEnhancedUserData(existingUser);

        // Ensure teacher QR exists (once)
        try {
          if (existingUser.userType === UserType.TEACHER) {
            await QrService.ensureTeacherQr(existingUser.id);
          }
        } catch (e) {
          console.error(
            'Auto-ensure teacher QR (google existing user) failed:',
            e
          );
        }

        // Generate JWT token for existing user
        const token = jwt.sign(
          {
            userId: existingUser.id,
            userType: existingUser.userType,
            email: existingUser.email,
          },
          process.env['JWT_SECRET'] || 'fallback-secret',
          { expiresIn: '7d' }
        );

        // Store token in database
        await TokenModel.create(
          existingUser.id,
          token,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          googleData.oneSignalPlayerId
        );

        return {
          success: true,
          message: 'تم تسجيل الدخول بنجاح',
          data: {
            user: {
              ...enhancedUser,
              studyYear: activeAcademicYear?.year,
            },
            token,
            isNewUser: false,
            isProfileComplete,
            requiresProfileCompletion: !isProfileComplete,
            activeAcademicYear: activeAcademicYear,
          },
        };
      }

      // User doesn't exist, create new user
      const tempPassword = `google_${sub}_${Date.now()}`; // Temporary password
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      let newUser: User;

      if (userType === 'teacher') {
        newUser = await UserModel.create({
          name,
          email,
          password: hashedPassword,
          userType: UserType.TEACHER,
          status: UserStatus.ACTIVE,

          // ✅ بيانات مزود الخدمة
          authProvider: 'google',
          oauthProviderId: sub,

          // باقي الحقول
          phone: '',
          address: '',
          bio: '',
          experienceYears: 0,
          deviceInfo: 'Google OAuth',
        });

        // ✅ إنشاء اشتراك مجاني تلقائيًا للمعلم الجديد عبر Google
        try {
          const freePackage = await SubscriptionPackageModel.getFreePackage();
          if (freePackage) {
            const startDate = new Date();
            const endDate = new Date(startDate);
            endDate.setDate(
              endDate.getDate() + Number(freePackage.durationDays || 30)
            );

            await TeacherSubscriptionModel.create({
              teacherId: newUser.id,
              subscriptionPackageId: freePackage.id,
              startDate,
              endDate,
            });
          } else {
            console.warn(
              'No free subscription package found (Google). Skipping auto-subscription.'
            );
          }
        } catch (subErr) {
          console.error(
            'Failed to auto-create free subscription for Google teacher:',
            subErr
          );
        }

        // ✅ توليد QR للمعلم الجديد عبر Google
        try {
          await QrService.ensureTeacherQr(newUser.id);
        } catch (e) {
          console.error(
            'Auto-ensure teacher QR (google new teacher) failed:',
            e
          );
        }
      } else {
        newUser = await UserModel.create({
          name,
          email,
          password: hashedPassword,
          userType: UserType.STUDENT,
          status: UserStatus.ACTIVE,

          // ✅ بيانات مزود الخدمة
          authProvider: 'google',
          oauthProviderId: sub,

          studentPhone: '',
          parentPhone: '',
          schoolName: '',
        });
      }

      // Get active academic year
      const academicYearResponse = await AcademicYearService.getActive();
      const activeAcademicYear = academicYearResponse.success
        ? academicYearResponse.data?.academicYear
        : null;

      // Get enhanced user data
      const enhancedUser = await this.getEnhancedUserData(newUser);

      // Generate JWT token for new user
      const token = jwt.sign(
        {
          userId: newUser.id,
          userType: newUser.userType,
          email: newUser.email,
        },
        process.env['JWT_SECRET'] || 'fallback-secret',
        { expiresIn: '7d' }
      );

      // Store token in database
      await TokenModel.create(
        newUser.id,
        token,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        googleData.oneSignalPlayerId
      );

      return {
        success: true,
        message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح',
        data: {
          user: {
            ...enhancedUser,
            studyYear: activeAcademicYear?.year,
          },
          token,
          isNewUser: true,
          isProfileComplete: false,
          requiresProfileCompletion: true,
          activeAcademicYear: activeAcademicYear,
        },
      };
    } catch (error) {
      console.error('Error in googleAuth service:', error);
      return {
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Complete profile for Google OAuth users
  static async completeProfile(
    userId: string,
    userType: string,
    profileData: any
  ): Promise<ApiResponse> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        return {
          success: false,
          message: 'المستخدم غير موجود',
          errors: ['User not found'],
        };
      }

      // Extract location data
      const {
        latitude,
        longitude,
        address,
        formattedAddress,
        country,
        city,
        state,
        zipcode,
        streetName,
        suburb,
        locationConfidence,
      } = profileData;

      // Get location details from coordinates using GeocodingService
      let locationDetails = null;
      if (latitude && longitude) {
        try {
          const geocodingService = new GeocodingService();
          locationDetails = await geocodingService.getLocationDetails(
            latitude,
            longitude
          );
        } catch (error) {
          console.error('Error getting location details:', error);
        }
      }

      // Prepare user update data with location information
      const updateData: any = {
        latitude: Number(latitude),
        longitude: Number(longitude),
      };

      if (locationDetails) {
        updateData.formatted_address = locationDetails.formattedAddress;
        updateData.country = locationDetails.country;
        updateData.city = locationDetails.city;
        updateData.state = locationDetails.state;
        updateData.zipcode = locationDetails.zipcode;
        updateData.street_name = locationDetails.streetName;
        updateData.suburb = locationDetails.suburb;
        updateData.location_confidence = locationDetails.confidence;
        updateData.address = address || locationDetails.formattedAddress;
      } else {
        if (formattedAddress) updateData.formatted_address = formattedAddress;
        if (country) updateData.country = country;
        if (city) updateData.city = city;
        if (state) updateData.state = state;
        if (zipcode) updateData.zipcode = zipcode;
        if (streetName) updateData.street_name = streetName;
        if (suburb) updateData.suburb = suburb;
        if (locationConfidence !== undefined)
          updateData.location_confidence = Number(locationConfidence);
        if (address) updateData.address = address;
      }

      // Handle profile avatar if provided (base64): delete old file then save new
      try {
        const profileImageBase64 = profileData?.profileImageBase64 as
          | string
          | undefined;
        if (
          profileImageBase64 &&
          profileImageBase64.startsWith('data:image/')
        ) {
          // delete old avatar if exists
          try {
            const existing = await UserModel.findById(userId);
            const oldPath =
              (existing as any)?.profileImagePath ||
              (existing as any)?.profile_image_path;
            if (oldPath) await ImageService.deleteUserAvatar(oldPath);
          } catch (delErr) {
            console.warn('Could not delete old user avatar:', delErr);
          }
          const savedPath = await ImageService.saveUserAvatar(
            profileImageBase64,
            `avatar_${user.id}`
          );
          updateData.profile_image_path = savedPath;
        }
      } catch (e) {
        console.error('Failed to process profile avatar (completeProfile):', e);
      }

      // 👇 هنا الجزء الخاص بالمعلم
      if (userType === 'teacher') {
        const {
          name,
          phone,
          address,
          bio,
          experienceYears,
          gradeIds,
          studyYear,
          gender,
          birthDate,
        } = profileData;

        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;
        if (address) updateData.address = address;
        if (bio) updateData.bio = bio;
        if (experienceYears !== undefined && experienceYears !== null) {
          const exp = Number(experienceYears);
          if (!Number.isNaN(exp)) updateData.experience_years = exp;
        }
        if (gender) updateData.gender = gender;
        if (birthDate) updateData.birth_date = birthDate;

        // Update teacher profile
        const updatedUser = await UserModel.update(userId, updateData);

        // Create/replace teacher grade relationships if provided
        if (Array.isArray(gradeIds) && gradeIds.length > 0 && studyYear) {
          try {
            await TeacherGradeModel.createMany(userId, gradeIds, studyYear);
          } catch (error) {
            console.error(
              'Error creating teacher grade relationships (completeProfile):',
              error
            );
          }
        }

        const isProfileComplete = updatedUser
          ? this.isProfileComplete(updatedUser)
          : false;
        const enhancedUser = updatedUser
          ? await this.getEnhancedUserData(updatedUser)
          : null;

        return {
          success: true,
          message: 'تم تحديث الملف الشخصي بنجاح',
          data: {
            user: enhancedUser,
            isProfileComplete,
            requiresProfileCompletion: !isProfileComplete,
            locationDetails: locationDetails,
          },
        };
      }

      // 👇 هنا الجزء الخاص بالطالب فقط
      if (userType === 'student') {
        const {
          name,
          gradeId,
          studyYear,
          studentPhone,
          parentPhone,
          schoolName,
          gender,
          birthDate,
        } = profileData;

        // Add student-specific data
        if (name) updateData.name = name;
        if (studentPhone) updateData.student_phone = studentPhone;
        if (parentPhone) updateData.parent_phone = parentPhone;
        if (schoolName) updateData.school_name = schoolName;
        if (gender) updateData.gender = gender;
        if (birthDate) updateData.birth_date = birthDate;

        // Update student profile
        const updatedUser = await UserModel.update(userId, updateData);

        // UPSERT student grade
        await StudentGradeModel.create({
          studentId: userId,
          gradeId,
          studyYear,
        });

        const isProfileComplete = updatedUser
          ? this.isProfileComplete(updatedUser)
          : false;
        const enhancedUser = updatedUser
          ? await this.getEnhancedUserData(updatedUser)
          : null;

        return {
          success: true,
          message: 'تم تحديث الملف الشخصي بنجاح',
          data: {
            user: enhancedUser,
            isProfileComplete,
            requiresProfileCompletion: !isProfileComplete,
            locationDetails: locationDetails,
          },
        };
      }

      return {
        success: false,
        message: 'نوع المستخدم غير صحيح',
        errors: ['Invalid user type'],
      };
    } catch (error) {
      console.error('Error in completeProfile service:', error);
      return {
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }

  // Sanitize user data (remove sensitive information)
  private static sanitizeUser(user: User): Partial<User> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }

  // Get enhanced user data with additional information
  private static async getEnhancedUserData(user: User): Promise<any> {
    const sanitizedUser = this.sanitizeUser(user);

    // If user is a teacher, add teacher-specific data
    if (user.userType === 'teacher') {
      try {
        // Get teacher grades
        const teacherGrades = await TeacherGradeModel.findByTeacherId(user.id);

        // Get grade details for each teacher grade
        const gradesWithDetails = await Promise.all(
          teacherGrades.map(async teacherGrade => {
            const grade = await GradeModel.findById(teacherGrade.gradeId);
            return {
              id: teacherGrade.id,
              gradeId: teacherGrade.gradeId,
              gradeName: grade?.name || 'Unknown Grade',
              studyYear: teacherGrade.studyYear,
              createdAt: teacherGrade.createdAt,
            };
          })
        );

        // Ensure and include QR info
        let qr: string | null = null;
        try {
          const qrInfo = await QrService.ensureTeacherQr(user.id);
          qr = qrInfo.publicUrl;
        } catch (e) {
          console.error('Error ensuring teacher QR (enhanced):', e);
        }

        return {
          ...sanitizedUser,
          teacherGrades: gradesWithDetails,
          qr,
          // Include location data if available
          location: {
            latitude: user.latitude,
            longitude: user.longitude,
            address: user.address,
            formattedAddress: user.formattedAddress,
            country: user.country,
            city: user.city,
            state: user.state,
            zipcode: user.zipcode,
            streetName: user.streetName,
            suburb: user.suburb,
            locationConfidence: user.locationConfidence,
          },
        };
      } catch (error) {
        console.error('Error getting enhanced teacher data:', error);
        // Return basic user data if there's an error
        return {
          ...sanitizedUser,
          teacherGrades: [],
          location: {
            latitude: user.latitude,
            longitude: user.longitude,
            address: user.address,
            formattedAddress: user.formattedAddress,
            country: user.country,
            city: user.city,
            state: user.state,
            zipcode: user.zipcode,
            streetName: user.streetName,
            suburb: user.suburb,
            locationConfidence: user.locationConfidence,
          },
        };
      }
    }

    // If user is a student, add student-specific data (current study year grades)
    if (user.userType === 'student') {
      try {
        // Get active academic year
        const academicYearResponse = await AcademicYearService.getActive();
        const activeAcademicYear = academicYearResponse.success
          ? academicYearResponse.data?.academicYear
          : null;

        // Fetch student grades
        const studentGrades = await StudentGradeModel.findByStudentId(user.id);
        const filteredGrades = activeAcademicYear
          ? studentGrades.filter(sg => sg.studyYear === activeAcademicYear.year)
          : studentGrades;

        // Include grade details
        const gradesWithDetails = await Promise.all(
          filteredGrades.map(async sg => {
            const grade = await GradeModel.findById(sg.gradeId);
            return {
              id: sg.id,
              gradeId: sg.gradeId,
              gradeName: grade?.name || 'Unknown Grade',
              studyYear: sg.studyYear,
              createdAt: sg.createdAt,
            };
          })
        );

        return {
          ...sanitizedUser,
          studentGrades: gradesWithDetails,
          location: {
            latitude: (user as any).latitude,
            longitude: (user as any).longitude,
            address: (user as any).address,
            formattedAddress: (user as any).formattedAddress,
            country: (user as any).country,
            city: (user as any).city,
            state: (user as any).state,
            zipcode: (user as any).zipcode,
            streetName: (user as any).streetName,
            suburb: (user as any).suburb,
            locationConfidence: (user as any).locationConfidence,
          },
        };
      } catch (error) {
        console.error('Error getting enhanced student data:', error);
        return {
          ...sanitizedUser,
          studentGrades: [],
          location: {
            latitude: (user as any).latitude,
            longitude: (user as any).longitude,
            address: (user as any).address,
            formattedAddress: (user as any).formattedAddress,
            country: (user as any).country,
            city: (user as any).city,
            state: (user as any).state,
            zipcode: (user as any).zipcode,
            streetName: (user as any).streetName,
            suburb: (user as any).suburb,
            locationConfidence: (user as any).locationConfidence,
          },
        };
      }
    }

    // For others, return basic data with location
    return {
      ...sanitizedUser,
      location: {
        latitude: (user as any).latitude,
        longitude: (user as any).longitude,
        address: (user as any).address,
        formattedAddress: (user as any).formattedAddress,
        country: (user as any).country,
        city: (user as any).city,
        state: (user as any).state,
        zipcode: (user as any).zipcode,
        streetName: (user as any).streetName,
        suburb: (user as any).suburb,
        locationConfidence: (user as any).locationConfidence,
      },
    };
  }

  static async updateProfile(
    userId: string,
    userType: string,
    profileData: any
  ): Promise<any> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        return {
          success: false,
          message: 'المستخدم غير موجود',
          errors: ['المستخدم غير موجود'],
        };
      }

      // ✅ تحديد الحقول المسموح بها حسب الدور
      let allowedFields: string[];
      if (userType === 'teacher') {
        allowedFields = [
          'name',
          'phone',
          'bio',
          'experience_years',
          'latitude',
          'longitude',
          'address',
          'formatted_address',
          'country',
          'city',
          'state',
          'zipcode',
          'street_name',
          'suburb',
          'location_confidence',
        ];
      } else if (userType === 'student') {
        allowedFields = [
          'name',
          'student_phone',
          'parent_phone',
          'school_name',
          'gender',
          'birth_date',
          'address',
          'latitude',
          'longitude',
          'formatted_address',
          'country',
          'city',
          'state',
          'zipcode',
          'street_name',
          'suburb',
          'location_confidence',
        ];
      } else {
        return {
          success: false,
          message: 'نوع المستخدم غير مدعوم',
          errors: ['نوع المستخدم غير مدعوم'],
        };
      }

      // ✅ فلترة البيانات حسب الدور
      const filteredData: Record<string, any> = {};
      for (const [key, value] of Object.entries(profileData)) {
        if (allowedFields.includes(key)) {
          filteredData[key] = value;
        }
      }

      // ✅ دعم الحقول بصيغة camelCase القادمة من العميل عبر تحويلها إلى snake_case المتوقعة من الـ Model
      const camelToSnakeMap: Record<string, string> = {
        formattedAddress: 'formatted_address',
        streetName: 'street_name',
        locationConfidence: 'location_confidence',
        birthDate: 'birth_date',
        parentPhone: 'parent_phone',
        studentPhone: 'student_phone',
        schoolName: 'school_name',
      };
      for (const [camel, snake] of Object.entries(camelToSnakeMap)) {
        if (profileData[camel] !== undefined && allowedFields.includes(snake)) {
          filteredData[snake] = profileData[camel];
        }
      }

      // ✅ إذا تم إرسال lat/lng ولم تُرسل تفاصيل العنوان، نجري Geocoding لملء الحقول
      const hasLat =
        profileData.latitude !== undefined && profileData.latitude !== null;
      const hasLng =
        profileData.longitude !== undefined && profileData.longitude !== null;
      const hasAnyAddressField =
        profileData.formatted_address !== undefined ||
        profileData.formattedAddress !== undefined ||
        profileData.country !== undefined ||
        profileData.city !== undefined ||
        profileData.state !== undefined ||
        profileData.zipcode !== undefined ||
        profileData.street_name !== undefined ||
        profileData.streetName !== undefined ||
        profileData.suburb !== undefined ||
        profileData.location_confidence !== undefined ||
        profileData.locationConfidence !== undefined ||
        profileData.address !== undefined;

      if (hasLat && hasLng && !hasAnyAddressField) {
        try {
          const geocodingService = new GeocodingService();
          const latNum = Number(profileData.latitude);
          const lngNum = Number(profileData.longitude);
          const details = await geocodingService.getLocationDetails(
            latNum,
            lngNum
          );
          if (details) {
            filteredData['formatted_address'] = details.formattedAddress;
            filteredData['country'] = details.country;
            filteredData['city'] = details.city;
            filteredData['state'] = details.state;
            filteredData['zipcode'] = details.zipcode;
            filteredData['street_name'] = details.streetName;
            filteredData['suburb'] = details.suburb;
            filteredData['location_confidence'] = details.confidence;
            // العنوان النصي: إن وُجد في الطلب نفضّله، وإلا نضع formattedAddress
            if (profileData.address !== undefined) {
              filteredData['address'] = profileData.address;
            } else if (details.formattedAddress) {
              filteredData['address'] = details.formattedAddress;
            }
          }
        } catch (geoErr) {
          console.error('Geocoding on updateProfile failed:', geoErr);
        }
      }

      // ✅ معالجة صورة الملف الشخصي (base64) إن وُجدت ضمن نفس الطلب
      try {
        const raw = profileData?.profileImageBase64 as string | undefined;
        if (raw) {
          // بعض العملاء يرسلون Base64 بدون بادئة data: → نطبّعها كصورة jpeg افتراضياً
          const base64 = raw.startsWith('data:image/')
            ? raw
            : `data:image/jpeg;base64,${raw}`;

          // احذف الصورة القديمة إن وُجدت
          const oldPath =
            (user as any)?.profileImagePath ||
            (user as any)?.profile_image_path;
          if (oldPath) {
            try {
              await ImageService.deleteUserAvatar(oldPath);
            } catch (delErr) {
              console.warn('delete avatar (updateProfile):', delErr);
            }
          }

          // احفظ الصورة الجديدة ومرّر المسار لقاعدة البيانات
          const savedPath = await ImageService.saveUserAvatar(
            base64,
            `avatar_${user.id}`
          );
          filteredData['profile_image_path'] = savedPath;
        }
      } catch (imgErr) {
        console.error(
          'Failed processing profile avatar (updateProfile):',
          imgErr
        );
      }

      const updatedUser = await UserModel.update(userId, filteredData);
      if (!updatedUser) {
        return {
          success: false,
          message: 'فشل في تحديث بيانات المستخدم',
          errors: ['فشل في تحديث بيانات المستخدم'],
        };
      }

      return {
        success: true,
        message: 'تم تحديث البيانات بنجاح',
        data: { user: updatedUser },
      };
    } catch (error) {
      console.error('Error in updateProfile service:', error);
      return {
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      };
    }
  }
}

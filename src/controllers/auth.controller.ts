import { AuthService } from '@/services/auth.service';
import { GoogleAuthService } from '@/services/google-auth.service';
import { SubscriptionPackageService } from '@/services/super_admin/subscription-package.service';
import { TeacherSubscriptionService } from '@/services/teacher-subscription.service';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

export class AuthController {
  // Register super admin
  static async registerSuperAdmin(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { name, email, password } = req.body;
      const result = await AuthService.registerSuperAdmin({ name, email, password });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in registerSuperAdmin controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Register teacher
  static async registerTeacher(req: Request, res: Response): Promise<void> {
    try {
      // 1) Validation (كما هو عندك)
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password')
          .isLength({ min: 8 }).withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY')).run(req),
        body('phone').notEmpty().withMessage(getMessage('VALIDATION.PHONE_REQUIRED')).run(req),
        body('address').notEmpty().withMessage(getMessage('VALIDATION.ADDRESS_REQUIRED')).run(req),
        body('bio').notEmpty().withMessage(getMessage('VALIDATION.BIO_REQUIRED')).run(req),
        body('experienceYears').isInt({ min: 0 }).withMessage(getMessage('VALIDATION.EXPERIENCE_YEARS_REQUIRED')).run(req),
        body('gradeIds').isArray({ min: 1 }).withMessage(getMessage('STUDENT.GRADE_ID_REQUIRED')).run(req),
        body('gradeIds.*').isUUID().withMessage(getMessage('STUDENT.GRADE_NOT_FOUND')).run(req),
        body('studyYear').notEmpty().withMessage(getMessage('STUDENT.STUDY_YEAR_REQUIRED'))
          .matches(/^[0-9]{4}-[0-9]{4}$/).withMessage(getMessage('STUDENT.INVALID_STUDY_YEAR_FORMAT')).run(req),
        body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage(getMessage('VALIDATION.INVALID_LATITUDE')).run(req),
        body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage(getMessage('VALIDATION.INVALID_LONGITUDE')).run(req),
        body('formattedAddress').optional().isLength({ max: 1000 }).withMessage(getMessage('VALIDATION.ADDRESS_TOO_LONG')).run(req),
        body('country').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.COUNTRY_TOO_LONG')).run(req),
        body('city').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.CITY_TOO_LONG')).run(req),
        body('state').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.STATE_TOO_LONG')).run(req),
        body('zipcode').optional().isLength({ max: 20 }).withMessage(getMessage('VALIDATION.ZIPCODE_TOO_LONG')).run(req),
        body('streetName').optional().isLength({ max: 255 }).withMessage(getMessage('VALIDATION.STREET_NAME_TOO_LONG')).run(req),
        body('suburb').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.SUBURB_TOO_LONG')).run(req),
        body('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage(getMessage('VALIDATION.INVALID_LOCATION_CONFIDENCE')).run(req),
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(e => e.msg),
        });
        return;
      }

      // 2) Build teacher data
      const {
        name, email, password, phone, address, bio, experienceYears,
        visitorId, deviceInfo, gradeIds, studyYear,
        latitude, longitude, formattedAddress, country, city, state, zipcode, streetName, suburb, locationConfidence,
      } = req.body;

      const teacherData: any = {
        name, email, password, phone, address, bio, experienceYears,
        visitorId, deviceInfo, gradeIds, studyYear,
      };
      if (latitude) teacherData.latitude = Number(latitude);
      if (longitude) teacherData.longitude = Number(longitude);
      if (formattedAddress) teacherData.formattedAddress = formattedAddress;
      if (country) teacherData.country = country;
      if (city) teacherData.city = city;
      if (state) teacherData.state = state;
      if (zipcode) teacherData.zipcode = zipcode;
      if (streetName) teacherData.streetName = streetName;
      if (suburb) teacherData.suburb = suburb;
      if (locationConfidence !== undefined) teacherData.locationConfidence = Number(locationConfidence);

      // 3) Register teacher (Service)
      const result = await AuthService.registerTeacher(teacherData);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      // 4) Get free package (20 طالب إن وُجد، وإن لا فأي باقة مجانية مفعّلة)
      const freePkgResp = await SubscriptionPackageService.getFreePackage(); // لو دالتك تدعم maxStudents، ضفها
      if (!freePkgResp.success || !freePkgResp.data) {
        // رجّع نجاح تسجيل المعلّم مع تحذير بفشل إنشاء الاشتراك المجاني
        res.status(201).json({
          success: true,
          message: getMessage('AUTH.REGISTERED_SUCCESSFULLY'),
          data: {
            user: result.data?.user ?? result.data, // حسب ما ترجّعه خدمتك
            subscription: null,
          },
          errors: [getMessage('SUBSCRIPTION.NO_FREE_PACKAGE')],
        });
        return;
      }

      const pkg = freePkgResp.data;
      // إن كنت تريد تقييدها بـ 20 طالب، تأكد من الشرط هنا:
      if (pkg.maxStudents !== 20 || !pkg.isFree || !pkg.isActive) {
        // إما تبحث عن واحدة بـ 20 طالب، أو تتعامل معها كتحذير
        // هنا سنكمل بها فقط إذا كانت مجانية ومفعّلة (يمكنك تشديد الشرط كما تريد)
      }

      // 5) Create teacher subscription based on package duration
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

      const teacherSubscription = await TeacherSubscriptionService.create({
        teacherId: result.data?.user?.id ?? result.data?.teacherId, // وفق بنية استجابتك
        subscriptionPackageId: pkg.id,
        startDate,
        endDate,
      });

      // 6) Return ONE response
      if (teacherSubscription.success) {
        res.status(201).json({
          success: true,
          message: getMessage('AUTH.REGISTERED_SUCCESSFULLY'),
          data: {
            user: result.data?.user ?? result.data,
            subscription: teacherSubscription.data,
          },
        });
      } else {
        // سجلّناه كمعلّم، لكن الاشتراك فشل
        res.status(201).json({
          success: true,
          message: getMessage('AUTH.REGISTERED_SUCCESSFULLY'),
          data: {
            user: result.data?.user ?? result.data,
            subscription: null,
          },
          errors: [getMessage('SUBSCRIPTION.NOT_FOUND_OR_NOT_CREATED') ?? 'Failed to create free subscription'],
        });
      }
    } catch (error) {
      console.error('Error in registerTeacher controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')],
      });
    }
  }

  // Register student
  static async registerStudent(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req),
        body('studentPhone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage(getMessage('VALIDATION.INVALID_PHONE_FORMAT')).run(req),
        body('parentPhone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage(getMessage('VALIDATION.INVALID_PARENT_PHONE_FORMAT')).run(req),
        body('schoolName').optional().isLength({ max: 255 }).withMessage(getMessage('STUDENT.SCHOOL_NAME_TOO_LONG')).run(req),
        body('gender').optional().isIn(['male', 'female']).withMessage(getMessage('VALIDATION.INVALID_GENDER')).run(req),
        body('birthDate').optional().isISO8601().withMessage(getMessage('STUDENT.INVALID_BIRTH_DATE_FORMAT')).run(req),
        body('gradeId').notEmpty().withMessage(getMessage('STUDENT.GRADE_ID_REQUIRED')).isUUID().withMessage(getMessage('STUDENT.GRADE_NOT_FOUND')).run(req),
        body('studyYear').notEmpty().withMessage(getMessage('STUDENT.STUDY_YEAR_REQUIRED')).matches(/^[0-9]{4}-[0-9]{4}$/).withMessage(getMessage('STUDENT.INVALID_STUDY_YEAR_FORMAT')).run(req),
        body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage(getMessage('VALIDATION.INVALID_LATITUDE')).run(req),
        body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage(getMessage('VALIDATION.INVALID_LONGITUDE')).run(req),
        body('formattedAddress').optional().isLength({ max: 1000 }).withMessage(getMessage('VALIDATION.ADDRESS_TOO_LONG')).run(req),
        body('country').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.COUNTRY_TOO_LONG')).run(req),
        body('city').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.CITY_TOO_LONG')).run(req),
        body('state').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.STATE_TOO_LONG')).run(req),
        body('zipcode').optional().isLength({ max: 20 }).withMessage(getMessage('VALIDATION.ZIPCODE_TOO_LONG')).run(req),
        body('streetName').optional().isLength({ max: 255 }).withMessage(getMessage('VALIDATION.STREET_NAME_TOO_LONG')).run(req),
        body('suburb').optional().isLength({ max: 100 }).withMessage(getMessage('VALIDATION.SUBURB_TOO_LONG')).run(req),
        body('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage(getMessage('VALIDATION.INVALID_LOCATION_CONFIDENCE')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const {
        name,
        email,
        password,
        studentPhone,
        parentPhone,
        schoolName,
        gender,
        birthDate,
        gradeId,
        studyYear,
        latitude,
        longitude,
        formattedAddress,
        country,
        city,
        state,
        zipcode,
        streetName,
        suburb,
        locationConfidence
      } = req.body;

      // Validate birth date if provided
      if (birthDate) {
        const birthDateObj = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const monthDiff = today.getMonth() - birthDateObj.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
          age--;
        }

        if (age < 5) {
          res.status(400).json({
            success: false,
            message: getMessage('VALIDATION.VALIDATION_FAILED'),
            errors: [getMessage('STUDENT.STUDENT_TOO_YOUNG')]
          });
          return;
        }

        if (age > 25) {
          res.status(400).json({
            success: false,
            message: getMessage('VALIDATION.VALIDATION_FAILED'),
            errors: [getMessage('STUDENT.STUDENT_TOO_OLD')]
          });
          return;
        }
      }

      const studentData: any = {
        name,
        email,
        password,
        studentPhone,
        parentPhone,
        schoolName,
        gender,
        birthDate,
        gradeId,
        studyYear
      };

      if (latitude) studentData.latitude = Number(latitude);
      if (longitude) studentData.longitude = Number(longitude);
      if (formattedAddress) studentData.formattedAddress = formattedAddress;
      if (country) studentData.country = country;
      if (city) studentData.city = city;
      if (state) studentData.state = state;
      if (zipcode) studentData.zipcode = zipcode;
      if (streetName) studentData.streetName = streetName;
      if (suburb) studentData.suburb = suburb;
      if (locationConfidence !== undefined) studentData.locationConfidence = Number(locationConfidence);

      const result = await AuthService.registerStudent(studentData);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in registerStudent controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Login user
  static async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password').notEmpty().withMessage(getMessage('VALIDATION.PASSWORD_REQUIRED')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email, password } = req.body;
      const result = await AuthService.login({ email, password });

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      console.error('Error in login controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Logout user
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(400).json({
          success: false,
          message: getMessage('AUTH.TOKEN_REQUIRED'),
          errors: [getMessage('AUTH.NO_TOKEN_PROVIDED')]
        });
        return;
      }

      const result = await AuthService.logout(token);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in logout controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Verify email
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('code').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.VERIFICATION_CODE_6_DIGITS')).run(req),
        body('verificationToken').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.VERIFICATION_CODE_6_DIGITS')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email, code, verificationToken } = req.body;

      // Use either 'code' or 'verificationToken', with 'code' taking precedence
      const verificationCode = code || verificationToken;

      if (!verificationCode) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: [getMessage('VALIDATION.VERIFICATION_CODE_REQUIRED')]
        });
        return;
      }

      const result = await AuthService.verifyEmail(email, verificationCode);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in verifyEmail controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Resend verification code
  static async resendVerificationCode(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email } = req.body;
      const result = await AuthService.resendVerificationCode(email);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in resendVerificationCode controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Request password reset
  static async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email } = req.body;
      const result = await AuthService.requestPasswordReset(email);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in requestPasswordReset controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Google OAuth authentication
  static async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('googleToken').optional().isString().withMessage('Google token must be a string').run(req),
        body('googleData').optional().isObject().withMessage('Google data is required').run(req),
        body('userType').isIn(['teacher', 'student']).withMessage('User type must be teacher or student').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { googleToken, googleData, userType } = req.body;

      let verifiedGoogleData;

      // Method 1: Verify Google JWT token (recommended)
      if (googleToken) {
        const verification = await GoogleAuthService.verifyGoogleToken(googleToken);

        if (!verification.success) {
          res.status(400).json({
            success: false,
            message: 'فشل في التحقق من بيانات Google',
            errors: [verification.error || 'Invalid Google token']
          });
          return;
        }

        verifiedGoogleData = verification.data;
      }
      // Method 2: Validate provided Google data (fallback)
      else if (googleData) {
        const validation = await GoogleAuthService.verifyGoogleDataWithSecurity(googleData);

        if (!validation.success) {
          res.status(400).json({
            success: false,
            message: 'بيانات Google غير صحيحة',
            errors: validation.errors
          });
          return;
        }

        verifiedGoogleData = validation.data;
      }
      else {
        res.status(400).json({
          success: false,
          message: 'مطلوب إما Google token أو Google data',
          errors: ['Either googleToken or googleData is required']
        });
        return;
      }

      // Validate required fields
      if (!verifiedGoogleData.email || !verifiedGoogleData.name || !verifiedGoogleData.sub) {
        res.status(400).json({
          success: false,
          message: 'بيانات Google ناقصة',
          errors: ['Missing required Google data fields']
        });
        return;
      }

      const result = await AuthService.googleAuth(verifiedGoogleData, userType);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in googleAuth controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Complete profile for Google OAuth users
  static async completeProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const userType = req.user?.userType;
      if (!userType) {
        res.status(401).json({ error: 'User type not found' });
        return;
      }

      // Validate based on user type
      if (userType === 'teacher') {
        await Promise.all([
          body('phone').notEmpty().withMessage(getMessage('VALIDATION.PHONE_REQUIRED')).run(req),
          body('address').notEmpty().withMessage(getMessage('VALIDATION.ADDRESS_REQUIRED')).run(req),
          body('bio').notEmpty().withMessage(getMessage('VALIDATION.BIO_REQUIRED')).run(req),
          body('experienceYears').isInt({ min: 0 }).withMessage(getMessage('VALIDATION.EXPERIENCE_YEARS_REQUIRED')).run(req),
          body('gradeIds').isArray({ min: 1 }).withMessage(getMessage('STUDENT.GRADE_ID_REQUIRED')).run(req),
          body('studyYear').notEmpty().withMessage(getMessage('STUDENT.STUDY_YEAR_REQUIRED')).run(req)
        ]);
      } else if (userType === 'student') {
        await Promise.all([
          body('gradeId').notEmpty().withMessage(getMessage('STUDENT.GRADE_ID_REQUIRED')).run(req),
          body('studyYear').notEmpty().withMessage(getMessage('STUDENT.STUDY_YEAR_REQUIRED')).run(req)
        ]);
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const result = await AuthService.completeProfile(userId, userType, req.body);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in completeProfile controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Reset password
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('code').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.RESET_CODE_6_DIGITS')).run(req),
        body('resetToken').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.RESET_CODE_6_DIGITS')).run(req),
        body('newPassword')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email, code, resetToken, newPassword } = req.body;

      // Use either 'code' or 'resetToken', with 'code' taking precedence
      const resetCode = code || resetToken;

      if (!resetCode) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: [getMessage('VALIDATION.RESET_CODE_REQUIRED')]
        });
        return;
      }

      const result = await AuthService.resetPassword(email, resetCode, newPassword);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in resetPassword controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}

import { AuthService } from '@/services/auth.service';
import { GoogleAuthService } from '@/services/google-auth.service';
import { SubscriptionPackageService } from '@/services/super_admin/subscription-package.service';
import { TeacherSubscriptionService } from '@/services/teacher-subscription.service';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

export class AuthController {
  // Register super admin
  static async registerSuperAdmin(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage('الاسم مطلوب').run(req),
        body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم')
          .run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Register teacher
  static async registerTeacher(req: Request, res: Response): Promise<void> {
    try {
      // 1) Validation (كما هو عندك)
      await Promise.all([
        body('name').notEmpty().withMessage('الاسم مطلوب').run(req),
        body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
        body('password')
          .isLength({ min: 8 }).withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم').run(req),
        body('phone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
        body('address').notEmpty().withMessage('العنوان مطلوب').run(req),
        body('bio').notEmpty().withMessage('النبذة الشخصية مطلوبة').run(req),
        body('experienceYears').isInt({ min: 0 }).withMessage('سنوات الخبرة مطلوبة').run(req),
        body('gradeIds').isArray({ min: 1 }).withMessage('معرف الصف مطلوب').run(req),
        body('gradeIds.*').isUUID().withMessage('الصف غير موجود').run(req),
        body('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة')
          .matches(/^[0-9]{4}-[0-9]{4}$/).withMessage('تنسيق السنة الدراسية غير صحيح').run(req),
        body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
        body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
        body('formattedAddress').optional().isLength({ max: 1000 }).withMessage('العنوان طويل جداً').run(req),
        body('country').optional().isLength({ max: 100 }).withMessage('اسم البلد طويل جداً').run(req),
        body('city').optional().isLength({ max: 100 }).withMessage('اسم المدينة طويل جداً').run(req),
        body('state').optional().isLength({ max: 100 }).withMessage('اسم المحافظة طويل جداً').run(req),
        body('zipcode').optional().isLength({ max: 20 }).withMessage('الرمز البريدي طويل جداً').run(req),
        body('streetName').optional().isLength({ max: 255 }).withMessage('اسم الشارع طويل جداً').run(req),
        body('suburb').optional().isLength({ max: 100 }).withMessage('اسم الحي طويل جداً').run(req),
        body('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage('ثقة الموقع غير صحيحة').run(req),
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
          message: 'تم التسجيل بنجاح',
          data: {
            user: result.data?.user ?? result.data, // حسب ما ترجّعه خدمتك
            subscription: null,
          },
          errors: ['لا توجد باقة مجانية متاحة'],
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
          message: 'تم التسجيل بنجاح',
          data: {
            user: result.data?.user ?? result.data,
            subscription: teacherSubscription.data,
          },
        });
      } else {
        // سجلّناه كمعلّم، لكن الاشتراك فشل
        res.status(201).json({
          success: true,
          message: 'تم التسجيل بنجاح',
          data: {
            user: result.data?.user ?? result.data,
            subscription: null,
          },
          errors: ['فشل في إنشاء الاشتراك المجاني'],
        });
      }
    } catch (error) {
      console.error('Error in registerTeacher controller:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم'],
      });
    }
  }

  // Register student
  static async registerStudent(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage('الاسم مطلوب').run(req),
        body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم')
          .run(req),
        body('studentPhone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('تنسيق رقم هاتف الطالب غير صحيح').run(req),
        body('parentPhone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('تنسيق رقم هاتف الوالد غير صحيح').run(req),
        body('schoolName').optional().isLength({ max: 255 }).withMessage('اسم المدرسة طويل جداً').run(req),
        body('gender').optional().isIn(['male', 'female']).withMessage('الجنس غير صحيح').run(req),
        body('birthDate').optional().isISO8601().withMessage('تنسيق تاريخ الميلاد غير صحيح').run(req),
        body('gradeId').notEmpty().withMessage('معرف الصف مطلوب').isUUID().withMessage('الصف غير موجود').run(req),
        body('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة').matches(/^[0-9]{4}-[0-9]{4}$/).withMessage('تنسيق السنة الدراسية غير صحيح').run(req),
        body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
        body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
        body('formattedAddress').optional().isLength({ max: 1000 }).withMessage('العنوان طويل جداً').run(req),
        body('country').optional().isLength({ max: 100 }).withMessage('اسم البلد طويل جداً').run(req),
        body('city').optional().isLength({ max: 100 }).withMessage('اسم المدينة طويل جداً').run(req),
        body('state').optional().isLength({ max: 100 }).withMessage('اسم المحافظة طويل جداً').run(req),
        body('zipcode').optional().isLength({ max: 20 }).withMessage('الرمز البريدي طويل جداً').run(req),
        body('streetName').optional().isLength({ max: 255 }).withMessage('اسم الشارع طويل جداً').run(req),
        body('suburb').optional().isLength({ max: 100 }).withMessage('اسم الحي طويل جداً').run(req),
        body('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage('ثقة الموقع غير صحيحة').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
            message: 'فشل في التحقق من البيانات',
            errors: ['الطالب صغير جداً (أقل من 5 سنوات)']
          });
          return;
        }

        if (age > 25) {
          res.status(400).json({
            success: false,
            message: 'فشل في التحقق من البيانات',
            errors: ['الطالب كبير جداً (أكثر من 25 سنة)']
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Login user
  static async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
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
          message: 'رمز المصادقة مطلوب',
          errors: ['لم يتم توفير رمز المصادقة']
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Verify email
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
        body('code').optional().isLength({ min: 6, max: 6 }).withMessage('رمز التحقق يجب أن يكون 6 أرقام').run(req),
        body('verificationToken').optional().isLength({ min: 6, max: 6 }).withMessage('رمز التحقق يجب أن يكون 6 أرقام').run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
          message: 'فشل في التحقق من البيانات',
          errors: ['رمز التحقق مطلوب']
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Resend verification code
  static async resendVerificationCode(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Request password reset
  static async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
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
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
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
          body('phone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
          body('address').notEmpty().withMessage('العنوان مطلوب').run(req),
          body('bio').notEmpty().withMessage('النبذة الشخصية مطلوبة').run(req),
          body('experienceYears').isInt({ min: 0 }).withMessage('سنوات الخبرة مطلوبة').run(req),
          body('gradeIds').isArray({ min: 1 }).withMessage('معرف الصف مطلوب').run(req),
          body('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة').run(req)
        ]);
      } else if (userType === 'student') {
        await Promise.all([
          body('gradeId').notEmpty().withMessage('معرف الصف مطلوب').run(req),
          body('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة').run(req)
        ]);
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }

  // Reset password
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
        body('code').optional().isLength({ min: 6, max: 6 }).withMessage('رمز إعادة التعيين يجب أن يكون 6 أرقام').run(req),
        body('resetToken').optional().isLength({ min: 6, max: 6 }).withMessage('رمز إعادة التعيين يجب أن يكون 6 أرقام').run(req),
        body('newPassword')
          .isLength({ min: 8 })
          .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم')
          .run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'فشل في التحقق من البيانات',
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
          message: 'فشل في التحقق من البيانات',
          errors: ['رمز إعادة التعيين مطلوب']
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
        message: 'حدث خطأ في الخادم',
        errors: ['حدث خطأ في الخادم']
      });
    }
  }
}

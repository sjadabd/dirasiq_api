"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const express_validator_1 = require("express-validator");
const auth_service_1 = require("../services/auth.service");
const google_auth_service_1 = require("../services/google-auth.service");
const academic_year_service_1 = require("../services/super_admin/academic-year.service");
const subscription_package_service_1 = require("../services/super_admin/subscription-package.service");
const teacher_subscription_service_1 = require("../services/teacher-subscription.service");
class AuthController {
    static async registerSuperAdmin(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('name').notEmpty().withMessage('الاسم مطلوب').run(req),
                (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
                (0, express_validator_1.body)('password')
                    .isLength({ min: 8 })
                    .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
                    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                    .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم')
                    .run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { name, email, password } = req.body;
            const result = await auth_service_1.AuthService.registerSuperAdmin({ name, email, password });
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in registerSuperAdmin controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async registerTeacher(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('name').notEmpty().withMessage('الاسم مطلوب').run(req),
                (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
                (0, express_validator_1.body)('password')
                    .isLength({ min: 8 }).withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
                    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                    .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم').run(req),
                (0, express_validator_1.body)('phone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
                (0, express_validator_1.body)('address').notEmpty().withMessage('العنوان مطلوب').run(req),
                (0, express_validator_1.body)('bio').notEmpty().withMessage('النبذة الشخصية مطلوبة').run(req),
                (0, express_validator_1.body)('experienceYears').isInt({ min: 0 }).withMessage('سنوات الخبرة مطلوبة').run(req),
                (0, express_validator_1.body)('gradeIds').isArray({ min: 1 }).withMessage('معرف الصف مطلوب').run(req),
                (0, express_validator_1.body)('gradeIds.*').isUUID().withMessage('الصف غير موجود').run(req),
                (0, express_validator_1.body)('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة')
                    .matches(/^[0-9]{4}-[0-9]{4}$/).withMessage('تنسيق السنة الدراسية غير صحيح').run(req),
                (0, express_validator_1.body)('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
                (0, express_validator_1.body)('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
                (0, express_validator_1.body)('formattedAddress').optional().isLength({ max: 1000 }).withMessage('العنوان طويل جداً').run(req),
                (0, express_validator_1.body)('country').optional().isLength({ max: 100 }).withMessage('اسم البلد طويل جداً').run(req),
                (0, express_validator_1.body)('city').optional().isLength({ max: 100 }).withMessage('اسم المدينة طويل جداً').run(req),
                (0, express_validator_1.body)('state').optional().isLength({ max: 100 }).withMessage('اسم المحافظة طويل جداً').run(req),
                (0, express_validator_1.body)('zipcode').optional().isLength({ max: 20 }).withMessage('الرمز البريدي طويل جداً').run(req),
                (0, express_validator_1.body)('streetName').optional().isLength({ max: 255 }).withMessage('اسم الشارع طويل جداً').run(req),
                (0, express_validator_1.body)('suburb').optional().isLength({ max: 100 }).withMessage('اسم الحي طويل جداً').run(req),
                (0, express_validator_1.body)('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage('ثقة الموقع غير صحيحة').run(req),
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(e => e.msg),
                });
                return;
            }
            const { name, email, password, phone, address, bio, experienceYears, visitorId, deviceInfo, gradeIds, studyYear, latitude, longitude, formattedAddress, country, city, state, zipcode, streetName, suburb, locationConfidence, } = req.body;
            const teacherData = {
                name, email, password, phone, address, bio, experienceYears,
                visitorId, deviceInfo, gradeIds, studyYear,
            };
            if (latitude)
                teacherData.latitude = Number(latitude);
            if (longitude)
                teacherData.longitude = Number(longitude);
            if (formattedAddress)
                teacherData.formattedAddress = formattedAddress;
            if (country)
                teacherData.country = country;
            if (city)
                teacherData.city = city;
            if (state)
                teacherData.state = state;
            if (zipcode)
                teacherData.zipcode = zipcode;
            if (streetName)
                teacherData.streetName = streetName;
            if (suburb)
                teacherData.suburb = suburb;
            if (locationConfidence !== undefined)
                teacherData.locationConfidence = Number(locationConfidence);
            const result = await auth_service_1.AuthService.registerTeacher(teacherData);
            if (!result.success) {
                res.status(400).json(result);
                return;
            }
            const freePkgResp = await subscription_package_service_1.SubscriptionPackageService.getFreePackage();
            if (!freePkgResp.success || !freePkgResp.data) {
                res.status(201).json({
                    success: true,
                    message: 'تم التسجيل بنجاح',
                    data: {
                        user: result.data?.user ?? result.data,
                        subscription: null,
                    },
                    errors: ['لا توجد باقة مجانية متاحة'],
                });
                return;
            }
            const pkg = freePkgResp.data;
            if (pkg.maxStudents !== 20 || !pkg.isFree || !pkg.isActive) {
            }
            const startDate = new Date();
            const endDate = new Date(startDate.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);
            const teacherSubscription = await teacher_subscription_service_1.TeacherSubscriptionService.create({
                teacherId: result.data?.user?.id ?? result.data?.teacherId,
                subscriptionPackageId: pkg.id,
                startDate,
                endDate,
            });
            if (teacherSubscription.success) {
                res.status(201).json({
                    success: true,
                    message: 'تم التسجيل بنجاح',
                    data: {
                        user: result.data?.user ?? result.data,
                        subscription: teacherSubscription.data,
                    },
                });
            }
            else {
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
        }
        catch (error) {
            console.error('Error in registerTeacher controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم'],
            });
        }
    }
    static async registerStudent(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)("name").notEmpty().withMessage("الاسم مطلوب").run(req),
                (0, express_validator_1.body)("email").isEmail().withMessage("البريد الإلكتروني غير صحيح").run(req),
                (0, express_validator_1.body)("password")
                    .isLength({ min: 8 })
                    .withMessage("كلمة المرور يجب أن تكون 8 أحرف على الأقل")
                    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                    .withMessage("كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم")
                    .run(req),
                (0, express_validator_1.body)("studentPhone")
                    .optional()
                    .isLength({ min: 10, max: 15 })
                    .withMessage("رقم هاتف الطالب يجب أن يحتوي على 10 إلى 15 رقم")
                    .run(req),
                (0, express_validator_1.body)("parentPhone")
                    .optional()
                    .isLength({ min: 10, max: 15 })
                    .withMessage("رقم هاتف ولي الأمر يجب أن يحتوي على 10 إلى 15 رقم")
                    .run(req),
                (0, express_validator_1.body)("schoolName").optional().isLength({ max: 255 }).withMessage("اسم المدرسة طويل جداً").run(req),
                (0, express_validator_1.body)("gender").optional().isIn(["male", "female"]).withMessage("الجنس غير صحيح").run(req),
                (0, express_validator_1.body)("birthDate").optional().isISO8601().withMessage("تنسيق تاريخ الميلاد غير صحيح").run(req),
                (0, express_validator_1.body)("gradeId").notEmpty().withMessage("معرف الصف مطلوب").isUUID().withMessage("الصف غير موجود").run(req),
                (0, express_validator_1.body)("latitude").optional().isFloat({ min: -90, max: 90 }).withMessage("خط العرض غير صحيح").run(req),
                (0, express_validator_1.body)("longitude").optional().isFloat({ min: -180, max: 180 }).withMessage("خط الطول غير صحيح").run(req),
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                console.error("❌ Validation errors:", errors.array());
                res.status(400).json({
                    success: false,
                    message: "فشل في التحقق من البيانات",
                    errors: errors.array().map((err) => err.msg),
                });
                return;
            }
            const { name, email, password, studentPhone, parentPhone, schoolName, gender, birthDate, gradeId, latitude, longitude, } = req.body;
            const activeYearResult = await academic_year_service_1.AcademicYearService.getActive();
            if (!activeYearResult.success || !activeYearResult.data) {
                res.status(400).json({
                    success: false,
                    message: "لا توجد سنة دراسية مفعّلة حالياً",
                });
                return;
            }
            const studyYear = activeYearResult.data.academicYear.year;
            const studentData = {
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
            };
            if (latitude)
                studentData.latitude = Number(latitude);
            if (longitude)
                studentData.longitude = Number(longitude);
            const result = await auth_service_1.AuthService.registerStudent(studentData);
            if (result.success) {
                res.status(201).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error("Error in registerStudent controller:", error);
            res.status(500).json({
                success: false,
                message: "حدث خطأ في الخادم",
                errors: ["حدث خطأ في الخادم"],
            });
        }
    }
    static async login(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
                (0, express_validator_1.body)('password').notEmpty().withMessage('كلمة المرور مطلوبة').run(req),
                (0, express_validator_1.body)('oneSignalPlayerId').optional().isString().run(req),
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
                return;
            }
            const { email, password, oneSignalPlayerId } = req.body;
            const result = await auth_service_1.AuthService.login({ email, password, oneSignalPlayerId });
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(401).json(result);
            }
        }
        catch (error) {
            console.error('Error in login controller:', error);
            res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
        }
    }
    static async logout(req, res) {
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
            const result = await auth_service_1.AuthService.logout(token);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in logout controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async verifyEmail(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
                (0, express_validator_1.body)('code').optional().isLength({ min: 6, max: 6 }).withMessage('رمز التحقق يجب أن يكون 6 أرقام').run(req),
                (0, express_validator_1.body)('verificationToken').optional().isLength({ min: 6, max: 6 }).withMessage('رمز التحقق يجب أن يكون 6 أرقام').run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { email, code, verificationToken } = req.body;
            const verificationCode = code || verificationToken;
            if (!verificationCode) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: ['رمز التحقق مطلوب']
                });
                return;
            }
            const result = await auth_service_1.AuthService.verifyEmail(email, verificationCode);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in verifyEmail controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async resendVerificationCode(req, res) {
        try {
            await (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { email } = req.body;
            const result = await auth_service_1.AuthService.resendVerificationCode(email);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in resendVerificationCode controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async requestPasswordReset(req, res) {
        try {
            await (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { email } = req.body;
            const result = await auth_service_1.AuthService.requestPasswordReset(email);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in requestPasswordReset controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async resetPassword(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('email').isEmail().withMessage('البريد الإلكتروني مطلوب').run(req),
                (0, express_validator_1.body)('code').optional().isLength({ min: 6, max: 6 }).withMessage('رمز إعادة التعيين يجب أن يكون 6 أرقام').run(req),
                (0, express_validator_1.body)('resetToken').optional().isLength({ min: 6, max: 6 }).withMessage('رمز إعادة التعيين يجب أن يكون 6 أرقام').run(req),
                (0, express_validator_1.body)('newPassword')
                    .isLength({ min: 8 })
                    .withMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
                    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                    .withMessage('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم')
                    .run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const { email, code, resetToken, newPassword } = req.body;
            const resetCode = code || resetToken;
            if (!resetCode) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: ['رمز إعادة التعيين مطلوب']
                });
                return;
            }
            const result = await auth_service_1.AuthService.resetPassword(email, resetCode, newPassword);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in resetPassword controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async googleAuth(req, res) {
        try {
            await Promise.all([
                (0, express_validator_1.body)('googleToken').optional().isString().withMessage('Google token must be a string').run(req),
                (0, express_validator_1.body)('googleData').optional().isObject().withMessage('Google data is required').run(req),
                (0, express_validator_1.body)('userType').isIn(['teacher', 'student']).withMessage('User type must be teacher or student').run(req)
            ]);
            const errors = (0, express_validator_1.validationResult)(req);
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
            if (googleToken) {
                const verification = await google_auth_service_1.GoogleAuthService.verifyGoogleToken(googleToken);
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
            else if (googleData) {
                const validation = await google_auth_service_1.GoogleAuthService.verifyGoogleDataWithSecurity(googleData);
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
            if (!verifiedGoogleData.email || !verifiedGoogleData.name || !verifiedGoogleData.sub) {
                res.status(400).json({
                    success: false,
                    message: 'بيانات Google ناقصة',
                    errors: ['Missing required Google data fields']
                });
                return;
            }
            const oneSignalPlayerId = googleData?.oneSignalPlayerId || req.body.oneSignalPlayerId;
            if (oneSignalPlayerId) {
                verifiedGoogleData.oneSignalPlayerId = oneSignalPlayerId;
            }
            const result = await auth_service_1.AuthService.googleAuth(verifiedGoogleData, userType);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in googleAuth controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async completeProfile(req, res) {
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
            if (userType === 'teacher') {
                await Promise.all([
                    (0, express_validator_1.body)('name').notEmpty().withMessage('الاسم مطلوب').run(req),
                    (0, express_validator_1.body)('phone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
                    (0, express_validator_1.body)('bio').notEmpty().withMessage('النبذة الشخصية مطلوبة').run(req),
                    (0, express_validator_1.body)('experienceYears').isInt({ min: 0 }).withMessage('سنوات الخبرة مطلوبة').run(req),
                    (0, express_validator_1.body)('gradeIds').isArray({ min: 1 }).withMessage('معرف الصف مطلوب').run(req),
                    (0, express_validator_1.body)('gradeIds.*').isUUID().withMessage('الصف غير موجود').run(req),
                    (0, express_validator_1.body)('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة')
                        .matches(/^[0-9]{4}-[0-9]{4}$/).withMessage('تنسيق السنة الدراسية غير صحيح').run(req),
                    (0, express_validator_1.body)('latitude').isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
                    (0, express_validator_1.body)('longitude').isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
                    (0, express_validator_1.body)('address').optional().isLength({ max: 1000 }).withMessage('العنوان طويل جداً').run(req),
                    (0, express_validator_1.body)('formattedAddress').optional().isLength({ max: 1000 }).withMessage('العنوان المنسق طويل جداً').run(req),
                    (0, express_validator_1.body)('country').optional().isLength({ max: 100 }).withMessage('اسم البلد طويل جداً').run(req),
                    (0, express_validator_1.body)('city').optional().isLength({ max: 100 }).withMessage('اسم المدينة طويل جداً').run(req),
                    (0, express_validator_1.body)('state').optional().isLength({ max: 100 }).withMessage('اسم المحافظة طويل جداً').run(req),
                    (0, express_validator_1.body)('zipcode').optional().isLength({ max: 20 }).withMessage('الرمز البريدي طويل جداً').run(req),
                    (0, express_validator_1.body)('streetName').optional().isLength({ max: 255 }).withMessage('اسم الشارع طويل جداً').run(req),
                    (0, express_validator_1.body)('suburb').optional().isLength({ max: 100 }).withMessage('اسم الحي طويل جداً').run(req),
                    (0, express_validator_1.body)('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage('ثقة الموقع غير صحيحة').run(req),
                    (0, express_validator_1.body)('gender').optional().isIn(['male', 'female']).withMessage('الجنس غير صحيح').run(req),
                    (0, express_validator_1.body)('birthDate').optional().isISO8601().withMessage('تنسيق تاريخ الميلاد غير صحيح').run(req)
                ]);
            }
            else if (userType === 'student') {
                await Promise.all([
                    (0, express_validator_1.body)('gradeId').notEmpty().withMessage('معرف الصف مطلوب').isUUID().withMessage('الصف غير موجود').run(req),
                    (0, express_validator_1.body)('studyYear').notEmpty().withMessage('السنة الدراسية مطلوبة')
                        .matches(/^[0-9]{4}-[0-9]{4}$/).withMessage('تنسيق السنة الدراسية غير صحيح').run(req),
                    (0, express_validator_1.body)('latitude').isFloat({ min: -90, max: 90 }).withMessage('خط العرض غير صحيح').run(req),
                    (0, express_validator_1.body)('longitude').isFloat({ min: -180, max: 180 }).withMessage('خط الطول غير صحيح').run(req),
                    (0, express_validator_1.body)('studentPhone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
                    (0, express_validator_1.body)('parentPhone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
                    (0, express_validator_1.body)('schoolName').optional().isLength({ max: 255 }).withMessage('اسم المدرسة طويل جداً').run(req),
                    (0, express_validator_1.body)('gender').optional().isIn(['male', 'female']).withMessage('الجنس غير صحيح').run(req),
                    (0, express_validator_1.body)('birthDate').optional().isISO8601().withMessage('تنسيق تاريخ الميلاد غير صحيح').run(req),
                    (0, express_validator_1.body)('address').optional().isLength({ max: 1000 }).withMessage('العنوان طويل جداً').run(req),
                    (0, express_validator_1.body)('formattedAddress').optional().isLength({ max: 1000 }).withMessage('العنوان المنسق طويل جداً').run(req),
                    (0, express_validator_1.body)('country').optional().isLength({ max: 100 }).withMessage('اسم البلد طويل جداً').run(req),
                    (0, express_validator_1.body)('city').optional().isLength({ max: 100 }).withMessage('اسم المدينة طويل جداً').run(req),
                    (0, express_validator_1.body)('state').optional().isLength({ max: 100 }).withMessage('اسم المحافظة طويل جداً').run(req),
                    (0, express_validator_1.body)('zipcode').optional().isLength({ max: 20 }).withMessage('الرمز البريدي طويل جداً').run(req),
                    (0, express_validator_1.body)('streetName').optional().isLength({ max: 255 }).withMessage('اسم الشارع طويل جداً').run(req),
                    (0, express_validator_1.body)('suburb').optional().isLength({ max: 100 }).withMessage('اسم الحي طويل جداً').run(req),
                    (0, express_validator_1.body)('locationConfidence').optional().isFloat({ min: 0, max: 1 }).withMessage('ثقة الموقع غير صحيحة').run(req)
                ]);
            }
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const result = await auth_service_1.AuthService.completeProfile(userId, userType, req.body);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in completeProfile controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
    static async updateProfile(req, res) {
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
            if (userType === 'teacher') {
                await Promise.all([
                    (0, express_validator_1.body)('name').notEmpty().withMessage('الاسم مطلوب').run(req),
                    (0, express_validator_1.body)('phone').notEmpty().withMessage('رقم الهاتف مطلوب').run(req),
                    (0, express_validator_1.body)('bio').notEmpty().withMessage('النبذة الشخصية مطلوبة').run(req),
                    (0, express_validator_1.body)('experienceYears').isInt({ min: 0 }).withMessage('سنوات الخبرة مطلوبة').run(req),
                    (0, express_validator_1.body)('gradeIds').isArray({ min: 1 }).withMessage('معرف الصف مطلوب').run(req),
                    (0, express_validator_1.body)('gradeIds.*').isUUID().withMessage('الصف غير موجود').run(req),
                    (0, express_validator_1.body)('studyYear').notEmpty().matches(/^[0-9]{4}-[0-9]{4}$/).withMessage('تنسيق السنة الدراسية غير صحيح').run(req),
                ]);
            }
            else if (userType === 'student') {
                await Promise.all([
                    (0, express_validator_1.body)('name').notEmpty().withMessage('الاسم مطلوب').run(req),
                    (0, express_validator_1.body)('studentPhone').notEmpty().withMessage('رقم الطالب مطلوب').run(req),
                    (0, express_validator_1.body)('parentPhone').notEmpty().withMessage('رقم ولي الأمر مطلوب').run(req),
                    (0, express_validator_1.body)('schoolName').notEmpty().withMessage('اسم المدرسة مطلوب').run(req),
                    (0, express_validator_1.body)('gender').isIn(['male', 'female']).withMessage('الجنس غير صحيح').run(req),
                    (0, express_validator_1.body)('birthDate').isISO8601().withMessage('تاريخ الميلاد غير صحيح').run(req),
                ]);
            }
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'فشل في التحقق من البيانات',
                    errors: errors.array().map(err => err.msg)
                });
                return;
            }
            const result = await auth_service_1.AuthService.updateProfile(userId, userType, req.body);
            if (result.success) {
                res.status(200).json(result);
            }
            else {
                res.status(400).json(result);
            }
        }
        catch (error) {
            console.error('Error in updateProfile controller:', error);
            res.status(500).json({
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            });
        }
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map
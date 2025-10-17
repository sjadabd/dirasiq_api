"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const email_1 = require("../config/email");
const grade_model_1 = require("../models/grade.model");
const student_grade_model_1 = require("../models/student-grade.model");
const subscription_package_model_1 = require("../models/subscription-package.model");
const teacher_grade_model_1 = require("../models/teacher-grade.model");
const teacher_subscription_model_1 = require("../models/teacher-subscription.model");
const token_model_1 = require("../models/token.model");
const user_model_1 = require("../models/user.model");
const geocoding_service_1 = require("../services/geocoding.service");
const qr_service_1 = require("../services/qr.service");
const academic_year_service_1 = require("../services/super_admin/academic-year.service");
const types_1 = require("../types");
const image_service_1 = require("../utils/image.service");
class AuthService {
    static async registerSuperAdmin(data) {
        try {
            const superAdminExists = await user_model_1.UserModel.superAdminExists();
            if (superAdminExists) {
                return {
                    success: false,
                    message: 'السوبر أدمن موجود بالفعل',
                    errors: ['السوبر أدمن موجود بالفعل']
                };
            }
            const superAdmin = await user_model_1.UserModel.create({
                name: data.name,
                email: data.email,
                password: data.password,
                userType: types_1.UserType.SUPER_ADMIN,
                status: types_1.UserStatus.ACTIVE
            });
            return {
                success: true,
                message: 'تم تسجيل السوبر أدمن بنجاح',
                data: {
                    user: this.sanitizeUser(superAdmin)
                }
            };
        }
        catch (error) {
            console.error('Error registering super admin:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async registerTeacher(data) {
        try {
            const teacherData = {
                name: data.name,
                email: data.email,
                password: data.password,
                userType: types_1.UserType.TEACHER,
                status: types_1.UserStatus.PENDING
            };
            if (data.phone)
                teacherData.phone = data.phone;
            if (data.address)
                teacherData.address = data.address;
            if (data.bio)
                teacherData.bio = data.bio;
            if (data.experienceYears)
                teacherData.experienceYears = data.experienceYears;
            if (data.visitorId)
                teacherData.visitorId = data.visitorId;
            if (data.deviceInfo)
                teacherData.deviceInfo = data.deviceInfo;
            if (data.latitude !== undefined)
                teacherData.latitude = data.latitude;
            if (data.longitude !== undefined)
                teacherData.longitude = data.longitude;
            if (data.formattedAddress)
                teacherData.formattedAddress = data.formattedAddress;
            if (data.country)
                teacherData.country = data.country;
            if (data.city)
                teacherData.city = data.city;
            if (data.state)
                teacherData.state = data.state;
            if (data.zipcode)
                teacherData.zipcode = data.zipcode;
            if (data.streetName)
                teacherData.streetName = data.streetName;
            if (data.suburb)
                teacherData.suburb = data.suburb;
            if (data.locationConfidence !== undefined)
                teacherData.locationConfidence = data.locationConfidence;
            if (data.latitude && data.longitude && !data.formattedAddress) {
                try {
                    const geocodingService = new geocoding_service_1.GeocodingService();
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
                }
                catch (error) {
                    console.error('Error getting location details:', error);
                }
            }
            const teacher = await user_model_1.UserModel.create(teacherData);
            try {
                const freePackage = await subscription_package_model_1.SubscriptionPackageModel.getFreePackage();
                if (freePackage) {
                    const startDate = new Date();
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + Number(freePackage.durationDays || 30));
                    await teacher_subscription_model_1.TeacherSubscriptionModel.create({
                        teacherId: teacher.id,
                        subscriptionPackageId: freePackage.id,
                        startDate,
                        endDate
                    });
                }
                else {
                    console.warn('No free subscription package found. Skipping auto-subscription for teacher.');
                }
            }
            catch (subErr) {
                console.error('Failed to auto-create free subscription for teacher:', subErr);
            }
            if (data.gradeIds && data.gradeIds.length > 0 && data.studyYear) {
                try {
                    await teacher_grade_model_1.TeacherGradeModel.createMany(teacher.id, data.gradeIds, data.studyYear);
                }
                catch (error) {
                    console.error('Error creating teacher grade relationships:', error);
                }
            }
            const verificationCode = await user_model_1.UserModel.getVerificationCode(data.email);
            const emailSent = await (0, email_1.sendVerificationEmail)(data.email, verificationCode || '', data.name);
            if (!emailSent) {
                return {
                    success: false,
                    message: 'فشل في إرسال البريد الإلكتروني',
                    errors: ['فشل في إرسال البريد الإلكتروني']
                };
            }
            return {
                success: true,
                message: 'تم تسجيل المعلم بنجاح',
                data: {
                    user: this.sanitizeUser(teacher)
                }
            };
        }
        catch (error) {
            console.error('Error registering teacher:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async registerStudent(data) {
        try {
            const studentData = {
                name: data.name,
                email: data.email,
                password: data.password,
                userType: types_1.UserType.STUDENT,
                status: types_1.UserStatus.PENDING
            };
            if (data.studentPhone)
                studentData.studentPhone = data.studentPhone;
            if (data.parentPhone)
                studentData.parentPhone = data.parentPhone;
            if (data.schoolName)
                studentData.schoolName = data.schoolName;
            if (data.gender)
                studentData.gender = data.gender;
            if (data.birthDate)
                studentData.birthDate = new Date(data.birthDate);
            if (data.latitude !== undefined)
                studentData.latitude = data.latitude;
            if (data.longitude !== undefined)
                studentData.longitude = data.longitude;
            if (data.formattedAddress)
                studentData.formattedAddress = data.formattedAddress;
            if (data.country)
                studentData.country = data.country;
            if (data.city)
                studentData.city = data.city;
            if (data.state)
                studentData.state = data.state;
            if (data.zipcode)
                studentData.zipcode = data.zipcode;
            if (data.streetName)
                studentData.streetName = data.streetName;
            if (data.suburb)
                studentData.suburb = data.suburb;
            if (data.locationConfidence !== undefined)
                studentData.locationConfidence = data.locationConfidence;
            if (data.latitude && data.longitude && !data.formattedAddress) {
                try {
                    const geocodingService = new geocoding_service_1.GeocodingService();
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
                }
                catch (error) {
                    console.error('Error getting location details:', error);
                }
            }
            const student = await user_model_1.UserModel.create(studentData);
            try {
                await student_grade_model_1.StudentGradeModel.create({
                    studentId: student.id,
                    gradeId: data.gradeId,
                    studyYear: data.studyYear
                });
            }
            catch (error) {
                console.error('Error creating student grade relationship:', error);
            }
            const verificationCode = await user_model_1.UserModel.getVerificationCode(data.email);
            const emailSent = await (0, email_1.sendVerificationEmail)(data.email, verificationCode || '', data.name);
            if (!emailSent) {
                return {
                    success: false,
                    message: 'فشل في إرسال البريد الإلكتروني',
                    errors: ['فشل في إرسال البريد الإلكتروني']
                };
            }
            return {
                success: true,
                message: 'تم تسجيل الطالب بنجاح',
                data: {
                    user: this.sanitizeUser(student)
                }
            };
        }
        catch (error) {
            console.error('Error registering student:', error);
            return {
                success: false,
                message: 'فشل في العملية',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async login(data) {
        try {
            const user = await user_model_1.UserModel.findByEmail(data.email);
            if (!user) {
                return {
                    success: false,
                    message: 'بيانات الدخول غير صحيحة',
                    errors: ['بيانات الدخول غير صحيحة']
                };
            }
            if (user.status !== types_1.UserStatus.ACTIVE) {
                return {
                    success: false,
                    message: 'الحساب غير مفعل',
                    errors: ['الحساب غير مفعل، يرجى التحقق من بريدك الإلكتروني أو التواصل مع الدعم']
                };
            }
            if (user.authProvider === 'google') {
                return {
                    success: false,
                    message: 'قمت بانشاء الحساب باستخدام google الرجاء تسجيل الدخول بنفس الطريقة',
                    errors: ['قمت بانشاء الحساب باستخدام google الرجاء تسجيل الدخول بنفس الطريقة']
                };
            }
            const isPasswordValid = await bcryptjs_1.default.compare(data.password, user.password);
            if (!isPasswordValid) {
                return {
                    success: false,
                    message: 'بيانات الدخول غير صحيحة',
                    errors: ['بيانات الدخول غير صحيحة']
                };
            }
            const isProfileComplete = this.isProfileComplete(user);
            const academicYearResponse = await academic_year_service_1.AcademicYearService.getActive();
            const activeAcademicYear = academicYearResponse.success ? academicYearResponse.data?.academicYear : null;
            const enhancedUser = await this.getEnhancedUserData(user);
            try {
                if (user.userType === types_1.UserType.TEACHER) {
                    await qr_service_1.QrService.ensureTeacherQr(user.id);
                }
            }
            catch (e) {
                console.error('Auto-ensure teacher QR on login failed:', e);
            }
            const token = await this.generateToken(user);
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await token_model_1.TokenModel.create(user.id, token, expiresAt, data.oneSignalPlayerId);
            return {
                success: true,
                message: 'تم تسجيل الدخول بنجاح',
                data: {
                    user: {
                        ...enhancedUser,
                        studyYear: activeAcademicYear?.year
                    },
                    token,
                    isProfileComplete,
                    requiresProfileCompletion: !isProfileComplete,
                    activeAcademicYear
                }
            };
        }
        catch (error) {
            console.error('Error during login:', error);
            return {
                success: false,
                message: 'فشل في المصادقة',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async logout(token) {
        try {
            const deleted = await token_model_1.TokenModel.deleteByToken(token);
            if (!deleted) {
                return {
                    success: false,
                    message: 'التوكن غير صحيح',
                    errors: ['التوكن غير موجود أو منتهي الصلاحية']
                };
            }
            return {
                success: true,
                message: 'تم تسجيل الخروج بنجاح'
            };
        }
        catch (error) {
            console.error('Error during logout:', error);
            return {
                success: false,
                message: 'فشل في المصادقة',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async verifyEmail(email, code) {
        try {
            const verified = await user_model_1.UserModel.verifyEmail(email, code);
            if (!verified) {
                return {
                    success: false,
                    message: 'فشل في التحقق من البريد الإلكتروني',
                    errors: ['انتهت صلاحية الرمز']
                };
            }
            try {
                const u = await user_model_1.UserModel.findByEmail(email);
                if (u && u.userType === types_1.UserType.TEACHER) {
                    await qr_service_1.QrService.ensureTeacherQr(u.id);
                }
            }
            catch (e) {
                console.error('Auto-ensure teacher QR on verifyEmail failed:', e);
            }
            return {
                success: true,
                message: 'تم التحقق من البريد الإلكتروني بنجاح'
            };
        }
        catch (error) {
            console.error('Error verifying email:', error);
            return {
                success: false,
                message: 'فشل في التحقق من البريد الإلكتروني',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async resendVerificationCode(email) {
        try {
            const resent = await user_model_1.UserModel.resendVerificationCode(email);
            if (!resent) {
                return {
                    success: false,
                    message: 'فشل في التحقق من البريد الإلكتروني',
                    errors: ['البريد الإلكتروني غير محقق']
                };
            }
            const updatedUser = await user_model_1.UserModel.findByEmail(email);
            if (updatedUser) {
                const verificationCode = await user_model_1.UserModel.getVerificationCode(email);
                await (0, email_1.sendVerificationEmail)(email, verificationCode || '', updatedUser.name);
            }
            return {
                success: true,
                message: 'تم إرسال رمز التحقق بنجاح'
            };
        }
        catch (error) {
            console.error('Error resending verification code:', error);
            return {
                success: false,
                message: 'فشل في التحقق من البريد الإلكتروني',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async requestPasswordReset(email) {
        try {
            const resetCode = await user_model_1.UserModel.setPasswordResetCode(email);
            if (!resetCode) {
                return {
                    success: false,
                    message: 'المستخدم غير موجود',
                    errors: ['المستخدم غير موجود']
                };
            }
            const user = await user_model_1.UserModel.findByEmail(email);
            if (user) {
                const emailSent = await (0, email_1.sendPasswordResetEmail)(email, resetCode, user.name);
                if (!emailSent) {
                    return {
                        success: false,
                        message: 'فشل في إرسال البريد الإلكتروني',
                        errors: ['فشل في إرسال البريد الإلكتروني']
                    };
                }
            }
            return {
                success: true,
                message: 'تم إرسال رمز إعادة تعيين كلمة المرور بنجاح'
            };
        }
        catch (error) {
            console.error('Error requesting password reset:', error);
            return {
                success: false,
                message: 'فشل في إعادة تعيين كلمة المرور',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async resetPassword(email, code, newPassword) {
        try {
            const reset = await user_model_1.UserModel.resetPassword(email, code, newPassword);
            if (!reset) {
                return {
                    success: false,
                    message: 'رمز إعادة التعيين غير صحيح أو منتهي الصلاحية',
                    errors: ['رمز إعادة التعيين غير صحيح أو منتهي الصلاحية']
                };
            }
            return {
                success: true,
                message: 'تم إعادة تعيين كلمة المرور بنجاح'
            };
        }
        catch (error) {
            console.error('Error resetting password:', error);
            return {
                success: false,
                message: 'فشل في إعادة تعيين كلمة المرور',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async generateToken(user) {
        const payload = {
            userId: user.id,
            email: user.email,
            userType: user.userType
        };
        const secret = process.env['JWT_SECRET'];
        if (!secret) {
            throw new Error('مفتاح JWT غير مُعد');
        }
        const expiresIn = process.env['JWT_EXPIRES_IN'] || '4h';
        const token = jsonwebtoken_1.default.sign(payload, secret, { expiresIn });
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(4, 0, 0, 0);
        await token_model_1.TokenModel.create(user.id, token, tomorrow);
        return token;
    }
    static isProfileComplete(user) {
        if (user.userType === types_1.UserType.TEACHER) {
            return !!(user.phone &&
                user.phone.trim() !== '' &&
                user.address &&
                user.address.trim() !== '' &&
                user.bio &&
                user.bio.trim() !== '' &&
                user.experienceYears !== null &&
                user.experienceYears !== undefined);
        }
        else if (user.userType === types_1.UserType.STUDENT) {
            return !!(user.studentPhone &&
                user.studentPhone.trim() !== '' &&
                user.parentPhone &&
                user.parentPhone.trim() !== '' &&
                user.schoolName &&
                user.schoolName.trim() !== '');
        }
        return false;
    }
    static async googleAuth(googleData, userType) {
        try {
            const { email, name, sub } = googleData;
            const existingUser = await user_model_1.UserModel.findByEmail(email);
            if (existingUser) {
                if (existingUser.authProvider !== 'google') {
                    return {
                        success: false,
                        message: 'قمت بانشاء الحساب باستخدام البريد وكلمة المرور الرجاء تسجيل الدخول بنفس الطريقة',
                        errors: ['قمت بانشاء الحساب باستخدام البريد وكلمة المرور الرجاء تسجيل الدخول بنفس الطريقة']
                    };
                }
                if (existingUser.userType !== (userType === 'teacher' ? types_1.UserType.TEACHER : types_1.UserType.STUDENT)) {
                    return {
                        success: false,
                        message: 'نوع المستخدم لا يتطابق مع الحساب الموجود',
                        errors: ['User type mismatch with existing account']
                    };
                }
                const isProfileComplete = this.isProfileComplete(existingUser);
                const academicYearResponse = await academic_year_service_1.AcademicYearService.getActive();
                const activeAcademicYear = academicYearResponse.success ? academicYearResponse.data?.academicYear : null;
                const enhancedUser = await this.getEnhancedUserData(existingUser);
                try {
                    if (existingUser.userType === types_1.UserType.TEACHER) {
                        await qr_service_1.QrService.ensureTeacherQr(existingUser.id);
                    }
                }
                catch (e) {
                    console.error('Auto-ensure teacher QR (google existing user) failed:', e);
                }
                const token = jsonwebtoken_1.default.sign({
                    userId: existingUser.id,
                    userType: existingUser.userType,
                    email: existingUser.email
                }, process.env['JWT_SECRET'] || 'fallback-secret', { expiresIn: '7d' });
                await token_model_1.TokenModel.create(existingUser.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), googleData.oneSignalPlayerId);
                return {
                    success: true,
                    message: 'تم تسجيل الدخول بنجاح',
                    data: {
                        user: {
                            ...enhancedUser,
                            studyYear: activeAcademicYear?.year
                        },
                        token,
                        isNewUser: false,
                        isProfileComplete,
                        requiresProfileCompletion: !isProfileComplete,
                        activeAcademicYear: activeAcademicYear
                    }
                };
            }
            const tempPassword = `google_${sub}_${Date.now()}`;
            const hashedPassword = await bcryptjs_1.default.hash(tempPassword, 12);
            let newUser;
            if (userType === 'teacher') {
                newUser = await user_model_1.UserModel.create({
                    name,
                    email,
                    password: hashedPassword,
                    userType: types_1.UserType.TEACHER,
                    status: types_1.UserStatus.ACTIVE,
                    authProvider: 'google',
                    oauthProviderId: sub,
                    phone: '',
                    address: '',
                    bio: '',
                    experienceYears: 0,
                    deviceInfo: 'Google OAuth'
                });
                try {
                    const freePackage = await subscription_package_model_1.SubscriptionPackageModel.getFreePackage();
                    if (freePackage) {
                        const startDate = new Date();
                        const endDate = new Date(startDate);
                        endDate.setDate(endDate.getDate() + Number(freePackage.durationDays || 30));
                        await teacher_subscription_model_1.TeacherSubscriptionModel.create({
                            teacherId: newUser.id,
                            subscriptionPackageId: freePackage.id,
                            startDate,
                            endDate
                        });
                    }
                    else {
                        console.warn('No free subscription package found (Google). Skipping auto-subscription.');
                    }
                }
                catch (subErr) {
                    console.error('Failed to auto-create free subscription for Google teacher:', subErr);
                }
                try {
                    await qr_service_1.QrService.ensureTeacherQr(newUser.id);
                }
                catch (e) {
                    console.error('Auto-ensure teacher QR (google new teacher) failed:', e);
                }
            }
            else {
                newUser = await user_model_1.UserModel.create({
                    name,
                    email,
                    password: hashedPassword,
                    userType: types_1.UserType.STUDENT,
                    status: types_1.UserStatus.ACTIVE,
                    authProvider: 'google',
                    oauthProviderId: sub,
                    studentPhone: '',
                    parentPhone: '',
                    schoolName: ''
                });
            }
            const academicYearResponse = await academic_year_service_1.AcademicYearService.getActive();
            const activeAcademicYear = academicYearResponse.success ? academicYearResponse.data?.academicYear : null;
            const enhancedUser = await this.getEnhancedUserData(newUser);
            const token = jsonwebtoken_1.default.sign({
                userId: newUser.id,
                userType: newUser.userType,
                email: newUser.email
            }, process.env['JWT_SECRET'] || 'fallback-secret', { expiresIn: '7d' });
            await token_model_1.TokenModel.create(newUser.id, token, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), googleData.oneSignalPlayerId);
            return {
                success: true,
                message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح',
                data: {
                    user: {
                        ...enhancedUser,
                        studyYear: activeAcademicYear?.year
                    },
                    token,
                    isNewUser: true,
                    isProfileComplete: false,
                    requiresProfileCompletion: true,
                    activeAcademicYear: activeAcademicYear
                }
            };
        }
        catch (error) {
            console.error('Error in googleAuth service:', error);
            return {
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static async completeProfile(userId, userType, profileData) {
        try {
            const user = await user_model_1.UserModel.findById(userId);
            if (!user) {
                return {
                    success: false,
                    message: 'المستخدم غير موجود',
                    errors: ['User not found']
                };
            }
            const { latitude, longitude, address, formattedAddress, country, city, state, zipcode, streetName, suburb, locationConfidence } = profileData;
            let locationDetails = null;
            if (latitude && longitude) {
                try {
                    const geocodingService = new geocoding_service_1.GeocodingService();
                    locationDetails = await geocodingService.getLocationDetails(latitude, longitude);
                }
                catch (error) {
                    console.error('Error getting location details:', error);
                }
            }
            const updateData = {
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
            }
            else {
                if (formattedAddress)
                    updateData.formatted_address = formattedAddress;
                if (country)
                    updateData.country = country;
                if (city)
                    updateData.city = city;
                if (state)
                    updateData.state = state;
                if (zipcode)
                    updateData.zipcode = zipcode;
                if (streetName)
                    updateData.street_name = streetName;
                if (suburb)
                    updateData.suburb = suburb;
                if (locationConfidence !== undefined)
                    updateData.location_confidence = Number(locationConfidence);
                if (address)
                    updateData.address = address;
            }
            try {
                const profileImageBase64 = profileData?.profileImageBase64;
                if (profileImageBase64 && profileImageBase64.startsWith('data:image/')) {
                    try {
                        const existing = await user_model_1.UserModel.findById(userId);
                        const oldPath = existing?.profileImagePath || existing?.profile_image_path;
                        if (oldPath)
                            await image_service_1.ImageService.deleteUserAvatar(oldPath);
                    }
                    catch (delErr) {
                        console.warn('Could not delete old user avatar:', delErr);
                    }
                    const savedPath = await image_service_1.ImageService.saveUserAvatar(profileImageBase64, `avatar_${user.id}`);
                    updateData.profile_image_path = savedPath;
                }
            }
            catch (e) {
                console.error('Failed to process profile avatar (completeProfile):', e);
            }
            if (userType === 'teacher') {
                const { name, phone, address, bio, experienceYears, gradeIds, studyYear, gender, birthDate } = profileData;
                if (name)
                    updateData.name = name;
                if (phone)
                    updateData.phone = phone;
                if (address)
                    updateData.address = address;
                if (bio)
                    updateData.bio = bio;
                if (experienceYears !== undefined && experienceYears !== null) {
                    const exp = Number(experienceYears);
                    if (!Number.isNaN(exp))
                        updateData.experience_years = exp;
                }
                if (gender)
                    updateData.gender = gender;
                if (birthDate)
                    updateData.birth_date = birthDate;
                const updatedUser = await user_model_1.UserModel.update(userId, updateData);
                if (Array.isArray(gradeIds) && gradeIds.length > 0 && studyYear) {
                    try {
                        await teacher_grade_model_1.TeacherGradeModel.createMany(userId, gradeIds, studyYear);
                    }
                    catch (error) {
                        console.error('Error creating teacher grade relationships (completeProfile):', error);
                    }
                }
                const isProfileComplete = updatedUser ? this.isProfileComplete(updatedUser) : false;
                const enhancedUser = updatedUser ? await this.getEnhancedUserData(updatedUser) : null;
                return {
                    success: true,
                    message: 'تم تحديث الملف الشخصي بنجاح',
                    data: {
                        user: enhancedUser,
                        isProfileComplete,
                        requiresProfileCompletion: !isProfileComplete,
                        locationDetails: locationDetails
                    }
                };
            }
            if (userType === 'student') {
                const { name, gradeId, studyYear, studentPhone, parentPhone, schoolName, gender, birthDate } = profileData;
                if (name)
                    updateData.name = name;
                if (studentPhone)
                    updateData.student_phone = studentPhone;
                if (parentPhone)
                    updateData.parent_phone = parentPhone;
                if (schoolName)
                    updateData.school_name = schoolName;
                if (gender)
                    updateData.gender = gender;
                if (birthDate)
                    updateData.birth_date = birthDate;
                const updatedUser = await user_model_1.UserModel.update(userId, updateData);
                await student_grade_model_1.StudentGradeModel.create({
                    studentId: userId,
                    gradeId,
                    studyYear
                });
                const isProfileComplete = updatedUser ? this.isProfileComplete(updatedUser) : false;
                const enhancedUser = updatedUser ? await this.getEnhancedUserData(updatedUser) : null;
                return {
                    success: true,
                    message: 'تم تحديث الملف الشخصي بنجاح',
                    data: {
                        user: enhancedUser,
                        isProfileComplete,
                        requiresProfileCompletion: !isProfileComplete,
                        locationDetails: locationDetails
                    }
                };
            }
            return {
                success: false,
                message: 'نوع المستخدم غير صحيح',
                errors: ['Invalid user type']
            };
        }
        catch (error) {
            console.error('Error in completeProfile service:', error);
            return {
                success: false,
                message: 'حدث خطأ في الخادم',
                errors: ['حدث خطأ في الخادم']
            };
        }
    }
    static sanitizeUser(user) {
        const { password, ...sanitizedUser } = user;
        return sanitizedUser;
    }
    static async getEnhancedUserData(user) {
        const sanitizedUser = this.sanitizeUser(user);
        if (user.userType === 'teacher') {
            try {
                const teacherGrades = await teacher_grade_model_1.TeacherGradeModel.findByTeacherId(user.id);
                const gradesWithDetails = await Promise.all(teacherGrades.map(async (teacherGrade) => {
                    const grade = await grade_model_1.GradeModel.findById(teacherGrade.gradeId);
                    return {
                        id: teacherGrade.id,
                        gradeId: teacherGrade.gradeId,
                        gradeName: grade?.name || 'Unknown Grade',
                        studyYear: teacherGrade.studyYear,
                        createdAt: teacherGrade.createdAt
                    };
                }));
                return {
                    ...sanitizedUser,
                    teacherGrades: gradesWithDetails,
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
                        locationConfidence: user.locationConfidence
                    }
                };
            }
            catch (error) {
                console.error('Error getting enhanced teacher data:', error);
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
                        locationConfidence: user.locationConfidence
                    }
                };
            }
        }
        if (user.userType === 'student') {
            try {
                const academicYearResponse = await academic_year_service_1.AcademicYearService.getActive();
                const activeAcademicYear = academicYearResponse.success ? academicYearResponse.data?.academicYear : null;
                const studentGrades = await student_grade_model_1.StudentGradeModel.findByStudentId(user.id);
                const filteredGrades = activeAcademicYear
                    ? studentGrades.filter(sg => sg.studyYear === activeAcademicYear.year)
                    : studentGrades;
                const gradesWithDetails = await Promise.all(filteredGrades.map(async (sg) => {
                    const grade = await grade_model_1.GradeModel.findById(sg.gradeId);
                    return {
                        id: sg.id,
                        gradeId: sg.gradeId,
                        gradeName: grade?.name || 'Unknown Grade',
                        studyYear: sg.studyYear,
                        createdAt: sg.createdAt
                    };
                }));
                return {
                    ...sanitizedUser,
                    studentGrades: gradesWithDetails,
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
                        locationConfidence: user.locationConfidence
                    }
                };
            }
            catch (error) {
                console.error('Error getting enhanced student data:', error);
                return {
                    ...sanitizedUser,
                    studentGrades: [],
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
                        locationConfidence: user.locationConfidence
                    }
                };
            }
        }
        return {
            ...sanitizedUser,
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
                locationConfidence: user.locationConfidence
            }
        };
    }
    static async updateProfile(userId, userType, profileData) {
        try {
            const user = await user_model_1.UserModel.findById(userId);
            if (!user) {
                return { success: false, message: 'المستخدم غير موجود', errors: ['المستخدم غير موجود'] };
            }
            let allowedFields;
            if (userType === 'teacher') {
                allowedFields = ['name', 'phone', 'bio', 'experience_years', 'latitude', 'longitude', 'address', 'formatted_address', 'country', 'city', 'state', 'zipcode', 'street_name', 'suburb', 'location_confidence'];
            }
            else if (userType === 'student') {
                allowedFields = ['name', 'student_phone', 'parent_phone', 'school_name', 'gender', 'birth_date', 'address'];
            }
            else {
                return { success: false, message: 'نوع المستخدم غير مدعوم', errors: ['نوع المستخدم غير مدعوم'] };
            }
            const filteredData = {};
            for (const [key, value] of Object.entries(profileData)) {
                if (allowedFields.includes(key)) {
                    filteredData[key] = value;
                }
            }
            try {
                const raw = profileData?.profileImageBase64;
                if (raw) {
                    const base64 = raw.startsWith('data:image/') ? raw : `data:image/jpeg;base64,${raw}`;
                    const oldPath = user?.profileImagePath || user?.profile_image_path;
                    if (oldPath) {
                        try {
                            await image_service_1.ImageService.deleteUserAvatar(oldPath);
                        }
                        catch (delErr) {
                            console.warn('delete avatar (updateProfile):', delErr);
                        }
                    }
                    const savedPath = await image_service_1.ImageService.saveUserAvatar(base64, `avatar_${user.id}`);
                    filteredData['profile_image_path'] = savedPath;
                }
            }
            catch (imgErr) {
                console.error('Failed processing profile avatar (updateProfile):', imgErr);
            }
            const updatedUser = await user_model_1.UserModel.update(userId, filteredData);
            if (!updatedUser) {
                return { success: false, message: 'فشل في تحديث بيانات المستخدم', errors: ['فشل في تحديث بيانات المستخدم'] };
            }
            return { success: true, message: 'تم تحديث البيانات بنجاح', data: { user: updatedUser } };
        }
        catch (error) {
            console.error('Error in updateProfile service:', error);
            return { success: false, message: 'حدث خطأ في الخادم', errors: ['حدث خطأ في الخادم'] };
        }
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map
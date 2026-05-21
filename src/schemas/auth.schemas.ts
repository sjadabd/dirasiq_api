// Zod schemas for /api/auth/*.
//
// Each schema corresponds to one route's body. Field-level error messages are
// Arabic-first (the product's default UI language). Use `.passthrough()` very
// sparingly — the default strict mode is what keeps client-supplied junk from
// bleeding into the service layer.
//
// Pattern note: when a service-layer call needs a value derived from another
// field (e.g. either `code` or `verificationToken`), the schema produces a
// canonical name (`code`) and the controller reads only that.

import { z } from 'zod';

// ---- Reusable building blocks ---------------------------------------------

// Zod 4 note: `required_error` and `invalid_type_error` from Zod 3 are gone.
// Use positional message strings (`z.string('msg')`) or attach messages on the
// specific validator (`.min(1, 'msg')` / `.email('msg')`).
export const emailSchema = z
  .string('البريد الإلكتروني مطلوب')
  .trim()
  .toLowerCase()
  .email('البريد الإلكتروني غير صحيح');

export const passwordWeakSchema = z
  .string('كلمة المرور مطلوبة')
  .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');

export const passwordStrongSchema = z
  .string('كلمة المرور مطلوبة')
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم');

export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام');

export const studyYearSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{4}$/, 'تنسيق السنة الدراسية غير صحيح');

export const uuidSchema = z.string().uuid('المعرف غير صالح');

export const userTypeSchema = z.enum(['teacher', 'student'], 'نوع المستخدم يجب أن يكون teacher أو student');

const phoneSchema = z
  .string()
  .min(10, 'رقم الهاتف يجب أن يحتوي على 10 إلى 15 رقم')
  .max(15, 'رقم الهاتف يجب أن يحتوي على 10 إلى 15 رقم');

const latitudeSchema = z.coerce
  .number()
  .min(-90, 'خط العرض غير صحيح')
  .max(90, 'خط العرض غير صحيح');

const longitudeSchema = z.coerce
  .number()
  .min(-180, 'خط الطول غير صحيح')
  .max(180, 'خط الطول غير صحيح');

const locationConfidenceSchema = z.coerce
  .number()
  .min(0, 'ثقة الموقع غير صحيحة')
  .max(1, 'ثقة الموقع غير صحيحة');

// Normalises Arabic-Indic digits and `dd/mm/yyyy` to an ISO date string. The
// legacy controllers ran a custom express-validator `body('birthDate').custom`
// to do exactly this; preserved here as a single transform so every endpoint
// that accepts a date gets the same coercion.
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalizeArabicNumbers = (s: string) =>
  s.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => ARABIC_DIGITS.indexOf(d).toString());

export const birthDateSchema = z
  .string()
  .transform((value, ctx) => {
    if (!value) return value;
    let normalized = normalizeArabicNumbers(value);
    if (normalized.includes('/')) {
      const [day, month, year] = normalized.split('/');
      if (day && month && year) {
        normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: 'custom',
        message: 'تنسيق تاريخ الميلاد غير صحيح',
      });
      return z.NEVER;
    }
    return date.toISOString();
  });

const genderSchema = z.enum(['male', 'female'], 'الجنس غير صحيح');

const oneSignalPlayerIdSchema = z.string().min(1, 'معرّف OneSignal غير صحيح');

const addressFieldsSchema = z.object({
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  formattedAddress: z.string().max(1000, 'العنوان طويل جداً').optional(),
  country: z.string().max(100, 'اسم البلد طويل جداً').optional(),
  city: z.string().max(100, 'اسم المدينة طويل جداً').optional(),
  state: z.string().max(100, 'اسم المحافظة طويل جداً').optional(),
  zipcode: z.string().max(20, 'الرمز البريدي طويل جداً').optional(),
  streetName: z.string().max(255, 'اسم الشارع طويل جداً').optional(),
  suburb: z.string().max(100, 'اسم الحي طويل جداً').optional(),
  locationConfidence: locationConfidenceSchema.optional(),
});

// ---- Endpoint schemas -----------------------------------------------------

export const registerSuperAdminSchema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب'),
  email: emailSchema,
  password: passwordWeakSchema,
});

export const registerTeacherSchema = addressFieldsSchema.extend({
  name: z.string().trim().min(1, 'الاسم مطلوب'),
  email: emailSchema,
  password: passwordWeakSchema,
  phone: z.string().min(1, 'رقم الهاتف مطلوب'),
  address: z.string().min(1, 'العنوان مطلوب'),
  bio: z.string().min(1, 'النبذة الشخصية مطلوبة'),
  experienceYears: z.coerce.number().int().min(0, 'سنوات الخبرة مطلوبة'),
  visitorId: z.string().optional(),
  deviceInfo: z.string().optional(),
  gradeIds: z.array(uuidSchema).min(1, 'معرف الصف مطلوب'),
  studyYear: studyYearSchema,
  referralCode: z.string().optional(),
});

export const registerStudentSchema = addressFieldsSchema.extend({
  name: z.string().trim().min(1, 'الاسم مطلوب'),
  email: emailSchema,
  password: passwordWeakSchema,
  studentPhone: phoneSchema.optional(),
  parentPhone: phoneSchema.optional(),
  schoolName: z.string().max(255, 'اسم المدرسة طويل جداً').optional(),
  gender: genderSchema.optional(),
  birthDate: birthDateSchema.optional(),
  gradeId: uuidSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
  oneSignalPlayerId: oneSignalPlayerIdSchema.nullish(),
});

// verifyEmail / resetPassword historically accepted both `code` and
// `verificationToken` / `resetToken`. Preserved via union → preprocess to a
// canonical `code` field so handlers only deal with one name.
export const verifyEmailSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema.optional(),
    verificationToken: otpCodeSchema.optional(),
  })
  .transform((val, ctx) => {
    const code = val.code ?? val.verificationToken;
    if (!code) {
      ctx.addIssue({
        code: 'custom',
        message: 'رمز التحقق مطلوب',
        path: ['code'],
      });
      return z.NEVER;
    }
    return { email: val.email, code };
  });

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema.optional(),
    resetToken: otpCodeSchema.optional(),
    newPassword: passwordStrongSchema,
  })
  .transform((val, ctx) => {
    const code = val.code ?? val.resetToken;
    if (!code) {
      ctx.addIssue({
        code: 'custom',
        message: 'رمز إعادة التعيين مطلوب',
        path: ['code'],
      });
      return z.NEVER;
    }
    return { email: val.email, code, newPassword: val.newPassword };
  });

export const googleAuthSchema = z
  .object({
    googleToken: z.string().optional(),
    googleData: z.record(z.string(), z.unknown()).optional(),
    userType: userTypeSchema,
    referralCode: z.string().optional(),
    // `nullish()` accepts both `undefined` AND `null` — clients (Flutter +
    // dashboard) send `null` when OneSignal hasn't initialised yet or the
    // user denied push permission; `.optional()` alone would reject `null`.
    oneSignalPlayerId: z.string().nullish(),
  })
  .refine((v) => v.googleToken || v.googleData, {
    message: 'مطلوب إما Google token أو Google data',
    path: ['googleToken'],
  });

export const appleAuthSchema = z.object({
  identityToken: z.string().min(1, 'identityToken is required'),
  authorizationCode: z.string().optional(),
  userType: userTypeSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  // Same nullish posture as googleAuthSchema for parity.
  oneSignalPlayerId: z.string().nullish(),
});

// Profile completion / update — separate schemas per role. The controller
// picks the right schema based on `req.user.userType` after auth.
const teacherProfileBaseSchema = addressFieldsSchema.extend({
  name: z.string().min(1, 'الاسم مطلوب'),
  phone: z.string().min(1, 'رقم الهاتف مطلوب'),
  bio: z.string().min(1, 'النبذة الشخصية مطلوبة'),
  experienceYears: z.coerce.number().int().min(0, 'سنوات الخبرة مطلوبة'),
  gradeIds: z.array(uuidSchema).min(1, 'معرف الصف مطلوب'),
  studyYear: studyYearSchema,
  address: z.string().max(1000, 'العنوان طويل جداً').optional(),
  gender: genderSchema.optional(),
  birthDate: birthDateSchema.optional(),
});

// completeProfile requires latitude/longitude (the OAuth flow needs them); the
// reusable addressFields makes them optional, so override here.
export const completeProfileTeacherSchema = teacherProfileBaseSchema.extend({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const updateProfileTeacherSchema = teacherProfileBaseSchema;

const studentProfileBaseSchema = addressFieldsSchema.extend({
  name: z.string().min(1, 'الاسم مطلوب').optional(),
  studentPhone: z.string().min(1, 'رقم الهاتف مطلوب'),
  parentPhone: z.string().min(1, 'رقم الهاتف مطلوب'),
  schoolName: z.string().max(255, 'اسم المدرسة طويل جداً').optional(),
  gender: genderSchema.optional(),
  birthDate: birthDateSchema.optional(),
  gradeId: uuidSchema.optional(),
  studyYear: studyYearSchema.optional(),
  address: z.string().max(1000, 'العنوان طويل جداً').optional(),
});

export const completeProfileStudentSchema = studentProfileBaseSchema.extend({
  gradeId: uuidSchema,
  studyYear: studyYearSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});

export const updateProfileStudentSchema = studentProfileBaseSchema.extend({
  name: z.string().min(1, 'الاسم مطلوب'),
  schoolName: z.string().min(1, 'اسم المدرسة مطلوب'),
  gender: genderSchema,
});

// ---- Inferred TypeScript types --------------------------------------------

export type RegisterSuperAdminInput = z.infer<typeof registerSuperAdminSchema>;
export type RegisterTeacherInput = z.infer<typeof registerTeacherSchema>;
export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type AppleAuthInput = z.infer<typeof appleAuthSchema>;

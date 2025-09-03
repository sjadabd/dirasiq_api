// Arabic messages for the application
export const Messages = {
  // Authentication messages
  AUTH: {
    SUPER_ADMIN_REGISTERED: 'تم تسجيل السوبر أدمن بنجاح',
    TEACHER_REGISTERED: 'تم تسجيل المعلم بنجاح. يرجى التحقق من بريدك الإلكتروني للتفعيل',
    STUDENT_REGISTERED: 'تم تسجيل الطالب بنجاح. يرجى التحقق من بريدك الإلكتروني للتفعيل',
    LOGIN_SUCCESS: 'تم تسجيل الدخول بنجاح',
    LOGOUT_SUCCESS: 'تم تسجيل الخروج بنجاح',
    EMAIL_VERIFIED: 'تم التحقق من البريد الإلكتروني بنجاح',
    VERIFICATION_CODE_SENT: 'تم إرسال رمز التحقق بنجاح',
    PASSWORD_RESET_CODE_SENT: 'تم إرسال رمز إعادة تعيين كلمة المرور بنجاح',
    PASSWORD_RESET_SUCCESS: 'تم إعادة تعيين كلمة المرور بنجاح',

    // Error messages
    SUPER_ADMIN_EXISTS: 'السوبر أدمن موجود بالفعل',
    EMAIL_ALREADY_REGISTERED: 'البريد الإلكتروني مسجل بالفعل',
    INVALID_CREDENTIALS: 'بيانات الدخول غير صحيحة',
    ACCOUNT_NOT_ACTIVE: 'الحساب غير مفعل',
    EMAIL_NOT_VERIFIED: 'يرجى التحقق من بريدك الإلكتروني أولاً',
    INVALID_TOKEN: 'الرمز غير صحيح',
    TOKEN_EXPIRED: 'انتهت صلاحية الرمز',
    USER_NOT_FOUND: 'المستخدم غير موجود',
    ACCOUNT_NOT_ACTIVE_ERROR: 'الحساب غير مفعل، يرجى التحقق من بريدك الإلكتروني أو التواصل مع الدعم',
    VERIFICATION_FAILED: 'فشل في التحقق من البريد الإلكتروني',
    RESET_CODE_INVALID: 'رمز إعادة التعيين غير صحيح أو منتهي الصلاحية',
    PASSWORD_RESET_FAILED: 'فشل في إعادة تعيين كلمة المرور',
    EMAIL_SEND_FAILED: 'فشل في إرسال البريد الإلكتروني',
    TOKEN_REQUIRED: 'الرمز مطلوب',
    NO_TOKEN_PROVIDED: 'لم يتم توفير رمز',
    TOKEN_NOT_FOUND: 'الرمز غير موجود أو منتهي الصلاحية',
    TOKEN_VERIFICATION_FAILED: 'فشل في التحقق من الرمز',
    USER_DOES_NOT_EXIST: 'المستخدم غير موجود',
    USER_ACCOUNT_NOT_ACTIVE: 'حساب المستخدم غير مفعل',
    JWT_SECRET_NOT_CONFIGURED: 'مفتاح JWT غير مُعد',
    AUTHENTICATION_FAILED: 'فشل في المصادقة',
    ACCESS_DENIED: 'تم رفض الوصول',
    SUPER_ADMIN_ACCESS_REQUIRED: 'يتطلب وصول السوبر أدمن',
    TEACHER_ACCESS_REQUIRED: 'يتطلب وصول المعلم',
    STUDENT_ACCESS_REQUIRED: 'يتطلب وصول الطالب',
    AUTHENTICATION_REQUIRED: 'المصادقة مطلوبة',
    USER_NOT_AUTHENTICATED: 'المستخدم غير مصادق عليه'
  },

  // Academic Year messages
  ACADEMIC_YEAR: {
    CREATED: 'تم إنشاء السنة الدراسية بنجاح',
    UPDATED: 'تم تحديث السنة الدراسية بنجاح',
    DELETED: 'تم حذف السنة الدراسية بنجاح',
    ACTIVATED: 'تم تفعيل السنة الدراسية بنجاح',
    DEACTIVATED: 'تم إلغاء تفعيل السنة الدراسية بنجاح',
    NOT_FOUND: 'السنة الدراسية غير موجودة',
    ALREADY_EXISTS: 'السنة الدراسية موجودة بالفعل',
    INVALID_FORMAT: 'تنسيق السنة الدراسية غير صحيح (يجب أن يكون YYYY-YYYY)',
    CANNOT_DELETE_ACTIVE: 'لا يمكن حذف السنة الدراسية المفعلة',
    NO_ACTIVE_YEAR: 'لا توجد سنة دراسية مفعلة',
    YEAR_REQUIRED: 'السنة الدراسية مطلوبة',
    YEAR_MIN_LENGTH: 'السنة الدراسية يجب أن تكون 9 أحرف',
    YEAR_MAX_LENGTH: 'السنة الدراسية يجب أن تكون 9 أحرف',
    YEAR_PATTERN: 'السنة الدراسية يجب أن تكون بالتنسيق YYYY-YYYY'
  },
  SUBJECT: {
    CREATED: 'تم إنشاء المادة الدراسية بنجاح',
    UPDATED: 'تم تحديث المادة الدراسية بنجاح',
    DELETED: 'تم حذف المادة الدراسية بنجاح',
    NOT_FOUND: 'المادة الدراسية غير موجودة',
    ALREADY_EXISTS: 'المادة الدراسية موجودة بالفعل',
    NAME_REQUIRED: 'اسم المادة مطلوب',
    DESCRIPTION_REQUIRED: 'وصف المادة مطلوب',
    TEACHER_NOT_FOUND: 'المعلم غير موجود',
    UNAUTHORIZED: 'غير مصرح لك بالوصول لهذه المادة الدراسية'
  },
  GRADE: {
    CREATED: 'تم إنشاء المرحلة الدراسية بنجاح',
    UPDATED: 'تم تحديث المرحلة الدراسية بنجاح',
    DELETED: 'تم حذف المرحلة الدراسية بنجاح',
    NOT_FOUND: 'المرحلة الدراسية غير موجودة',
    ALREADY_EXISTS: 'المرحلة الدراسية موجودة بالفعل',
    NAME_REQUIRED: 'اسم المرحلة مطلوب',
    DESCRIPTION_REQUIRED: 'وصف المرحلة مطلوب',
    IS_ACTIVE_REQUIRED: 'حالة التفعيل مطلوبة',
    INVALID_IS_ACTIVE: 'حالة التفعيل يجب أن تكون true أو false',
    UNAUTHORIZED: 'غير مصرح لك بالوصول لهذه المرحلة الدراسية',
    SUPER_ADMIN_ACCESS_REQUIRED: 'يتطلب وصول السوبر أدمن'
  },
  COURSE: {
    CREATED: 'تم إنشاء الكورس بنجاح',
    UPDATED: 'تم تحديث الكورس بنجاح',
    DELETED: 'تم حذف الكورس بنجاح',
    NOT_FOUND: 'الكورس غير موجود',
    ALREADY_EXISTS: 'الكورس موجود بالفعل',
    NAME_REQUIRED: 'اسم الكورس مطلوب',
    STUDY_YEAR_REQUIRED: 'السنة الدراسية مطلوبة',
    GRADE_REQUIRED: 'المرحلة الدراسية مطلوبة',
    SUBJECT_REQUIRED: 'المادة الدراسية مطلوبة',
    START_DATE_REQUIRED: 'تاريخ البداية مطلوب',
    END_DATE_REQUIRED: 'تاريخ النهاية مطلوب',
    PRICE_REQUIRED: 'السعر مطلوب',
    SEATS_COUNT_REQUIRED: 'عدد المقاعد مطلوب',
    INVALID_DATE_RANGE: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية',
    INVALID_STUDY_YEAR: 'صيغة السنة الدراسية غير صحيحة',
    INVALID_PRICE: 'السعر يجب أن يكون أكبر من أو يساوي صفر',
    INVALID_SEATS_COUNT: 'عدد المقاعد يجب أن يكون أكبر من صفر',
    GRADE_NOT_FOUND: 'المرحلة الدراسية غير موجودة',
    SUBJECT_NOT_FOUND: 'المادة الدراسية غير موجودة',
    GRADE_NOT_OWNED: 'المرحلة الدراسية لا تخصك',
    SUBJECT_NOT_OWNED: 'المادة الدراسية لا تخصك',
    TEACHER_NOT_FOUND: 'المعلم غير موجود',
    UNAUTHORIZED: 'غير مصرح لك بالوصول لهذا الكورس',
    IMAGE_PROCESSING_ERROR: 'خطأ في معالجة الصور'
  },

  // Student messages
  STUDENT: {
    CREATED: 'تم إنشاء حساب الطالب بنجاح',
    UPDATED: 'تم تحديث بيانات الطالب بنجاح',
    DELETED: 'تم حذف حساب الطالب بنجاح',
    NOT_FOUND: 'الطالب غير موجود',
    ALREADY_EXISTS: 'الطالب موجود بالفعل',
    REGISTRATION_SUCCESS: 'تم تسجيل الطالب بنجاح. يرجى التحقق من بريدك الإلكتروني للتفعيل',
    VERIFICATION_SUCCESS: 'تم التحقق من حساب الطالب بنجاح',
    VERIFICATION_FAILED: 'فشل في التحقق من حساب الطالب',
    ACCOUNT_ACTIVATED: 'تم تفعيل حساب الطالب بنجاح',
    ACCOUNT_DEACTIVATED: 'تم إلغاء تفعيل حساب الطالب',
    UNAUTHORIZED: 'غير مصرح لك بالوصول لبيانات هذا الطالب',
    INVALID_PHONE_FORMAT: 'تنسيق رقم الهاتف غير صحيح',
    INVALID_PARENT_PHONE_FORMAT: 'تنسيق رقم هاتف ولي الأمر غير صحيح',
    SCHOOL_NAME_TOO_LONG: 'اسم المدرسة طويل جداً (الحد الأقصى 255 حرف)',
    PHONE_ALREADY_EXISTS: 'رقم الهاتف مسجل بالفعل',
    PARENT_PHONE_ALREADY_EXISTS: 'رقم هاتف ولي الأمر مسجل بالفعل',
    BIRTH_DATE_REQUIRED: 'تاريخ الميلاد مطلوب',
    INVALID_BIRTH_DATE_FORMAT: 'تنسيق تاريخ الميلاد غير صحيح (يجب أن يكون YYYY-MM-DD)',
    STUDENT_TOO_YOUNG: 'عمر الطالب يجب أن يكون 5 سنوات على الأقل',
    STUDENT_TOO_OLD: 'عمر الطالب يجب أن يكون 25 سنة على الأكثر',
    GRADE_ID_REQUIRED: 'معرف المرحلة مطلوب',
    STUDY_YEAR_REQUIRED: 'السنة الدراسية مطلوبة',
    INVALID_STUDY_YEAR_FORMAT: 'تنسيق السنة الدراسية غير صحيح (يجب أن يكون YYYY-YYYY)',
    GRADE_NOT_FOUND: 'المرحلة الدراسية غير موجودة'
  },

  // Validation messages
  VALIDATION: {
    VALID_EMAIL_REQUIRED: 'البريد الإلكتروني الصحيح مطلوب',
    PASSWORD_REQUIRED: 'كلمة المرور مطلوبة',
    NAME_REQUIRED: 'الاسم مطلوب',
    PHONE_REQUIRED: 'رقم الهاتف مطلوب',
    ADDRESS_REQUIRED: 'العنوان مطلوب',
    BIO_REQUIRED: 'السيرة الذاتية مطلوبة',
    EXPERIENCE_YEARS_REQUIRED: 'سنوات الخبرة مطلوبة',
    STUDENT_PHONE_REQUIRED: 'رقم هاتف الطالب مطلوب',
    PARENT_PHONE_REQUIRED: 'رقم هاتف ولي الأمر مطلوب',
    SCHOOL_NAME_REQUIRED: 'اسم المدرسة مطلوب',
    GENDER_REQUIRED: 'الجنس مطلوب',
    INVALID_GENDER: 'الجنس يجب أن يكون ذكر أو أنثى',
    INVALID_BIRTH_DATE: 'تاريخ الميلاد غير صحيح',
    BIRTH_DATE_FUTURE: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل',
    VERIFICATION_CODE_REQUIRED: 'رمز التحقق مطلوب',
    VERIFICATION_CODE_6_DIGITS: 'رمز التحقق يجب أن يكون 6 أرقام',
    RESET_CODE_REQUIRED: 'رمز إعادة التعيين مطلوب',
    RESET_CODE_6_DIGITS: 'رمز إعادة التعيين يجب أن يكون 6 أرقام',
    NEW_PASSWORD_REQUIRED: 'كلمة المرور الجديدة مطلوبة',
    PASSWORD_MIN_LENGTH: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
    PASSWORD_COMPLEXITY: 'كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم واحد على الأقل',
    EMAIL_ALREADY_EXISTS: 'البريد الإلكتروني موجود بالفعل',
    WEAK_PASSWORD: 'كلمة المرور ضعيفة جداً'
  },

  // Server messages
  SERVER: {
    INTERNAL_ERROR: 'خطأ داخلي في الخادم',
    SOMETHING_WENT_WRONG: 'حدث خطأ ما',
    ROUTE_NOT_FOUND: 'المسار غير موجود',
    TOO_MANY_REQUESTS: 'عدد الطلبات كبير جداً من هذا العنوان',
    TRY_AGAIN_LATER: 'يرجى المحاولة مرة أخرى لاحقاً',
    SERVER_RUNNING: 'الخادم يعمل',
    DATABASE_INITIALIZED: 'تم تهيئة قاعدة البيانات بنجاح',
    DATABASE_INIT_FAILED: 'فشل في تهيئة قاعدة البيانات',
    CONNECTION_SUCCESS: 'تم الاتصال بقاعدة البيانات PostgreSQL بنجاح',
    CONNECTION_ERROR: 'خطأ غير متوقع في الاتصال بقاعدة البيانات'
  },

  // Database messages
  DATABASE: {
    INITIALIZATION_STARTED: 'بدء تهيئة قاعدة البيانات...',
    MIGRATION_FILES_FOUND: 'تم العثور على ملفات الترحيل',
    MIGRATION_EXECUTED: 'تم تنفيذ الترحيل بنجاح',
    INITIALIZATION_COMPLETED: 'تم إكمال تهيئة قاعدة البيانات بنجاح',
    INITIALIZATION_FAILED: 'فشل في تهيئة قاعدة البيانات'
  },

  // General messages
  GENERAL: {
    SUCCESS: 'تمت العملية بنجاح',
    FAILED: 'فشلت العملية',
    NOT_FOUND: 'غير موجود',
    UNAUTHORIZED: 'غير مصرح',
    FORBIDDEN: 'ممنوع',
    BAD_REQUEST: 'طلب سيء',
    VALIDATION_FAILED: 'فشل في التحقق من صحة البيانات',
    OPERATION_COMPLETED: 'تم إكمال العملية بنجاح',
    OPERATION_FAILED: 'فشلت العملية',
    DATA_NOT_FOUND: 'البيانات غير موجودة',
    INVALID_INPUT: 'بيانات الإدخال غير صحيحة',
    REQUIRED_FIELD: 'هذا الحقل مطلوب',
    INVALID_FORMAT: 'التنسيق غير صحيح'
  }
};

// Helper function to get message with fallback
export function getMessage(key: string, fallback?: string): string {
  const keys = key.split('.');
  let message: any = Messages;

  for (const k of keys) {
    if (message && typeof message === 'object' && k in message) {
      message = message[k];
    } else {
      return fallback || key;
    }
  }

  return typeof message === 'string' ? message : (fallback || key);
}

export enum UserType {
  SUPER_ADMIN = 'super_admin',
  TEACHER = 'teacher',
  STUDENT = 'student'
}

export enum UserStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended'
}

export enum ReservationStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL = 'partial',
  REFUNDED = 'refunded'
}

export enum BookingStatus {
  PENDING = 'pending',
  PRE_APPROVED = 'pre_approved',
  CONFIRMED = 'confirmed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female'
}

export interface BaseUser {
  id: string;
  name: string;
  email: string;
  password: string;
  userType: UserType;
  status: UserStatus;
  // Auth provider tracking
  authProvider?: 'email' | 'google';
  oauthProviderId?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  country?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  streetName?: string;
  suburb?: string;
  locationConfidence?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuperAdmin extends BaseUser {
  userType: UserType.SUPER_ADMIN;
}

export interface Teacher extends BaseUser {
  userType: UserType.TEACHER;
  phone: string;
  address: string;
  bio: string;
  experienceYears: number;
  visitorId?: string;
  deviceInfo?: string;
  gender?: Gender;
  birthDate?: Date;
}

export interface Student extends BaseUser {
  userType: UserType.STUDENT;
  studentPhone?: string;
  parentPhone?: string;
  schoolName?: string;
  gender?: Gender;
  birthDate?: Date;
  teacherId?: string;
}

export type User = SuperAdmin | Teacher | Student;

export interface Token {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  oneSignalPlayerId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  oneSignalPlayerId: string;
}

export interface GoogleAuthRequest {
  googleData: {
    iss: string;
    azp: string;
    aud: string;
    sub: string;
    email: string;
    email_verified: boolean;
    nbf: number;
    name: string;
    picture: string;
    given_name: string;
    family_name: string;
    iat: number;
    exp: number;
    jti: string;
  };
  userType: 'teacher' | 'student';
}

export interface RegisterTeacherRequest {
  name: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  bio: string;
  experienceYears: number;
  visitorId?: string;
  deviceInfo?: string;
  gradeIds: string[];
  studyYear: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  country?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  streetName?: string;
  suburb?: string;
  locationConfidence?: number;
}

export interface RegisterStudentRequest {
  name: string;
  email: string;
  password: string;
  studentPhone?: string;
  parentPhone?: string;
  schoolName?: string;
  gender?: Gender;
  birthDate?: string;
  gradeId: string;
  studyYear: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  country?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  streetName?: string;
  suburb?: string;
  locationConfidence?: number;
}

// Student-Course relationship types
export interface StudentCourse {
  id: string;
  studentId: string;
  courseId: string;
  studyYear: string;
  reservationAmount: number;
  reservationStatus: ReservationStatus;
  coursePrice: number;
  createdAt: Date;
  updatedAt: Date;
}

// Extended Request type for authentication
export interface AuthenticatedRequest {
  user?: {
    id: string;
    userType: UserType;
  };
}

export interface CreateStudentCourseRequest {
  studentId: string;
  courseId: string;
  studyYear: string;
  reservationAmount: number;
  reservationStatus: ReservationStatus;
  coursePrice: number;
}

export interface UpdateStudentCourseRequest {
  studyYear?: string;
  reservationAmount?: number;
  reservationStatus?: ReservationStatus;
  coursePrice?: number;
}

// Student Grade types
export interface StudentGrade {
  id: string;
  studentId: string;
  gradeId: string;
  studyYear: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStudentGradeRequest {
  studentId: string;
  gradeId: string;
  studyYear: string;
}

export interface UpdateStudentGradeRequest {
  gradeId?: string;
  studyYear?: string;
  isActive?: boolean;
}

// Subscription Package types
export interface SubscriptionPackage {
  id: string;
  name: string;
  description?: string;
  maxStudents: number;
  price: number;
  durationDays: number;
  isFree: boolean;
  isActive: boolean;
  current: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSubscriptionPackageRequest {
  name: string;
  description?: string;
  maxStudents: number;
  price: number;
  durationDays: number;
  isFree?: boolean;
}

export interface UpdateSubscriptionPackageRequest {
  name?: string;
  description?: string;
  maxStudents?: number;
  price?: number;
  durationDays?: number;
  isFree?: boolean;
  isActive?: boolean;
}

// Teacher Grade types
export interface TeacherGrade {
  id: string;
  teacherId: string;
  gradeId: string;
  studyYear: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeacherGradeRequest {
  teacherId: string;
  gradeId: string;
  studyYear: string;
}

export interface UpdateTeacherGradeRequest {
  gradeId?: string;
  studyYear?: string;
  isActive?: boolean;
}

export interface RegisterSuperAdminRequest {
  name: string;
  email: string;
  password: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: string[];
  count?: number;
  // Optional pagination object for list endpoints that return top-level pagination
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  // Optional summary/aggregates object when endpoints include computed totals
  summary?: any;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: {
    key: string;
    order: 'asc' | 'desc';
  };
  deleted?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Academic Year types
export interface AcademicYear {
  id: string;
  year: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAcademicYearRequest {
  year: string;
}

export interface UpdateAcademicYearRequest {
  year?: string;
  is_active?: boolean;
}

// Subject types
export interface Subject {
  id: string;
  teacher_id: string;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
  is_deleted: boolean;
}

export interface CreateSubjectRequest {
  name: string;
  description?: string;
}

export interface UpdateSubjectRequest {
  name?: string;
  description?: string;
}

// Grade types
export interface Grade {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGradeRequest {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateGradeRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

// Course types
export interface Course {
  id: string;
  teacher_id: string;
  study_year: string;
  grade_id: string;
  subject_id: string;
  course_name: string;
  course_images: string[];
  description?: string;
  start_date: string;
  end_date: string;
  price: number;
  seats_count: number;
  has_reservation: boolean;
  reservation_amount?: number | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCourseRequest {
  study_year: string;
  grade_id: string;
  subject_id: string;
  course_name: string;
  course_images?: string[]; // Base64 images
  description?: string;
  start_date: string;
  end_date: string;
  price: number;
  seats_count: number;
  has_reservation?: boolean;
  reservation_amount?: number | null; // required if has_reservation is true
}

export interface UpdateCourseRequest {
  study_year?: string;
  grade_id?: string;
  subject_id?: string;
  course_name?: string;
  course_images?: string[]; // Base64 images or existing paths
  description?: string;
  start_date?: string;
  end_date?: string;
  price?: number;
  seats_count?: number;
  has_reservation?: boolean;
  reservation_amount?: number | null;
}

export interface TeacherSubscription {
  id: string;
  teacherId: string;
  subscriptionPackageId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  currentStudents: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateTeacherSubscriptionRequest {
  teacherId: string;
  subscriptionPackageId: string;
  startDate: Date;
  endDate: Date;
}

export interface UpdateTeacherSubscriptionRequest {
  subscriptionPackageId?: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
  deletedAt?: Date;
}

// =====================================================
// Course Booking System Types
// =====================================================

// Course Booking types
export interface CourseBooking {
  id: string;
  studentId: string;
  courseId: string;
  teacherId: string;
  studyYear: string;
  status: BookingStatus;
  bookingDate: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  rejectionReason?: string;
  cancellationReason?: string;
  studentMessage?: string;
  teacherResponse?: string;
  // Indicates who rejected the booking
  rejectedBy?: 'student' | 'teacher';
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  cancelledBy?: 'student' | 'teacher';
  reactivatedAt?: Date;
}

export interface CreateCourseBookingRequest {
  courseId: string;
  studentMessage?: string;
}

export interface UpdateCourseBookingRequest {
  status?: BookingStatus;
  rejectionReason?: string;
  cancellationReason?: string;
  teacherResponse?: string;
  // For confirmation flow: whether reservation deposit has been paid
  reservationPaid?: boolean;
}

export interface CourseBookingWithDetails extends CourseBooking {
  student: {
    id: string;
    name: string;
    email: string;
  };
  course: {
    id: string;
    courseName: string;
    courseImages: string[];
    description: string;
    startDate: Date;
    endDate: Date;
    price: number;
    seatsCount: number;
    hasReservation?: boolean;
    reservationAmount?: number | null;
  };
  teacher: {
    id: string;
    name: string;
    email: string;
  };
}

// =====================================================
// Course Enrollment System Types
// =====================================================

// Enrollment Request Status
export enum EnrollmentRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

// Enrollment Status
export enum EnrollmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended'
}

// Invoice Status
export enum InvoiceStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled'
}

// Invoice Type
export enum InvoiceType {
  RESERVATION = 'reservation',
  COURSE = 'course',
  INSTALLMENT = 'installment',
  PENALTY = 'penalty'
}

// Installment Status
export enum InstallmentStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue'
}

// Payment Method
export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CREDIT_CARD = 'credit_card',
  MOBILE_PAYMENT = 'mobile_payment'
}

// Course Enrollment Request
export interface CourseEnrollmentRequest {
  id: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  studyYear: string;
  requestStatus: EnrollmentRequestStatus;
  studentMessage?: string;
  teacherResponse?: string;
  requestedAt: Date;
  respondedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateEnrollmentRequestRequest {
  courseId: string;
  studyYear: string;
  studentMessage?: string;
}

export interface UpdateEnrollmentRequestRequest {
  requestStatus?: EnrollmentRequestStatus;
  teacherResponse?: string;
}

export interface EnrollmentRequestResponse {
  id: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  studyYear: string;
  requestStatus: EnrollmentRequestStatus;
  studentMessage?: string;
  teacherResponse?: string;
  requestedAt: Date;
  respondedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;

  // Related data
  student: {
    id: string;
    name: string;
    email: string;
  };
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  course: {
    id: string;
    courseName: string;
    courseImages: string[];
    description?: string;
    startDate: string;
    endDate: string;
    price: number;
    seatsCount: number;
  };
}

// Student Course Enrollment
export interface StudentCourseEnrollment {
  id: string;
  enrollmentRequestId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  teacherSubscriptionId: string;
  studyYear: string;
  enrollmentStatus: EnrollmentStatus;
  enrollmentDate: Date;
  courseStartDate: string;
  courseEndDate: string;
  totalCourseAmount: number;
  reservationAmount: number;
  remainingAmount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateEnrollmentRequest {
  enrollmentRequestId: string;
  courseStartDate: string;
  courseEndDate: string;
  totalCourseAmount: number;
  reservationAmount?: number;
}

export interface UpdateEnrollmentRequest {
  enrollmentStatus?: EnrollmentStatus;
  courseStartDate?: string;
  courseEndDate?: string;
  totalCourseAmount?: number;
  reservationAmount?: number;
}

export interface EnrollmentResponse {
  id: string;
  enrollmentRequestId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  teacherSubscriptionId: string;
  studyYear: string;
  enrollmentStatus: EnrollmentStatus;
  enrollmentDate: Date;
  courseStartDate: string;
  courseEndDate: string;
  totalCourseAmount: number;
  reservationAmount: number;
  remainingAmount: number;
  createdAt: Date;
  updatedAt: Date;

  // Related data
  student: {
    id: string;
    name: string;
    email: string;
  };
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  course: {
    id: string;
    courseName: string;
    price: number;
    startDate: string;
    endDate: string;
  };
  subscription: {
    id: string;
    packageName: string;
    maxStudents: number;
  };
}

// Course Invoice
export interface CourseInvoice {
  id: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  invoiceStatus: InvoiceStatus;
  invoiceDate: Date;
  dueDate: Date;
  paidDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateInvoiceRequest {
  enrollmentId: string;
  invoiceType: InvoiceType;
  amountDue: number;
  dueDate: string;
  notes?: string;
}

export interface UpdateInvoiceRequest {
  amountPaid?: number;
  dueDate?: string;
  notes?: string;
}

export interface InvoiceResponse {
  id: string;
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  invoiceStatus: InvoiceStatus;
  invoiceDate: Date;
  dueDate: Date;
  paidDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;

  // Related data
  student: {
    id: string;
    name: string;
    email: string;
  };
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  course: {
    id: string;
    courseName: string;
    price: number;
  };
  installments?: PaymentInstallment[];
}

// Payment Installment
export interface PaymentInstallment {
  id: string;
  invoiceId: string;
  installmentNumber: number;
  installmentAmount: number;
  amountPaid: number;
  dueDate: string;
  paidDate?: string;
  installmentStatus: InstallmentStatus;
  paymentMethod?: PaymentMethod;
  paymentNotes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateInstallmentRequest {
  invoiceId: string;
  installmentNumber: number;
  installmentAmount: number;
  dueDate: string;
}

export interface UpdateInstallmentRequest {
  amountPaid?: number;
  dueDate?: string;
  paymentMethod?: PaymentMethod;
  paymentNotes?: string;
}

export interface InstallmentResponse {
  id: string;
  invoiceId: string;
  installmentNumber: number;
  installmentAmount: number;
  amountPaid: number;
  dueDate: string;
  paidDate?: string;
  installmentStatus: InstallmentStatus;
  paymentMethod?: PaymentMethod;
  paymentNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Teacher Dashboard Data
export interface TeacherDashboardData {
  totalStudents: number;
  maxStudentsAllowed: number;
  canAddMoreStudents: boolean;
  activeEnrollments: number;
  pendingRequests: number;
  totalRevenue: number;
  pendingPayments: number;
  recentEnrollments: EnrollmentResponse[];
  recentInvoices: InvoiceResponse[];
}

// Student Dashboard Data
export interface StudentDashboardData {
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  pendingRequests: number;
  totalSpent: number;
  pendingPayments: number;
  recentEnrollments: EnrollmentResponse[];
  recentInvoices: InvoiceResponse[];
}

// Bulk Operations
export interface BulkInvoiceCreationRequest {
  enrollmentIds: string[];
  invoiceType: InvoiceType;
  amountDue: number;
  dueDate: string;
  notes?: string;
  installments?: {
    installmentNumber: number;
    dueDate: string;
    notes?: string;
    installments?: {
      installmentNumber: number;
      installmentAmount: number;
      dueDate: string;
    }[];
  }
}

export interface BulkInvoiceCreationResponse {
  success: boolean;
  createdInvoices: InvoiceResponse[];
  errors: string[];
}

// =====================================================
// Reservation Payments (Booking Deposit) Types
// =====================================================

export type ReservationPaymentStatus = 'pending' | 'paid';

export interface ReservationPayment {
  id: string;
  bookingId: string;
  studentId: string;
  teacherId: string;
  courseId: string;
  amount: number;
  status: ReservationPaymentStatus;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherReservationPaymentsReportItem {
  bookingId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  amount: number;
  status: ReservationPaymentStatus;
  paidAt?: Date;
}

export interface TeacherReservationPaymentsReportResponse {
  teacherId: string;
  studyYear: string;
  totalPaid: number;
  totalPending: number;
  items: TeacherReservationPaymentsReportItem[];
}

// News platform type
export enum NewsType {
  WEB = 'web',
  MOBILE = 'mobile',
  WEB_AND_MOBILE = 'web_and_mobile'
}

export interface News {
  id: string;
  title: string;
  imageUrl?: string;
  details: string;
  newsType: NewsType;
  isActive: boolean;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateNewsRequest {
  title: string;
  imageUrl?: string;
  details: string;
  newsType?: NewsType; // default WEB_AND_MOBILE if not provided
}

export interface UpdateNewsRequest {
  title?: string;
  imageUrl?: string;
  details?: string;
  newsType?: NewsType;
  isActive?: boolean;
}

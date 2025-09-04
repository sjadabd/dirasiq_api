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
  latitude?: number;
  longitude?: number;
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
}

export interface LoginRequest {
  email: string;
  password: string;
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
}

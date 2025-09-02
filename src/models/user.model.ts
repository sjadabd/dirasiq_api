import pool from '@/config/database';
import { Student, SuperAdmin, Teacher, User, UserStatus, UserType } from '@/types';
import bcrypt from 'bcryptjs';

export class UserModel {
  // Create a new user
  static async create(userData: Partial<User>): Promise<User> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Hash password
      const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
      const hashedPassword = await bcrypt.hash(userData.password!, saltRounds);

      const query = `
        INSERT INTO users (
          name, email, password, user_type, status,
          phone, address, bio, experience_years, visitor_id, device_info,
          student_phone, parent_phone, school_name, gender, birth_date,
          email_verified, verification_code, verification_code_expires
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
      `;

      const values = [
        userData.name,
        userData.email,
        hashedPassword,
        userData.userType,
        userData.status || UserStatus.PENDING,
        userData.userType === UserType.TEACHER ? (userData as Teacher).phone : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).address : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).bio : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).experienceYears : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).visitorId : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).deviceInfo : null,
        userData.userType === UserType.STUDENT ? (userData as Student).studentPhone : null,
        userData.userType === UserType.STUDENT ? (userData as Student).parentPhone : null,
        userData.userType === UserType.STUDENT ? (userData as Student).schoolName : null,
        userData.userType === UserType.STUDENT ? (userData as Student).gender : null,
        userData.userType === UserType.STUDENT ? (userData as Student).birthDate : null,
        userData.userType === UserType.SUPER_ADMIN ? true : false, // Super admin is auto verified
        userData.userType === UserType.TEACHER || userData.userType === UserType.STUDENT ? this.generateVerificationCode() : null,
        userData.userType === UserType.TEACHER || userData.userType === UserType.STUDENT ? new Date(Date.now() + 10 * 60 * 1000) : null, // 10 minutes
      ];

      const result = await client.query(query, values);
      await client.query('COMMIT');

      return this.mapDatabaseUserToUser(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get verification code for a teacher or student
  static async getVerificationCode(email: string): Promise<string | null> {
    const query = 'SELECT verification_code FROM users WHERE email = $1 AND user_type IN ($2, $3)';
    const result = await pool.query(query, [email, UserType.TEACHER, UserType.STUDENT]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].verification_code;
  }

  // Find user by email
  static async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseUserToUser(result.rows[0]);
  }

  // Find user by ID
  static async findById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseUserToUser(result.rows[0]);
  }

  // Check if super admin exists
  static async superAdminExists(): Promise<boolean> {
    const query = 'SELECT COUNT(*) FROM users WHERE user_type = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [UserType.SUPER_ADMIN]);
    return parseInt(result.rows[0].count) > 0;
  }

  // Verify email for teacher or student
  static async verifyEmail(email: string, code: string): Promise<boolean> {
    const query = `
      UPDATE users
      SET email_verified = true,
          verification_code = NULL,
          verification_code_expires = NULL,
          status = 'active'
      WHERE email = $1
        AND verification_code = $2
        AND verification_code_expires > CURRENT_TIMESTAMP
        AND user_type IN ('teacher', 'student')
    `;

    const result = await pool.query(query, [email, code]);
    return (result.rowCount || 0) > 0;
  }

  // Resend verification code
  static async resendVerificationCode(email: string): Promise<boolean> {
    const verificationCode = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const query = `
      UPDATE users
      SET verification_code = $1,
          verification_code_expires = $2
      WHERE email = $3
        AND user_type IN ('teacher', 'student')
        AND email_verified = false
    `;

    const result = await pool.query(query, [verificationCode, expiresAt, email]);
    return (result.rowCount || 0) > 0;
  }

  // Set password reset code
  static async setPasswordResetCode(email: string): Promise<string | null> {
    const resetCode = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const query = `
      UPDATE users
      SET password_reset_code = $1,
          password_reset_expires = $2
      WHERE email = $3
        AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [resetCode, expiresAt, email]);
    return (result.rowCount || 0) > 0 ? resetCode : null;
  }

  // Reset password with code
  static async resetPassword(email: string, code: string, newPassword: string): Promise<boolean> {
    const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const query = `
      UPDATE users
      SET password = $1,
          password_reset_code = NULL,
          password_reset_expires = NULL
      WHERE email = $2
        AND password_reset_code = $3
        AND password_reset_expires > CURRENT_TIMESTAMP
        AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [hashedPassword, email, code]);
    return (result.rowCount || 0) > 0;
  }

  // Get all users with pagination
  static async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: { key: string; order: 'asc' | 'desc' };
    deleted?: boolean;
  }): Promise<{ users: User[]; total: number; totalPages: number }> {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const offset = (page - 1) * limit;

    let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
    let searchClause = '';
    let searchValues: any[] = [];

    if (params.search) {
      searchClause = `AND (name ILIKE $1 OR email ILIKE $1)`;
      searchValues.push(`%${params.search}%`);
    }

    const sortKey = params.sortBy?.key || 'created_at';
    const sortOrder = params.sortBy?.order || 'desc';

    const countQuery = `
      SELECT COUNT(*) FROM users
      ${whereClause}
      ${searchClause}
    `;

    const dataQuery = `
      SELECT * FROM users
      ${whereClause}
      ${searchClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT $${searchValues.length + 1} OFFSET $${searchValues.length + 2}
    `;

    const countResult = await pool.query(countQuery, searchValues);
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(dataQuery, [...searchValues, limit, offset]);
    const users = dataResult.rows.map((row: any) => this.mapDatabaseUserToUser(row));

    return {
      users,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Update user
  static async update(id: string, updateData: Partial<User>): Promise<User | null> {
    const allowedFields = ['name', 'phone', 'address', 'bio', 'experience_years', 'status', 'student_phone', 'parent_phone', 'school_name', 'gender', 'birth_date'];
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDatabaseUserToUser(result.rows[0]);
  }

  // Soft delete user
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE users
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Generate verification code
  private static generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Map database user to User interface
  private static mapDatabaseUserToUser(dbUser: any): User {
    const baseUser = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      password: dbUser.password,
      userType: dbUser.user_type as UserType,
      status: dbUser.status as UserStatus,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };

    if (dbUser.user_type === UserType.SUPER_ADMIN) {
      return baseUser as SuperAdmin;
    }

    if (dbUser.user_type === UserType.TEACHER) {
      return {
        ...baseUser,
        phone: dbUser.phone,
        address: dbUser.address,
        bio: dbUser.bio,
        experienceYears: dbUser.experience_years,
        visitorId: dbUser.visitor_id,
        deviceInfo: dbUser.device_info,
      } as Teacher;
    }

    if (dbUser.user_type === UserType.STUDENT) {
      return {
        ...baseUser,
        studentPhone: dbUser.student_phone,
        parentPhone: dbUser.parent_phone,
        schoolName: dbUser.school_name,
        gender: dbUser.gender,
        birthDate: dbUser.birth_date,
      } as Student;
    }

    return baseUser as User;
  }
}

import bcrypt from 'bcryptjs';
import pool from '../config/database';
import { Student, SuperAdmin, Teacher, User, UserStatus, UserType } from '../types';

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
          auth_provider, oauth_provider_id,
          phone, address, bio, experience_years, visitor_id, device_info,
          student_phone, parent_phone, school_name, gender, birth_date,
          latitude, longitude, formatted_address, country, city, state, zipcode, street_name, suburb, location_confidence,
          email_verified, verification_code, verification_code_expires,
          password_reset_code, password_reset_expires,
          created_at, updated_at, deleted_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
          $29, $30, $31,
          $32, $33,
          $34, $35, $36
        ) RETURNING *;
      `;

      const values = [
        userData.name,
        userData.email,
        hashedPassword,
        userData.userType,
        userData.status || UserStatus.PENDING,

        // Auth provider fields
        (userData as any).authProvider || 'email',
        (userData as any).oauthProviderId || null,

        // Teacher fields
        userData.userType === UserType.TEACHER ? (userData as Teacher).phone : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).address : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).bio : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).experienceYears : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).visitorId : null,
        userData.userType === UserType.TEACHER ? (userData as Teacher).deviceInfo : null,

        // Student fields
        userData.userType === UserType.STUDENT ? (userData as Student).studentPhone : null,
        userData.userType === UserType.STUDENT ? (userData as Student).parentPhone : null,
        userData.userType === UserType.STUDENT ? (userData as Student).schoolName : null,
        userData.userType === UserType.STUDENT ? (userData as Student).gender : null,
        userData.userType === UserType.STUDENT ? (userData as Student).birthDate : null,

        // Location fields
        userData.latitude || null,
        userData.longitude || null,
        userData.formattedAddress || null,
        userData.country || null,
        userData.city || null,
        userData.state || null,
        userData.zipcode || null,
        userData.streetName || null,
        userData.suburb || null,
        userData.locationConfidence || null,

        // Verification
        userData.userType === UserType.SUPER_ADMIN ? true : false,
        userData.userType === UserType.TEACHER || userData.userType === UserType.STUDENT
          ? this.generateVerificationCode()
          : null,
        userData.userType === UserType.TEACHER || userData.userType === UserType.STUDENT
          ? new Date(Date.now() + 10 * 60 * 1000)
          : null,

        // Password reset
        null, // password_reset_code
        null, // password_reset_expires

        // Timestamps
        new Date(), // created_at
        new Date(), // updated_at
        null, // deleted_at
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

  // Get auth provider by email
  static async getAuthProviderByEmail(email: string): Promise<'email' | 'google' | null> {
    const query = 'SELECT auth_provider FROM users WHERE email = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [email]);
    if (result.rows.length === 0) return null;
    return result.rows[0].auth_provider as 'email' | 'google';
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
        AND verification_code_expires > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
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
    const allowedFields = [
      'name',
      'phone',
      'address',
      'bio',
      'experience_years',
      'status',
      'student_phone',
      'parent_phone',
      'school_name',
      'gender',
      'birth_date',
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
      'teacher_qr_image_path',
      'profile_image_path',
      // Intro video fields
      'intro_video_status',
      'intro_video_manifest_path',
      'intro_video_storage_dir',
      'intro_video_thumbnail_path',
      'intro_video_duration_seconds'
    ];

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
    paramCount++;
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

  // Find teachers by location with distance calculation
  static async findTeachersByLocation(
    latitude: number,
    longitude: number,
    maxDistance: number,
    limit: number,
    offset: number
  ): Promise<any[]> {
    const query = `
      SELECT
        u.*,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) *
            cos(radians(u.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(u.latitude))
          )
        ) as distance
      FROM users u
      WHERE u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND u.latitude IS NOT NULL
        AND u.longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians($1)) * cos(radians(u.latitude)) *
            cos(radians(u.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(u.latitude))
          )
        ) <= $3
      ORDER BY distance ASC
      LIMIT $4 OFFSET $5
    `;

    const result = await pool.query(query, [latitude, longitude, maxDistance, limit, offset]);
    return result.rows;
  }

  // Find teachers by location names
  static async findTeachersByLocationNames(
    limit: number,
    offset: number,
    state?: string,
    city?: string,
    suburb?: string
  ): Promise<any[]> {
    let query = `
      SELECT u.*
      FROM users u
      WHERE u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `;

    const values: any[] = [];
    let paramCount = 1;

    if (state) {
      query += ` AND u.state = $${paramCount}`;
      values.push(state);
      paramCount++;
    }

    if (city) {
      query += ` AND u.city = $${paramCount}`;
      values.push(city);
      paramCount++;
    }

    if (suburb) {
      query += ` AND u.suburb = $${paramCount}`;
      values.push(suburb);
      paramCount++;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
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
      authProvider: dbUser.auth_provider || undefined,
      oauthProviderId: dbUser.oauth_provider_id || undefined,
      latitude: dbUser.latitude,
      longitude: dbUser.longitude,
      formattedAddress: dbUser.formatted_address,
      country: dbUser.country,
      city: dbUser.city,
      state: dbUser.state,
      zipcode: dbUser.zipcode,
      streetName: dbUser.street_name,
      suburb: dbUser.suburb,
      locationConfidence: dbUser.location_confidence,
      profileImagePath: dbUser.profile_image_path,
      introVideoStatus: dbUser.intro_video_status,
      introVideoManifestPath: dbUser.intro_video_manifest_path,
      introVideoStorageDir: dbUser.intro_video_storage_dir,
      introVideoThumbnailPath: dbUser.intro_video_thumbnail_path,
      introVideoDurationSeconds: dbUser.intro_video_duration_seconds,
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
        gender: dbUser.gender,
        birthDate: dbUser.birth_date,
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

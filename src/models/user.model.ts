import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import pool from '../config/database';
import {
  Student,
  SuperAdmin,
  Teacher,
  User,
  UserStatus,
  UserType,
} from '../types';

/**
 * Result of an OTP verification attempt (verifyEmail / resetPassword).
 *
 * `ok = true` means the code matched and the side-effect (email_verified or
 * password changed) has been applied. Otherwise `reason` identifies which
 * specific failure occurred so the service can return a precise error message
 * without leaking account-enumeration signal.
 */
export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'no_code' | 'expired' | 'locked' | 'wrong'; attemptsRemaining?: number };

const OTP_MAX_ATTEMPTS = parseInt(process.env['OTP_MAX_ATTEMPTS'] || '5', 10);
const OTP_EXPIRY_MINUTES = parseInt(process.env['OTP_EXPIRY_MINUTES'] || '10', 10);

export class UserModel {
  // Normalize an email for storage and lookup.
  //
  // The `users.email` column is `citext` (migration 033), so DB-level
  // uniqueness and `WHERE email = $1` are already case-insensitive. We
  // still trim + lowercase on write so the stored representation is
  // uniform — useful for display, exports, and any future report that
  // does naive string comparison.
  //
  // Returns the normalized string. Pass-through for null / undefined /
  // empty so the caller's existing NOT NULL handling stays in charge.
  static normalizeEmail(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';
    return String(raw).trim().toLowerCase();
  }

  // Create a new user.
  //
  // For teachers and students that start in PENDING status, this method
  // generates a fresh 6-digit OTP, bcrypt-hashes it, and stores the HASH —
  // never the plaintext. The plaintext is returned alongside the user so the
  // caller (auth.service.ts) can deliver it by email. Once the function
  // returns, the plaintext only exists in the email; the database holds the
  // hash.
  //
  // For super_admin and for OAuth-created teacher/student accounts that are
  // immediately ACTIVE (Google/Apple), no OTP is generated and the returned
  // `plaintextVerificationCode` is null.
  //
  // Email is normalized (trimmed + lowercased) before insert. citext makes
  // lookups case-insensitive at the DB layer, but normalizing here keeps
  // stored values uniform.
  static async create(
    userData: Partial<User>,
  ): Promise<{ user: User; plaintextVerificationCode: string | null }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Hash password
      const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
      const hashedPassword = await bcrypt.hash(userData.password!, saltRounds);

      // Normalize email for storage (citext makes lookup case-insensitive
      // regardless, but uniform storage is good hygiene).
      const normalizedEmail = UserModel.normalizeEmail(userData.email);

      // Decide whether this user needs an email-verification OTP at creation
      // time. Email-based teacher/student registrations start PENDING and
      // need verification; OAuth users (Google/Apple) come in already ACTIVE
      // and don't need an OTP; super_admin doesn't need one.
      const needsOtp =
        (userData.userType === UserType.TEACHER ||
          userData.userType === UserType.STUDENT) &&
        (userData.status ?? UserStatus.PENDING) === UserStatus.PENDING;

      const plaintextVerificationCode = needsOtp
        ? UserModel.generateVerificationCode()
        : null;
      const hashedVerificationCode = plaintextVerificationCode
        ? await UserModel.hashOtp(plaintextVerificationCode)
        : null;
      const verificationExpiresAt = needsOtp
        ? new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
        : null;

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
        normalizedEmail,
        hashedPassword,
        userData.userType,
        userData.status || UserStatus.PENDING,

        // Auth provider fields
        (userData as any).authProvider || 'email',
        (userData as any).oauthProviderId || null,

        // Teacher fields
        userData.userType === UserType.TEACHER
          ? (userData as Teacher).phone
          : null,
        userData.userType === UserType.TEACHER
          ? (userData as Teacher).address
          : null,
        userData.userType === UserType.TEACHER
          ? (userData as Teacher).bio
          : null,
        userData.userType === UserType.TEACHER
          ? (userData as Teacher).experienceYears
          : null,
        userData.userType === UserType.TEACHER
          ? (userData as Teacher).visitorId
          : null,
        userData.userType === UserType.TEACHER
          ? (userData as Teacher).deviceInfo
          : null,

        // Student fields
        userData.userType === UserType.STUDENT
          ? (userData as Student).studentPhone
          : null,
        userData.userType === UserType.STUDENT
          ? (userData as Student).parentPhone
          : null,
        userData.userType === UserType.STUDENT
          ? (userData as Student).schoolName
          : null,
        userData.userType === UserType.STUDENT
          ? (userData as Student).gender
          : null,
        userData.userType === UserType.STUDENT
          ? (userData as Student).birthDate
          : null,

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

        // Verification — store the HASH of the OTP (or NULL when no OTP is needed).
        // email_verified=true for super_admin (no email step) and for OAuth-active users.
        userData.userType === UserType.SUPER_ADMIN ||
          (userData.status === UserStatus.ACTIVE &&
            (userData.userType === UserType.TEACHER ||
              userData.userType === UserType.STUDENT)),
        hashedVerificationCode,
        verificationExpiresAt,

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
      return {
        user: this.mapDatabaseUserToUser(result.rows[0]),
        plaintextVerificationCode,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // DEPRECATED — kept as a stub that always returns null so any forgotten
  // caller fails loudly. The plaintext verification code is now ONLY
  // available from `create()`'s return value and from `resendVerificationCode()`.
  // It is NEVER read back from the database (the DB only holds the hash).
  static async getVerificationCode(_email: string): Promise<string | null> {
    return null;
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
  static async getAuthProviderByEmail(
    email: string
  ): Promise<'email' | 'google' | null> {
    const query =
      'SELECT auth_provider FROM users WHERE email = $1 AND deleted_at IS NULL';
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
    const query =
      'SELECT COUNT(*) FROM users WHERE user_type = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [UserType.SUPER_ADMIN]);
    return parseInt(result.rows[0].count) > 0;
  }

  // Verify the email-verification OTP. Discriminated result lets the caller
  // distinguish "no such user", "expired", "wrong", and "too many attempts".
  //
  // Side effects on success: email_verified=true, status=active, code/expiry
  // wiped, attempts reset to 0.
  // Side effects on wrong: verification_code_attempts += 1.
  static async verifyEmail(
    email: string,
    submittedCode: string,
  ): Promise<OtpVerifyResult> {
    const lookup = await pool.query(
      `SELECT id, verification_code AS hash, verification_code_expires AS expires_at,
              verification_code_attempts AS attempts
         FROM users
        WHERE email = $1
          AND user_type IN ('teacher', 'student')
          AND deleted_at IS NULL`,
      [email],
    );

    if (lookup.rows.length === 0) {
      return { ok: false, reason: 'not_found' };
    }
    const row = lookup.rows[0];
    if (!row.hash || !row.expires_at) {
      return { ok: false, reason: 'no_code' };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      return { ok: false, reason: 'locked' };
    }

    const matches = await UserModel.compareOtp(submittedCode, row.hash);
    if (!matches) {
      // Atomic increment so two concurrent guesses can't both pass the
      // attempts ceiling.
      const inc = await pool.query(
        `UPDATE users
            SET verification_code_attempts = verification_code_attempts + 1
          WHERE id = $1
          RETURNING verification_code_attempts AS attempts`,
        [row.id],
      );
      const newAttempts = inc.rows[0]?.attempts ?? 0;
      return {
        ok: false,
        reason: newAttempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'wrong',
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - newAttempts),
      };
    }

    // Match — burn the code, activate the user, reset the counter.
    await pool.query(
      `UPDATE users
          SET email_verified = TRUE,
              status = 'active',
              verification_code = NULL,
              verification_code_expires = NULL,
              verification_code_attempts = 0
        WHERE id = $1`,
      [row.id],
    );
    return { ok: true };
  }

  // Issue a fresh verification OTP, hash it, reset the attempt counter, and
  // return the PLAINTEXT to the caller for emailing. The hash is what lives
  // in the database from this point on.
  //
  // Returns null when no eligible (unverified teacher/student) row exists.
  static async resendVerificationCode(email: string): Promise<string | null> {
    const plaintext = UserModel.generateVerificationCode();
    const hashed = await UserModel.hashOtp(plaintext);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const result = await pool.query(
      `UPDATE users
          SET verification_code          = $1,
              verification_code_expires  = $2,
              verification_code_attempts = 0
        WHERE email = $3
          AND user_type IN ('teacher', 'student')
          AND email_verified = FALSE
          AND deleted_at IS NULL`,
      [hashed, expiresAt, email],
    );

    return (result.rowCount ?? 0) > 0 ? plaintext : null;
  }

  // Issue a password-reset OTP. Same pattern: hash in DB, plaintext returned
  // to the caller for emailing. Reset the attempt counter on issue.
  //
  // Returns null when the user doesn't exist (or is soft-deleted).
  static async setPasswordResetCode(email: string): Promise<string | null> {
    const plaintext = UserModel.generateVerificationCode();
    const hashed = await UserModel.hashOtp(plaintext);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const result = await pool.query(
      `UPDATE users
          SET password_reset_code          = $1,
              password_reset_expires       = $2,
              password_reset_code_attempts = 0
        WHERE email = $3
          AND deleted_at IS NULL`,
      [hashed, expiresAt, email],
    );

    return (result.rowCount ?? 0) > 0 ? plaintext : null;
  }

  // Verify the password-reset OTP and, on success, persist the new password.
  // Same discriminated-result pattern as verifyEmail.
  static async resetPassword(
    email: string,
    submittedCode: string,
    newPassword: string,
  ): Promise<OtpVerifyResult> {
    const lookup = await pool.query(
      `SELECT id, password_reset_code AS hash, password_reset_expires AS expires_at,
              password_reset_code_attempts AS attempts
         FROM users
        WHERE email = $1
          AND deleted_at IS NULL`,
      [email],
    );

    if (lookup.rows.length === 0) {
      return { ok: false, reason: 'not_found' };
    }
    const row = lookup.rows[0];
    if (!row.hash || !row.expires_at) {
      return { ok: false, reason: 'no_code' };
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      return { ok: false, reason: 'locked' };
    }

    const matches = await UserModel.compareOtp(submittedCode, row.hash);
    if (!matches) {
      const inc = await pool.query(
        `UPDATE users
            SET password_reset_code_attempts = password_reset_code_attempts + 1
          WHERE id = $1
          RETURNING password_reset_code_attempts AS attempts`,
        [row.id],
      );
      const newAttempts = inc.rows[0]?.attempts ?? 0;
      return {
        ok: false,
        reason: newAttempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'wrong',
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - newAttempts),
      };
    }

    // Match — rotate password, burn the code.
    const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12', 10);
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await pool.query(
      `UPDATE users
          SET password                     = $1,
              password_reset_code          = NULL,
              password_reset_expires       = NULL,
              password_reset_code_attempts = 0
        WHERE id = $2`,
      [newPasswordHash, row.id],
    );

    return { ok: true };
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

    let whereClause = params.deleted
      ? 'WHERE deleted_at IS NOT NULL'
      : 'WHERE deleted_at IS NULL';
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

    const dataResult = await pool.query(dataQuery, [
      ...searchValues,
      limit,
      offset,
    ]);
    const users = dataResult.rows.map((row: any) =>
      this.mapDatabaseUserToUser(row)
    );

    return {
      users,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Update user
  static async update(
    id: string,
    updateData: Partial<User>
  ): Promise<User | null> {
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
      'intro_video_duration_seconds',
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

  // ---------------------------------------------------------------------------
  // OTP helpers
  // ---------------------------------------------------------------------------
  // Crypto-secure 6-digit code. randomInt is cryptographically random;
  // Math.random is not.
  private static generateVerificationCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  // bcrypt-hash the OTP for at-rest storage. Re-uses BCRYPT_ROUNDS so the
  // operator has one knob for all password-like material.
  private static async hashOtp(code: string): Promise<string> {
    const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12', 10);
    return bcrypt.hash(code, saltRounds);
  }

  // Constant-time compare via bcrypt. Returns false if hash is NULL/empty.
  private static async compareOtp(
    plaintext: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    if (!hash) return false;
    try {
      return await bcrypt.compare(plaintext, hash);
    } catch {
      return false;
    }
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

    const result = await pool.query(query, [
      latitude,
      longitude,
      maxDistance,
      limit,
      offset,
    ]);
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

  // Find students by ids and optional location fields
  static async findStudentsByIdsAndLocation(
    studentIds: string[],
    options: {
      state?: string | null;
      city?: string | null;
      suburb?: string | null;
    }
  ): Promise<any[]> {
    if (!studentIds || studentIds.length === 0) {
      return [];
    }

    let query = `
      SELECT u.*
      FROM users u
      WHERE u.user_type = 'student'
        AND u.deleted_at IS NULL
        AND u.id = ANY($1::uuid[])
    `;

    const values: any[] = [studentIds];
    let paramCount = 2;

    if (options.state) {
      query += ` AND u.state = $${paramCount}`;
      values.push(options.state);
      paramCount++;
    }

    if (options.city) {
      query += ` AND u.city = $${paramCount}`;
      values.push(options.city);
      paramCount++;
    }

    if (options.suburb) {
      query += ` AND u.suburb = $${paramCount}`;
      values.push(options.suburb);
      paramCount++;
    }

    query += ' ORDER BY u.created_at DESC';

    const result = await pool.query(query, values);
    return result.rows.map((row: any) => this.mapDatabaseUserToUser(row));
  }

  // Find active teachers alphabetically (fallback when no location)
  static async findTeachersAlphabetical(
    limit: number,
    offset: number,
    search?: string
  ): Promise<any[]> {
    let query = `
      SELECT u.*
      FROM users u
      WHERE u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `;
    const values: any[] = [];
    let param = 1;
    if (search && search.trim() !== '') {
      query += ` AND (u.name ILIKE $${param})`;
      values.push(`%${search.trim()}%`);
      param++;
    }
    query += ` ORDER BY u.name ASC LIMIT $${param} OFFSET $${param + 1}`;
    values.push(limit, offset);
    const r = await pool.query(query, values);
    return r.rows;
  }

  // Count active teachers matching optional search (for pagination)
  static async countTeachersAlphabetical(search?: string): Promise<number> {
    let query = `
      SELECT COUNT(*)::int AS count
      FROM users u
      WHERE u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `;
    const values: any[] = [];
    if (search && search.trim() !== '') {
      query += ` AND (u.name ILIKE $1)`;
      values.push(`%${search.trim()}%`);
    }
    const r = await pool.query(query, values);
    return r.rows[0]?.count ?? 0;
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

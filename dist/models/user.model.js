"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = __importDefault(require("../config/database"));
const types_1 = require("../types");
class UserModel {
    static async create(userData) {
        const client = await database_1.default.connect();
        try {
            await client.query('BEGIN');
            const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
            const hashedPassword = await bcryptjs_1.default.hash(userData.password, saltRounds);
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
                userData.status || types_1.UserStatus.PENDING,
                userData.authProvider || 'email',
                userData.oauthProviderId || null,
                userData.userType === types_1.UserType.TEACHER ? userData.phone : null,
                userData.userType === types_1.UserType.TEACHER ? userData.address : null,
                userData.userType === types_1.UserType.TEACHER ? userData.bio : null,
                userData.userType === types_1.UserType.TEACHER ? userData.experienceYears : null,
                userData.userType === types_1.UserType.TEACHER ? userData.visitorId : null,
                userData.userType === types_1.UserType.TEACHER ? userData.deviceInfo : null,
                userData.userType === types_1.UserType.STUDENT ? userData.studentPhone : null,
                userData.userType === types_1.UserType.STUDENT ? userData.parentPhone : null,
                userData.userType === types_1.UserType.STUDENT ? userData.schoolName : null,
                userData.userType === types_1.UserType.STUDENT ? userData.gender : null,
                userData.userType === types_1.UserType.STUDENT ? userData.birthDate : null,
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
                userData.userType === types_1.UserType.SUPER_ADMIN ? true : false,
                userData.userType === types_1.UserType.TEACHER || userData.userType === types_1.UserType.STUDENT
                    ? this.generateVerificationCode()
                    : null,
                userData.userType === types_1.UserType.TEACHER || userData.userType === types_1.UserType.STUDENT
                    ? new Date(Date.now() + 10 * 60 * 1000)
                    : null,
                null,
                null,
                new Date(),
                new Date(),
                null,
            ];
            const result = await client.query(query, values);
            await client.query('COMMIT');
            return this.mapDatabaseUserToUser(result.rows[0]);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    static async getVerificationCode(email) {
        const query = 'SELECT verification_code FROM users WHERE email = $1 AND user_type IN ($2, $3)';
        const result = await database_1.default.query(query, [email, types_1.UserType.TEACHER, types_1.UserType.STUDENT]);
        if (result.rows.length === 0) {
            return null;
        }
        return result.rows[0].verification_code;
    }
    static async findByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [email]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseUserToUser(result.rows[0]);
    }
    static async getAuthProviderByEmail(email) {
        const query = 'SELECT auth_provider FROM users WHERE email = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [email]);
        if (result.rows.length === 0)
            return null;
        return result.rows[0].auth_provider;
    }
    static async findById(id) {
        const query = 'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseUserToUser(result.rows[0]);
    }
    static async superAdminExists() {
        const query = 'SELECT COUNT(*) FROM users WHERE user_type = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [types_1.UserType.SUPER_ADMIN]);
        return parseInt(result.rows[0].count) > 0;
    }
    static async verifyEmail(email, code) {
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
        const result = await database_1.default.query(query, [email, code]);
        return (result.rowCount || 0) > 0;
    }
    static async resendVerificationCode(email) {
        const verificationCode = this.generateVerificationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const query = `
      UPDATE users
      SET verification_code = $1,
          verification_code_expires = $2
      WHERE email = $3
        AND user_type IN ('teacher', 'student')
        AND email_verified = false
    `;
        const result = await database_1.default.query(query, [verificationCode, expiresAt, email]);
        return (result.rowCount || 0) > 0;
    }
    static async setPasswordResetCode(email) {
        const resetCode = this.generateVerificationCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const query = `
      UPDATE users
      SET password_reset_code = $1,
          password_reset_expires = $2
      WHERE email = $3
        AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [resetCode, expiresAt, email]);
        return (result.rowCount || 0) > 0 ? resetCode : null;
    }
    static async resetPassword(email, code, newPassword) {
        const saltRounds = parseInt(process.env['BCRYPT_ROUNDS'] || '12');
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, saltRounds);
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
        const result = await database_1.default.query(query, [hashedPassword, email, code]);
        return (result.rowCount || 0) > 0;
    }
    static async findAll(params) {
        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;
        let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
        let searchClause = '';
        let searchValues = [];
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
        const countResult = await database_1.default.query(countQuery, searchValues);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(dataQuery, [...searchValues, limit, offset]);
        const users = dataResult.rows.map((row) => this.mapDatabaseUserToUser(row));
        return {
            users,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async update(id, updateData) {
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
            'profile_image_path'
        ];
        const updates = [];
        const values = [];
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
        const result = await database_1.default.query(query, values);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseUserToUser(result.rows[0]);
    }
    static async delete(id) {
        const query = `
      UPDATE users
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    static async findTeachersByLocation(latitude, longitude, maxDistance, limit, offset) {
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
        const result = await database_1.default.query(query, [latitude, longitude, maxDistance, limit, offset]);
        return result.rows;
    }
    static async findTeachersByLocationNames(limit, offset, state, city, suburb) {
        let query = `
      SELECT u.*
      FROM users u
      WHERE u.user_type = 'teacher'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `;
        const values = [];
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
        const result = await database_1.default.query(query, values);
        return result.rows;
    }
    static mapDatabaseUserToUser(dbUser) {
        const baseUser = {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            password: dbUser.password,
            userType: dbUser.user_type,
            status: dbUser.status,
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
            createdAt: dbUser.created_at,
            updatedAt: dbUser.updated_at,
        };
        if (dbUser.user_type === types_1.UserType.SUPER_ADMIN) {
            return baseUser;
        }
        if (dbUser.user_type === types_1.UserType.TEACHER) {
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
            };
        }
        if (dbUser.user_type === types_1.UserType.STUDENT) {
            return {
                ...baseUser,
                studentPhone: dbUser.student_phone,
                parentPhone: dbUser.parent_phone,
                schoolName: dbUser.school_name,
                gender: dbUser.gender,
                birthDate: dbUser.birth_date,
            };
        }
        return baseUser;
    }
}
exports.UserModel = UserModel;
//# sourceMappingURL=user.model.js.map
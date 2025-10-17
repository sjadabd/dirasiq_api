"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionPackageModel = void 0;
const database_1 = __importDefault(require("../config/database"));
class SubscriptionPackageModel {
    static async create(data) {
        const duplicateCheckQuery = `
      SELECT id FROM subscription_packages
      WHERE max_students = $1
        AND price = $2
        AND duration_days = $3
        AND is_free = $4
        AND deleted_at IS NULL
    `;
        const duplicateCheck = await database_1.default.query(duplicateCheckQuery, [
            data.maxStudents,
            data.price,
            data.durationDays,
            data.isFree || false
        ]);
        if (duplicateCheck.rows.length > 0) {
            throw new Error('Package with same specifications already exists');
        }
        const query = `
      INSERT INTO subscription_packages (
        name, description, max_students, price, duration_days, is_free
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
        const values = [
            data.name,
            data.description || null,
            data.maxStudents,
            data.price,
            data.durationDays,
            data.isFree || false
        ];
        const result = await database_1.default.query(query, values);
        return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
    }
    static async findById(id) {
        const query = 'SELECT * FROM subscription_packages WHERE id = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [id]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
    }
    static async findByName(name) {
        const query = 'SELECT * FROM subscription_packages WHERE name = $1 AND deleted_at IS NULL';
        const result = await database_1.default.query(query, [name]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
    }
    static async findBySpecifications(specs) {
        const query = `
      SELECT * FROM subscription_packages
      WHERE max_students = $1
        AND price = $2
        AND duration_days = $3
        AND is_free = $4
        AND deleted_at IS NULL
      LIMIT 1
    `;
        const result = await database_1.default.query(query, [
            specs.maxStudents,
            specs.price,
            specs.durationDays,
            specs.isFree
        ]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
    }
    static async findAll(params) {
        const page = params.page || 1;
        const limit = params.limit || 10;
        const offset = (page - 1) * limit;
        let whereClause = params.deleted ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
        let searchClause = '';
        let filterClause = '';
        let searchValues = [];
        let paramCount = 1;
        if (params.search) {
            searchClause = `AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
            searchValues.push(`%${params.search}%`);
            paramCount++;
        }
        if (params.isActive !== undefined) {
            filterClause += ` AND is_active = $${paramCount}`;
            searchValues.push(params.isActive);
            paramCount++;
        }
        if (params.isFree !== undefined) {
            filterClause += ` AND is_free = $${paramCount}`;
            searchValues.push(params.isFree);
            paramCount++;
        }
        const sortKey = params.sortBy?.key || 'created_at';
        const sortOrder = params.sortBy?.order || 'desc';
        const countQuery = `
      SELECT COUNT(*) FROM subscription_packages
      ${whereClause}
      ${searchClause}
      ${filterClause}
    `;
        const dataQuery = `
      SELECT * FROM subscription_packages
      ${whereClause}
      ${searchClause}
      ${filterClause}
      ORDER BY ${sortKey} ${sortOrder.toUpperCase()}
      LIMIT ${limit} OFFSET ${offset}
    `;
        const countResult = await database_1.default.query(countQuery, searchValues);
        const total = parseInt(countResult.rows[0].count);
        const dataResult = await database_1.default.query(dataQuery, searchValues);
        const packages = dataResult.rows.map((row) => this.mapDatabaseToSubscriptionPackage(row));
        return {
            packages,
            total,
            totalPages: Math.ceil(total / limit)
        };
    }
    static async update(id, updateData) {
        const allowedFields = ['name', 'description', 'max_students', 'price', 'duration_days', 'is_free', 'is_active'];
        const updates = [];
        const values = [];
        let paramCount = 1;
        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                const dbField = key === 'maxStudents' ? 'max_students' :
                    key === 'durationDays' ? 'duration_days' :
                        key === 'isFree' ? 'is_free' :
                            key === 'isActive' ? 'is_active' : key;
                updates.push(`${dbField} = $${paramCount}`);
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
      UPDATE subscription_packages
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
        const result = await database_1.default.query(query, values);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
    }
    static async activate(id) {
        const query = `
      UPDATE subscription_packages
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async deactivate(id) {
        const query = `
      UPDATE subscription_packages
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async delete(id) {
        const query = `
      UPDATE subscription_packages
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;
        const result = await database_1.default.query(query, [id]);
        return (result.rowCount || 0) > 0;
    }
    static async getActivePackages(teacher_id) {
        try {
            const packagesQuery = `
        SELECT *
        FROM subscription_packages
        WHERE is_active = true
          AND deleted_at IS NULL
        ORDER BY price ASC, max_students ASC
      `;
            const { rows: packages } = await database_1.default.query(packagesQuery);
            if (!teacher_id) {
                return packages.map((row) => ({
                    ...this.mapDatabaseToSubscriptionPackage(row),
                    current: false,
                }));
            }
            const activeSubQuery = `
        SELECT subscription_package_id
        FROM teacher_subscriptions
        WHERE teacher_id = $1
          AND is_active = true
          AND deleted_at IS NULL
        LIMIT 1
      `;
            const { rows: activeSub } = await database_1.default.query(activeSubQuery, [teacher_id]);
            const currentPackageId = activeSub.length ? activeSub[0].subscription_package_id : null;
            const result = packages.map((row) => {
                const mapped = this.mapDatabaseToSubscriptionPackage(row);
                return {
                    ...mapped,
                    current: mapped.id === currentPackageId,
                };
            });
            return result;
        }
        catch (error) {
            console.error('❌ Error in getActivePackages:', error);
            throw error;
        }
    }
    static async getFreePackage() {
        const query = `
      SELECT * FROM subscription_packages
      WHERE is_free = true AND is_active = true AND deleted_at IS NULL
      LIMIT 1
    `;
        const result = await database_1.default.query(query);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDatabaseToSubscriptionPackage(result.rows[0]);
    }
    static mapDatabaseToSubscriptionPackage(dbPackage) {
        return {
            id: dbPackage.id,
            name: dbPackage.name,
            description: dbPackage.description,
            maxStudents: dbPackage.max_students,
            price: parseFloat(dbPackage.price),
            durationDays: dbPackage.duration_days,
            isFree: dbPackage.is_free,
            isActive: dbPackage.is_active,
            createdAt: dbPackage.created_at,
            updatedAt: dbPackage.updated_at,
            current: false
        };
    }
}
exports.SubscriptionPackageModel = SubscriptionPackageModel;
//# sourceMappingURL=subscription-package.model.js.map
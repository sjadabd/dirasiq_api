import pool from '@/config/database';
import { CreateNewsRequest, News, NewsType, UpdateNewsRequest } from '@/types';

export class NewsModel {
  private static mapRowToNews(row: any): News {
    return {
      id: row.id,
      title: row.title,
      imageUrl: row.image_url ?? undefined,
      details: row.details,
      newsType: (row.news_type as NewsType) ?? NewsType.WEB_AND_MOBILE,
      isActive: row.is_active,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    };
  }

  // Create new news
  static async create(data: CreateNewsRequest): Promise<News> {
    const query = `
      INSERT INTO news (title, image_url, details, news_type)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [
      data.title,
      data.imageUrl || null,
      data.details,
      (data.newsType || NewsType.WEB_AND_MOBILE)
    ]);
    return this.mapRowToNews(result.rows[0]);
  }

  // Find news by ID
  static async findById(id: string): Promise<News | null> {
    const query = 'SELECT * FROM news WHERE id = $1 AND deleted_at IS NULL';
    const result = await pool.query(query, [id]);
    const row = result.rows[0];
    return row ? this.mapRowToNews(row) : null;
  }

  // Get all news with pagination and optional search
  static async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    isActive?: boolean,
    newsTypes?: NewsType[]
  ): Promise<{ news: News[]; total: number }> {
    let query = 'SELECT * FROM news';
    let countQuery = 'SELECT COUNT(*) FROM news';
    const params: any[] = [];
    let paramIndex = 1;
    let whereConditions: string[] = ['deleted_at IS NULL'];

    // Add search condition
    if (search && search.trim() !== '' && search !== 'null' && search !== 'undefined') {
      whereConditions.push(`title ILIKE $${paramIndex}`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Add is_active condition
    if (isActive !== undefined) {
      whereConditions.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    // Add news_type condition (supports multiple values)
    if (newsTypes && newsTypes.length > 0) {
      whereConditions.push(`news_type = ANY($${paramIndex}::text[])`);
      params.push(newsTypes);
      paramIndex++;
    }

    // Combine conditions
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // Ordering
    query += ' ORDER BY published_at DESC, created_at DESC';

    // Pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    // Execute queries
    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, params.slice(0, paramIndex - 1))
    ]);

    return {
      news: result.rows.map(this.mapRowToNews),
      total: parseInt(countResult.rows[0].count)
    };
  }

  // Update news
  static async update(id: string, data: UpdateNewsRequest): Promise<News | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex}`);
      values.push(data.title);
      paramIndex++;
    }
    if (data.imageUrl !== undefined) {
      fields.push(`image_url = $${paramIndex}`);
      values.push(data.imageUrl);
      paramIndex++;
    }
    if (data.details !== undefined) {
      fields.push(`details = $${paramIndex}`);
      values.push(data.details);
      paramIndex++;
    }
    if (data.newsType !== undefined) {
      fields.push(`news_type = $${paramIndex}`);
      values.push(data.newsType);
      paramIndex++;
    }
    if (data.isActive !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE news
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);
    const row = result.rows[0];
    return row ? this.mapRowToNews(row) : null;
  }

  // Soft delete news
  static async delete(id: string): Promise<boolean> {
    const query = `
      UPDATE news
      SET deleted_at = CURRENT_TIMESTAMP, is_active = false
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  // Check if news exists
  static async exists(id: string): Promise<boolean> {
    const query = 'SELECT EXISTS(SELECT 1 FROM news WHERE id = $1 AND deleted_at IS NULL)';
    const result = await pool.query(query, [id]);
    return result.rows[0].exists;
  }

  // Publish news (set published_at = now)
  static async publish(id: string): Promise<News | null> {
    const query = `
      UPDATE news
      SET is_active = true, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    const row = result.rows[0];
    return row ? this.mapRowToNews(row) : null;
  }
}

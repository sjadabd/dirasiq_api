import pool from '../config/database';

export class AppSettingModel {
  static async get(
    key: string
  ): Promise<{ key: string; value: string; valueType: string } | null> {
    const r = await pool.query(
      'SELECT key, value, value_type FROM app_settings WHERE key = $1',
      [key]
    );
    return r.rows[0] || null;
  }

  static async upsert(options: {
    key: string;
    value: string;
    valueType?: string;
    updatedBy?: string | null;
  }): Promise<{ key: string; value: string; valueType: string }> {
    const q = `
      INSERT INTO app_settings (key, value, value_type, updated_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        value_type = EXCLUDED.value_type,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING key, value, value_type
    `;
    const r = await pool.query(q, [
      options.key,
      options.value,
      options.valueType || 'string',
      options.updatedBy || null,
    ]);
    return {
      key: r.rows[0].key,
      value: r.rows[0].value,
      valueType: r.rows[0].value_type,
    };
  }
}

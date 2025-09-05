// drop-all-tables.js
const { Pool } = require('pg');
require('dotenv').config();

// إعداد الاتصال بقاعدة البيانات
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dirasiq_db',
  password: 'Mlak1212@Mlak1212',
  port: 5432,
});

async function dropAllTables() {
  const client = await pool.connect();
  try {
    console.log('🚨 بدء حذف جميع الجداول...');

    await client.query('BEGIN');

    // تعطيل العلاقات المؤقتًا
    await client.query('SET session_replication_role = replica;');

    // جلب أسماء الجداول
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);

    for (const row of result.rows) {
      const tableName = row.tablename;
      console.log(`🗑️ حذف الجدول: ${tableName}`);
      await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
    }

    // إعادة تفعيل العلاقات
    await client.query('SET session_replication_role = origin;');

    await client.query('COMMIT');
    console.log('✅ تم حذف جميع الجداول بنجاح.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ فشل حذف الجداول:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

dropAllTables();

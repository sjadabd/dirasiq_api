const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: "localhost",
  port: "5432",
  database: "dirasiq_db",
  user: "postgres",
  password: 'Mlak1212@Mlak1212'
});


(async () => {
  try {
    const result = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    console.table(result.rows);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error querying tables:', err);
    process.exit(1);
  }
})();

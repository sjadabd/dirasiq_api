import pool from '@/config/database';
import fs from 'fs';
import path from 'path';

export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🔄 Initializing database...');

    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Execute in alphabetical order

    console.log(`📁 Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      console.log(`🔄 Executing migration: ${file}`);

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await pool.query(sql);
      console.log(`✅ Migration ${file} executed successfully`);
    }

    console.log('🎉 Database initialization completed successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ Database setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database setup failed:', error);
      process.exit(1);
    });
}
